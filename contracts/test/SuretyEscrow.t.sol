// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SuretyEscrow} from "../src/SuretyEscrow.sol";
import {HookToken, Mock18Decimals, MockUSDC, Reenterer} from "./mocks/MockUSDC.sol";

contract SuretyEscrowTest is Test {
    SuretyEscrow internal escrow;
    MockUSDC internal usdc;

    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal keeper = makeAddr("keeper");
    address internal arbiter = makeAddr("arbiter");

    uint256 internal constant USDC = 1e6;
    uint256 internal constant BOND = 100 * USDC;
    uint256 internal constant AMOUNT = 10 * USDC;
    uint256 internal constant PENALTY = 1 * USDC;
    uint16 internal constant PENALTY_BPS = 1_000;
    uint32 internal constant MIN_DELIVERY = 60;
    uint32 internal constant DELIVERY = 1 hours;
    uint32 internal constant OBJECTION = 10 minutes;
    bytes32 internal constant JOB = keccak256("job");
    bytes32 internal constant PROOF = keccak256("proof");

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new SuretyEscrow(IERC20(address(usdc)));
        vm.warp(1_800_000_000);

        usdc.mint(seller, 1_000 * USDC);
        usdc.mint(buyer, 1_000 * USDC);
        vm.prank(seller);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(buyer);
        usdc.approve(address(escrow), type(uint256).max);

        _register(seller, address(0));
        _addBond(BOND);
    }

    function _register(address who, address who_arbiter) internal {
        vm.prank(who);
        escrow.register(PENALTY_BPS, MIN_DELIVERY, OBJECTION, who_arbiter);
    }

    function _addBond(uint256 amount) internal {
        vm.prank(seller);
        escrow.addBond(amount);
    }

    function _pay() internal returns (uint256) {
        vm.prank(buyer);
        return escrow.pay(seller, AMOUNT, DELIVERY, JOB);
    }

    function _deliver(uint256 id) internal {
        vm.prank(seller);
        escrow.deliver(id, PROOF);
    }

    function _status(uint256 id) internal view returns (SuretyEscrow.Status) {
        return escrow.getPayment(id).status;
    }

    function _arbitratedSeller() internal returns (address who) {
        who = makeAddr("arbitratedSeller");
        usdc.mint(who, 1_000 * USDC);
        vm.startPrank(who);
        usdc.approve(address(escrow), type(uint256).max);
        escrow.register(PENALTY_BPS, MIN_DELIVERY, OBJECTION, arbiter);
        escrow.addBond(BOND);
        vm.stopPrank();
    }

    function _payAndDeliverTo(address who) internal returns (uint256 id) {
        vm.prank(buyer);
        id = escrow.pay(who, AMOUNT, DELIVERY, JOB);
        vm.prank(who);
        escrow.deliver(id, PROOF);
    }

    // ---------------------------------------------------------------------
    // Happy path
    // ---------------------------------------------------------------------

    function test_pay_escrowsFundsAndLocksPenalty() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);

        vm.expectEmit(true, true, true, true);
        emit SuretyEscrow.Paid(1, buyer, seller, AMOUNT, PENALTY, uint64(block.timestamp + DELIVERY), JOB);
        uint256 id = _pay();

        assertEq(id, 1);
        assertEq(usdc.balanceOf(buyer), buyerBefore - AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), BOND + AMOUNT);

        SuretyEscrow.Payment memory p = escrow.getPayment(id);
        assertEq(p.buyer, buyer);
        assertEq(p.seller, seller);
        assertEq(p.amount, AMOUNT);
        assertEq(p.penalty, PENALTY);
        assertEq(p.jobRef, JOB);
        assertEq(p.deliverBy, block.timestamp + DELIVERY);
        assertEq(uint8(p.status), uint8(SuretyEscrow.Status.Pending));

        assertEq(escrow.sellerStats(seller).lockedBond, PENALTY);
        assertEq(escrow.freeBond(seller), BOND - PENALTY);
    }

    function test_happyPath_settleReleasesAfterObjectionWindow() public {
        uint256 id = _pay();

        vm.expectEmit(true, true, false, true);
        emit SuretyEscrow.Delivered(id, seller, PROOF, uint64(block.timestamp + OBJECTION));
        _deliver(id);

        assertEq(escrow.getPayment(id).proofHash, PROOF);
        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Delivered));

        vm.warp(block.timestamp + OBJECTION + 1);
        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(keeper);
        escrow.settle(id);

        assertEq(usdc.balanceOf(seller), sellerBefore + AMOUNT);
        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Released));

        SuretyEscrow.Seller memory s = escrow.sellerStats(seller);
        assertEq(s.delivered, 1);
        assertEq(s.refunded, 0);
        assertEq(s.bond, BOND);
        assertEq(s.lockedBond, 0);
        assertEq(escrow.reliabilityBps(seller), 10_000);
    }

    function test_release_buyerAcceptsEarly() public {
        uint256 id = _pay();
        _deliver(id);

        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(buyer);
        escrow.release(id);

        assertEq(usdc.balanceOf(seller), sellerBefore + AMOUNT);
        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Released));
    }

    function test_release_revertsForOthersAndBeforeDelivery() public {
        uint256 id = _pay();
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.release(id);

        _deliver(id);
        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.NotBuyer.selector);
        escrow.release(id);
    }

    function test_deliver_atDeadlineSucceeds() public {
        uint256 id = _pay();
        vm.warp(block.timestamp + DELIVERY);
        _deliver(id);
        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Delivered));
    }

    function test_deliver_reverts() public {
        uint256 id = _pay();

        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.NotSeller.selector);
        escrow.deliver(id, PROOF);

        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.ZeroProof.selector);
        escrow.deliver(id, bytes32(0));

        vm.warp(block.timestamp + DELIVERY + 1);
        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.TooLate.selector);
        escrow.deliver(id, PROOF);
    }

    function test_deliver_cannotRepeat() public {
        uint256 id = _pay();
        _deliver(id);
        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.deliver(id, PROOF);
    }

    function test_deliver_unknownPaymentReverts() public {
        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.NotSeller.selector);
        escrow.deliver(999, PROOF);
    }

    // ---------------------------------------------------------------------
    // Timeout refund and penalty
    // ---------------------------------------------------------------------

    function test_timeout_refundsBuyerWithPenalty() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 id = _pay();

        vm.warp(block.timestamp + DELIVERY + 1);
        vm.expectEmit(true, true, false, true);
        emit SuretyEscrow.Refunded(id, buyer, AMOUNT, PENALTY);
        vm.prank(keeper);
        escrow.settle(id);

        assertEq(usdc.balanceOf(buyer), buyerBefore + PENALTY);
        assertEq(usdc.balanceOf(address(escrow)), BOND - PENALTY);
        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Refunded));

        SuretyEscrow.Seller memory s = escrow.sellerStats(seller);
        assertEq(s.refunded, 1);
        assertEq(s.delivered, 0);
        assertEq(s.bond, BOND - PENALTY);
        assertEq(s.lockedBond, 0);
        assertEq(escrow.reliabilityBps(seller), 0);
    }

    function test_settle_revertsBeforeDeliveryDeadline() public {
        uint256 id = _pay();
        vm.warp(block.timestamp + DELIVERY);
        vm.expectRevert(SuretyEscrow.TooEarly.selector);
        escrow.settle(id);
    }

    function test_settle_revertsBeforeObjectionDeadline() public {
        uint256 id = _pay();
        _deliver(id);
        vm.warp(block.timestamp + OBJECTION);
        vm.expectRevert(SuretyEscrow.TooEarly.selector);
        escrow.settle(id);
    }

    function test_settle_cannotRepeat() public {
        uint256 id = _pay();
        vm.warp(block.timestamp + DELIVERY + 1);
        escrow.settle(id);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.settle(id);
    }

    function test_settle_unknownPaymentReverts() public {
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.settle(999);
    }

    function test_reliability_isDeliveredShareOfFinishedPayments() public {
        for (uint256 i; i < 3; i++) {
            uint256 good = _pay();
            _deliver(good);
            vm.prank(buyer);
            escrow.release(good);
        }
        uint256 bad = _pay();
        vm.warp(block.timestamp + DELIVERY + 1);
        escrow.settle(bad);

        assertEq(escrow.reliabilityBps(seller), 7_500);
    }

    function test_reliability_isZeroForUnknownSeller() public view {
        assertEq(escrow.reliabilityBps(keeper), 0);
        assertFalse(escrow.sellerStats(keeper).registered);
    }

    // ---------------------------------------------------------------------
    // Decline
    // ---------------------------------------------------------------------

    function test_decline_refundsWithoutPenalty() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 id = _pay();

        vm.prank(seller);
        escrow.decline(id);

        assertEq(usdc.balanceOf(buyer), buyerBefore);
        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Refunded));

        SuretyEscrow.Seller memory s = escrow.sellerStats(seller);
        assertEq(s.bond, BOND);
        assertEq(s.lockedBond, 0);
        assertEq(s.declined, 1);
        assertEq(s.refunded, 0);
    }

    function test_decline_cannotDodgePenaltyAfterDeadline() public {
        uint256 id = _pay();
        vm.warp(block.timestamp + DELIVERY + 1);
        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.TooLate.selector);
        escrow.decline(id);
    }

    function test_decline_reverts() public {
        uint256 id = _pay();
        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.NotSeller.selector);
        escrow.decline(id);

        _deliver(id);
        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.decline(id);
    }

    // ---------------------------------------------------------------------
    // Objection, MVP rule
    // ---------------------------------------------------------------------

    function test_object_mvpRuleRefundsAndSlashes() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 id = _pay();
        _deliver(id);

        vm.expectEmit(true, true, false, true);
        emit SuretyEscrow.Refunded(id, buyer, AMOUNT, PENALTY);
        vm.prank(buyer);
        escrow.object(id);

        assertEq(usdc.balanceOf(buyer), buyerBefore + PENALTY);
        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Refunded));

        SuretyEscrow.Seller memory s = escrow.sellerStats(seller);
        assertEq(s.objected, 1);
        assertEq(s.refunded, 1);
        assertEq(s.bond, BOND - PENALTY);
        assertEq(s.lockedBond, 0);
    }

    function test_object_reverts() public {
        uint256 id = _pay();

        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.object(id);

        _deliver(id);
        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.NotBuyer.selector);
        escrow.object(id);

        vm.warp(block.timestamp + OBJECTION + 1);
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.TooLate.selector);
        escrow.object(id);
    }

    function test_object_atDeadlineSucceeds() public {
        uint256 id = _pay();
        _deliver(id);
        vm.warp(block.timestamp + OBJECTION);
        vm.prank(buyer);
        escrow.object(id);
        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Refunded));
    }

    // ---------------------------------------------------------------------
    // Objection, arbiter
    // ---------------------------------------------------------------------

    function test_arbiter_refundsBuyer() public {
        address who = _arbitratedSeller();
        uint256 id = _payAndDeliverTo(who);

        vm.prank(buyer);
        escrow.object(id);
        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Disputed));

        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.prank(arbiter);
        escrow.resolve(id, true);

        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT + PENALTY);
        assertEq(escrow.sellerStats(who).bond, BOND - PENALTY);
        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Refunded));
    }

    function test_arbiter_paysSeller() public {
        address who = _arbitratedSeller();
        uint256 id = _payAndDeliverTo(who);

        vm.prank(buyer);
        escrow.object(id);

        uint256 sellerBefore = usdc.balanceOf(who);
        vm.prank(arbiter);
        escrow.resolve(id, false);

        assertEq(usdc.balanceOf(who), sellerBefore + AMOUNT);
        SuretyEscrow.Seller memory s = escrow.sellerStats(who);
        assertEq(s.bond, BOND);
        assertEq(s.lockedBond, 0);
        assertEq(s.delivered, 1);
        assertEq(s.objected, 1);
    }

    function test_arbiter_absentArbiterDefaultsToRefund() public {
        address who = _arbitratedSeller();
        uint256 id = _payAndDeliverTo(who);

        vm.prank(buyer);
        escrow.object(id);

        vm.warp(block.timestamp + escrow.ARBITER_WINDOW());
        vm.expectRevert(SuretyEscrow.TooEarly.selector);
        escrow.settle(id);

        vm.warp(block.timestamp + 1);
        uint256 buyerBefore = usdc.balanceOf(buyer);
        escrow.settle(id);
        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT + PENALTY);
    }

    function test_resolve_reverts() public {
        address who = _arbitratedSeller();
        uint256 id = _payAndDeliverTo(who);

        vm.prank(arbiter);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.resolve(id, true);

        vm.prank(buyer);
        escrow.object(id);

        vm.prank(who);
        vm.expectRevert(SuretyEscrow.NotArbiter.selector);
        escrow.resolve(id, false);
    }

    function test_resolve_revertsWhenSellerHasNoArbiter() public {
        uint256 id = _pay();
        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.NotArbiter.selector);
        escrow.resolve(id, true);
    }

    // ---------------------------------------------------------------------
    // Bond accounting
    // ---------------------------------------------------------------------

    function test_bond_topUpAndWithdrawUnlocked() public {
        _addBond(5 * USDC);
        assertEq(escrow.sellerStats(seller).bond, BOND + 5 * USDC);

        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(seller);
        escrow.withdrawBond(BOND + 5 * USDC);

        assertEq(usdc.balanceOf(seller), sellerBefore + BOND + 5 * USDC);
        assertEq(escrow.sellerStats(seller).bond, 0);
    }

    function test_bond_cannotWithdrawLockedBond() public {
        _pay();
        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.withdrawBond(BOND - PENALTY + 1);

        vm.prank(seller);
        escrow.withdrawBond(BOND - PENALTY);
        assertEq(escrow.freeBond(seller), 0);
        assertEq(escrow.sellerStats(seller).bond, PENALTY);
    }

    function test_bond_lockReleasedAfterDelivery() public {
        uint256 id = _pay();
        _deliver(id);
        assertEq(escrow.sellerStats(seller).lockedBond, PENALTY);

        vm.prank(buyer);
        escrow.release(id);
        assertEq(escrow.sellerStats(seller).lockedBond, 0);
        assertEq(escrow.freeBond(seller), BOND);
    }

    function test_bond_locksAddUpAcrossOpenPayments() public {
        _pay();
        _pay();
        uint256 third = _pay();
        assertEq(escrow.sellerStats(seller).lockedBond, 3 * PENALTY);

        vm.warp(block.timestamp + DELIVERY + 1);
        escrow.settle(third);

        SuretyEscrow.Seller memory s = escrow.sellerStats(seller);
        assertEq(s.lockedBond, 2 * PENALTY);
        assertEq(s.bond, BOND - PENALTY);
    }

    function test_bond_addRequiresRegistration() public {
        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.NotRegistered.selector);
        escrow.addBond(1);
    }

    function test_bond_zeroAmountsRevert() public {
        vm.startPrank(seller);
        vm.expectRevert(SuretyEscrow.ZeroAmount.selector);
        escrow.addBond(0);
        vm.expectRevert(SuretyEscrow.ZeroAmount.selector);
        escrow.withdrawBond(0);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------
    // Insufficient bond
    // ---------------------------------------------------------------------

    function test_pay_revertsWhenBondCannotCoverPenalty() public {
        vm.prank(seller);
        escrow.withdrawBond(BOND - PENALTY + 1);

        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.pay(seller, AMOUNT, DELIVERY, JOB);
    }

    function test_pay_lockedBondDoesNotCoverNewPayments() public {
        vm.prank(seller);
        escrow.withdrawBond(BOND - PENALTY);

        _pay();
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.pay(seller, AMOUNT, DELIVERY, JOB);
    }

    function test_pay_zeroPenaltySellerNeedsNoBond() public {
        address recipient = makeAddr("recipient");
        vm.prank(recipient);
        escrow.register(0, MIN_DELIVERY, OBJECTION, address(0));

        vm.prank(buyer);
        uint256 id = escrow.pay(recipient, AMOUNT, DELIVERY, JOB);
        assertEq(escrow.getPayment(id).penalty, 0);

        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.warp(block.timestamp + DELIVERY + 1);
        escrow.settle(id);
        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT);
    }

    // ---------------------------------------------------------------------
    // Registration and input checks
    // ---------------------------------------------------------------------

    function test_register_setsTerms() public {
        address who = _arbitratedSeller();
        SuretyEscrow.Seller memory s = escrow.sellerStats(who);
        assertTrue(s.registered);
        assertEq(s.penaltyBps, PENALTY_BPS);
        assertEq(s.minDeliveryWindow, MIN_DELIVERY);
        assertEq(s.objectionWindow, OBJECTION);
        assertEq(s.arbiter, arbiter);
    }

    function test_register_revertsOnSecondCall() public {
        vm.expectRevert(SuretyEscrow.AlreadyRegistered.selector);
        _register(seller, address(0));
    }

    function test_register_rejectsBadTerms() public {
        uint32 maxDelivery = escrow.MAX_DELIVERY_WINDOW();
        uint32 minObjection = escrow.MIN_OBJECTION_WINDOW();
        uint32 maxObjection = escrow.MAX_OBJECTION_WINDOW();

        vm.startPrank(keeper);
        vm.expectRevert(SuretyEscrow.BadTerms.selector);
        escrow.register(10_001, MIN_DELIVERY, OBJECTION, address(0));
        vm.expectRevert(SuretyEscrow.BadTerms.selector);
        escrow.register(PENALTY_BPS, 0, OBJECTION, address(0));
        vm.expectRevert(SuretyEscrow.BadTerms.selector);
        escrow.register(PENALTY_BPS, maxDelivery + 1, OBJECTION, address(0));
        vm.expectRevert(SuretyEscrow.BadTerms.selector);
        escrow.register(PENALTY_BPS, MIN_DELIVERY, minObjection - 1, address(0));
        vm.expectRevert(SuretyEscrow.BadTerms.selector);
        escrow.register(PENALTY_BPS, MIN_DELIVERY, maxObjection + 1, address(0));
        vm.expectRevert(SuretyEscrow.BadTerms.selector);
        escrow.register(PENALTY_BPS, MIN_DELIVERY, OBJECTION, keeper);
        vm.stopPrank();
    }

    function test_pay_rejectsBadInput() public {
        vm.startPrank(buyer);
        vm.expectRevert(SuretyEscrow.NotRegistered.selector);
        escrow.pay(keeper, AMOUNT, DELIVERY, JOB);
        vm.expectRevert(SuretyEscrow.ZeroAmount.selector);
        escrow.pay(seller, 0, DELIVERY, JOB);
        vm.expectRevert(SuretyEscrow.BadWindow.selector);
        escrow.pay(seller, AMOUNT, MIN_DELIVERY - 1, JOB);
        uint32 maxDelivery = escrow.MAX_DELIVERY_WINDOW();
        vm.expectRevert(SuretyEscrow.BadWindow.selector);
        escrow.pay(seller, AMOUNT, maxDelivery + 1, JOB);
        vm.stopPrank();

        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.SelfPayment.selector);
        escrow.pay(seller, AMOUNT, DELIVERY, JOB);
    }

    function test_pay_buyerCannotSetImpossibleDeadline() public {
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.BadWindow.selector);
        escrow.pay(seller, AMOUNT, 1, JOB);
    }

    // ---------------------------------------------------------------------
    // Zero address
    // ---------------------------------------------------------------------

    function test_constructor_rejectsZeroToken() public {
        vm.expectRevert(SuretyEscrow.ZeroAddress.selector);
        new SuretyEscrow(IERC20(address(0)));
    }

    function test_pay_rejectsZeroSeller() public {
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.NotRegistered.selector);
        escrow.pay(address(0), AMOUNT, DELIVERY, JOB);
    }

    // ---------------------------------------------------------------------
    // Decimals
    // ---------------------------------------------------------------------

    function test_constructor_rejectsWrongDecimals() public {
        Mock18Decimals wrong = new Mock18Decimals();
        vm.expectRevert(SuretyEscrow.WrongDecimals.selector);
        new SuretyEscrow(IERC20(address(wrong)));
    }

    function test_decimals_smallestPaymentRoundsPenaltyDown() public {
        vm.prank(buyer);
        uint256 id = escrow.pay(seller, 1, DELIVERY, JOB);
        assertEq(escrow.getPayment(id).penalty, 0);

        vm.prank(buyer);
        uint256 cents = escrow.pay(seller, 10_000, DELIVERY, JOB);
        assertEq(escrow.getPayment(cents).penalty, 1_000);
    }

    function test_decimals_paymentCarriesNoNativeValue() public {
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        (bool ok,) = address(escrow).call{value: 1}("");
        assertFalse(ok);
    }

    function testFuzz_penaltyMatchesSixDecimalMath(uint96 amount, uint16 bps) public {
        amount = uint96(bound(amount, 1, 1_000_000 * USDC));
        bps = uint16(bound(bps, 0, 10_000));

        address who = makeAddr("fuzzSeller");
        usdc.mint(who, 2_000_000 * USDC);
        usdc.mint(buyer, amount);
        vm.startPrank(who);
        usdc.approve(address(escrow), type(uint256).max);
        escrow.register(bps, MIN_DELIVERY, OBJECTION, address(0));
        escrow.addBond(2_000_000 * USDC);
        vm.stopPrank();

        vm.prank(buyer);
        uint256 id = escrow.pay(who, amount, DELIVERY, JOB);
        assertEq(escrow.getPayment(id).penalty, (uint256(amount) * bps) / 10_000);
    }

    // ---------------------------------------------------------------------
    // Blocked recipients
    // ---------------------------------------------------------------------

    function test_blockedBuyer_refundBecomesClaim() public {
        uint256 id = _pay();
        usdc.setBlocked(buyer, true);

        vm.warp(block.timestamp + DELIVERY + 1);
        vm.expectEmit(true, false, false, true);
        emit SuretyEscrow.PayoutDeferred(buyer, AMOUNT + PENALTY);
        escrow.settle(id);

        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Refunded));
        assertEq(escrow.sellerStats(seller).lockedBond, 0);
        assertEq(escrow.claimable(buyer), AMOUNT + PENALTY);

        vm.prank(buyer);
        vm.expectRevert("blocked");
        escrow.claim();

        usdc.setBlocked(buyer, false);
        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.claim();
        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT + PENALTY);
        assertEq(escrow.claimable(buyer), 0);
    }

    function test_blockedSeller_releaseBecomesClaim() public {
        uint256 id = _pay();
        _deliver(id);
        usdc.setBlocked(seller, true);

        vm.prank(buyer);
        escrow.release(id);

        assertEq(uint8(_status(id)), uint8(SuretyEscrow.Status.Released));
        assertEq(escrow.claimable(seller), AMOUNT);
    }

    function test_claim_revertsWhenEmpty() public {
        vm.expectRevert(SuretyEscrow.NothingToClaim.selector);
        escrow.claim();
    }
}

/// @notice Tries to reenter the escrow from inside a token transfer.
contract Attacker is Reenterer {
    SuretyEscrow internal immutable escrow;
    uint256 internal id;
    bool internal callBond;

    bytes4 public lastError;
    uint256 public attempts;

    constructor(SuretyEscrow target) {
        escrow = target;
    }

    function aim(uint256 paymentId, bool bond) external {
        id = paymentId;
        callBond = bond;
    }

    function onTransfer() external {
        attempts++;
        bytes memory call = callBond
            ? abi.encodeCall(SuretyEscrow.withdrawBond, (1))
            : abi.encodeCall(SuretyEscrow.settle, (id));
        (bool ok, bytes memory data) = address(escrow).call(call);
        if (!ok) lastError = bytes4(data);
    }
}

contract SuretyEscrowReentrancyTest is Test {
    SuretyEscrow internal escrow;
    HookToken internal token;
    Attacker internal attacker;

    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");

    uint256 internal constant AMOUNT = 10e6;
    uint32 internal constant DELIVERY = 1 hours;

    function setUp() public {
        token = new HookToken();
        escrow = new SuretyEscrow(IERC20(address(token)));
        attacker = new Attacker(escrow);

        token.mint(seller, 1_000e6);
        token.mint(buyer, 1_000e6);
        vm.startPrank(seller);
        token.approve(address(escrow), type(uint256).max);
        escrow.register(1_000, 60, 60, address(0));
        escrow.addBond(100e6);
        vm.stopPrank();
        vm.prank(buyer);
        token.approve(address(escrow), type(uint256).max);
    }

    function _pay() internal returns (uint256) {
        vm.prank(buyer);
        return escrow.pay(seller, AMOUNT, DELIVERY, bytes32(0));
    }

    function _assertBlocked() internal view {
        assertEq(attacker.attempts(), 1);
        assertEq(attacker.lastError(), ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
    }

    function test_reentry_duringSettlePayoutIsBlocked() public {
        uint256 id = _pay();
        vm.warp(block.timestamp + DELIVERY + 1);
        attacker.aim(id, false);
        token.setHook(address(attacker));

        uint256 buyerBefore = token.balanceOf(buyer);
        escrow.settle(id);

        _assertBlocked();
        assertEq(token.balanceOf(buyer), buyerBefore + AMOUNT + 1e6);
        assertEq(token.balanceOf(address(escrow)), 99e6);
    }

    function test_reentry_duringReleaseIsBlocked() public {
        uint256 id = _pay();
        vm.prank(seller);
        escrow.deliver(id, bytes32(uint256(1)));
        attacker.aim(id, false);
        token.setHook(address(attacker));

        vm.prank(buyer);
        escrow.release(id);

        _assertBlocked();
        assertEq(token.balanceOf(address(escrow)), 100e6);
    }

    function test_reentry_duringPayIsBlocked() public {
        attacker.aim(1, true);
        token.setHook(address(attacker));
        _pay();
        _assertBlocked();
    }

    function test_reentry_duringBondWithdrawalIsBlocked() public {
        attacker.aim(0, true);
        token.setHook(address(attacker));

        vm.prank(seller);
        escrow.withdrawBond(10e6);

        _assertBlocked();
        assertEq(escrow.sellerStats(seller).bond, 90e6);
    }

    function test_reentry_duringClaimCannotDoubleSpend() public {
        uint256 id = _pay();
        token.setBlocked(buyer, true);
        vm.warp(block.timestamp + DELIVERY + 1);
        escrow.settle(id);
        token.setBlocked(buyer, false);

        attacker.aim(0, false);
        token.setHook(address(attacker));
        vm.prank(buyer);
        escrow.claim();

        _assertBlocked();
        assertEq(escrow.claimable(buyer), 0);
        assertEq(token.balanceOf(address(escrow)), 99e6);
    }
}
