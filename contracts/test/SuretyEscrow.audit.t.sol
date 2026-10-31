// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SuretyEscrow} from "../src/SuretyEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @notice Shared fixture for the audit-driven tests (AUDIT.md SE-01..SE-08).
abstract contract SuretyAuditBase is Test {
    SuretyEscrow internal escrow;
    MockUSDC internal usdc;

    address internal seller = makeAddr("seller");
    address internal sellerB = makeAddr("sellerB");
    address internal arbSeller = makeAddr("arbSeller");
    address internal buyer = makeAddr("buyer");
    address internal buyerB = makeAddr("buyerB");
    address internal keeper = makeAddr("keeper");
    address internal arbiter = makeAddr("arbiter");
    address internal attacker = makeAddr("attacker");

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

    /// @dev Every address that can hold a bond or a claim. Used by the conservation check.
    address[] internal actors;

    function setUp() public virtual {
        usdc = new MockUSDC();
        escrow = new SuretyEscrow(IERC20(address(usdc)));
        vm.warp(1_800_000_000);

        actors.push(seller);
        actors.push(sellerB);
        actors.push(arbSeller);
        actors.push(buyer);
        actors.push(buyerB);
        actors.push(keeper);
        actors.push(arbiter);
        actors.push(attacker);
        for (uint256 i; i < actors.length; i++) {
            usdc.mint(actors[i], 1_000_000 * USDC);
            vm.prank(actors[i]);
            usdc.approve(address(escrow), type(uint256).max);
        }

        _register(seller, PENALTY_BPS, MIN_DELIVERY, OBJECTION, address(0), BOND);
        _register(sellerB, 2_000, MIN_DELIVERY, OBJECTION, address(0), BOND);
        _register(arbSeller, PENALTY_BPS, MIN_DELIVERY, OBJECTION, arbiter, BOND);
    }

    // ------------------------------ helpers ------------------------------

    function _register(address who, uint16 bps, uint32 minWin, uint32 objWin, address arb, uint256 bond) internal {
        vm.startPrank(who);
        escrow.register(bps, minWin, objWin, arb);
        if (bond > 0) escrow.addBond(bond);
        vm.stopPrank();
    }

    function _newSeller(string memory name, uint16 bps, uint32 minWin, uint32 objWin, address arb, uint256 bond)
        internal
        returns (address who)
    {
        who = makeAddr(name);
        usdc.mint(who, 1_000_000 * USDC);
        vm.prank(who);
        usdc.approve(address(escrow), type(uint256).max);
        actors.push(who);
        _register(who, bps, minWin, objWin, arb, bond);
    }

    function _payFrom(address from, address to, uint256 amount, uint32 window) internal returns (uint256 id) {
        vm.prank(from);
        id = escrow.pay(to, amount, window, JOB);
    }

    function _pay(address to) internal returns (uint256) {
        return _payFrom(buyer, to, AMOUNT, DELIVERY);
    }

    function _deliver(address from, uint256 id) internal {
        vm.prank(from);
        escrow.deliver(id, PROOF);
    }

    function _payAndDeliver(address to) internal returns (uint256 id) {
        id = _pay(to);
        _deliver(to, id);
    }

    function _disputed() internal returns (uint256 id) {
        id = _payAndDeliver(arbSeller);
        vm.prank(buyer);
        escrow.object(id);
    }

    function _status(uint256 id) internal view returns (SuretyEscrow.Status) {
        return escrow.getPayment(id).status;
    }

    function _isStatus(uint256 id, SuretyEscrow.Status s) internal view returns (bool) {
        return _status(id) == s;
    }

    function _open(SuretyEscrow.Status s) internal pure returns (bool) {
        return s == SuretyEscrow.Status.Pending || s == SuretyEscrow.Status.Delivered
            || s == SuretyEscrow.Status.Disputed;
    }

    /// @dev Contract USDC == all bonds + open escrowed amounts + all claimable.
    function _assertBacked() internal view {
        uint256 expected;
        for (uint256 i; i < actors.length; i++) {
            expected += escrow.sellerStats(actors[i]).bond + escrow.claimable(actors[i]);
        }
        uint256 last = escrow.lastPaymentId();
        for (uint256 id = 1; id <= last; id++) {
            SuretyEscrow.Payment memory p = escrow.getPayment(id);
            if (_open(p.status)) expected += p.amount;
        }
        assertEq(usdc.balanceOf(address(escrow)), expected, "escrow not fully backed");
    }

    /// @dev A seller's lockedBond equals the sum of that seller's open penalties.
    function _assertLocked(address who) internal view {
        uint256 expected;
        uint256 last = escrow.lastPaymentId();
        for (uint256 id = 1; id <= last; id++) {
            SuretyEscrow.Payment memory p = escrow.getPayment(id);
            if (p.seller == who && _open(p.status)) expected += p.penalty;
        }
        assertEq(escrow.sellerStats(who).lockedBond, expected, "lockedBond != open penalties");
    }
}

/// @notice SE-01 (arbiter deadline race), SE-02 (no-arbiter objection), absent-arbiter dispute path.
contract SuretyAuditDisputeTest is SuretyAuditBase {
    // ------------------------------ SE-01 ------------------------------

    function test_SE01_race_atDeadlinePlusOne_resolveReverts_settleWins() public {
        uint256 id = _disputed();
        uint64 decideBy = escrow.getPayment(id).decideBy;
        vm.warp(uint256(decideBy) + 1);

        // The arbiter tries to front-run the buyer's settle in the same second.
        vm.prank(arbiter);
        vm.expectRevert(SuretyEscrow.TooLate.selector);
        escrow.resolve(id, false);

        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 sellerBefore = usdc.balanceOf(arbSeller);
        vm.prank(buyer);
        escrow.settle(id);

        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT + PENALTY);
        assertEq(usdc.balanceOf(arbSeller), sellerBefore);
        assertTrue(_isStatus(id, SuretyEscrow.Status.Refunded));
        _assertBacked();
    }

    function test_SE01_race_settleFirstThenArbiterHitsWrongStatus() public {
        uint256 id = _disputed();
        vm.warp(uint256(escrow.getPayment(id).decideBy) + 1);

        vm.prank(buyer);
        escrow.settle(id);

        vm.prank(arbiter);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.resolve(id, false);
        assertEq(escrow.sellerStats(arbSeller).delivered, 0);
        assertEq(escrow.sellerStats(arbSeller).refunded, 1);
    }

    function test_SE01_race_atDeadline_settleReverts_resolveWins() public {
        uint256 id = _disputed();
        vm.warp(escrow.getPayment(id).decideBy);

        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.TooEarly.selector);
        escrow.settle(id);

        uint256 sellerBefore = usdc.balanceOf(arbSeller);
        vm.prank(arbiter);
        escrow.resolve(id, false);
        assertEq(usdc.balanceOf(arbSeller), sellerBefore + AMOUNT);

        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.settle(id);
        _assertBacked();
    }

    function testFuzz_SE01_exactlyOneOfSettleAndResolveWorks(uint256 dt) public {
        uint256 id = _disputed();
        uint256 resolveBy = escrow.getPayment(id).decideBy;
        dt = bound(dt, 0, 2 * uint256(escrow.ARBITER_WINDOW()));
        vm.warp(resolveBy - escrow.ARBITER_WINDOW() + dt);

        bool settled;
        bool resolved;
        vm.prank(keeper);
        try escrow.settle(id) {
            settled = true;
        } catch {}
        vm.prank(arbiter);
        try escrow.resolve(id, false) {
            resolved = true;
        } catch {}

        assertTrue(settled != resolved, "exactly one must win");
        assertEq(settled, dt > escrow.ARBITER_WINDOW());
        _assertBacked();
    }

    // ------------------------------ SE-02 ------------------------------

    function test_SE02_noArbiter_objectionPaysBuyerAmountPlusPenalty_bondShrinks() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 sellerBefore = usdc.balanceOf(seller);
        uint256 id = _payAndDeliver(seller); // honest delivery

        vm.expectEmit(true, true, false, true, address(escrow));
        emit SuretyEscrow.Refunded(id, buyer, AMOUNT, PENALTY);
        vm.prank(buyer);
        escrow.object(id);

        // Buyer ends up +penalty while keeping the delivered work (proof stays on record).
        assertEq(usdc.balanceOf(buyer), buyerBefore + PENALTY);
        assertEq(usdc.balanceOf(seller), sellerBefore);
        assertEq(escrow.getPayment(id).proofHash, PROOF);
        assertTrue(_isStatus(id, SuretyEscrow.Status.Refunded));

        SuretyEscrow.Seller memory s = escrow.sellerStats(seller);
        assertEq(s.bond, BOND - PENALTY);
        assertEq(s.lockedBond, 0);
        assertEq(s.objected, 1);
        assertEq(s.refunded, 1);
        assertEq(s.delivered, 0);
        assertEq(usdc.balanceOf(address(escrow)), BOND - PENALTY + BOND + BOND); // 3 sellers' bonds, minus penalty
        _assertBacked();
    }

    function test_SE02_noArbiter_repeatedObjectionsDrainBond() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);
        for (uint256 i; i < 5; i++) {
            uint256 id = _payAndDeliver(seller);
            vm.prank(buyer);
            escrow.object(id);
        }
        assertEq(escrow.sellerStats(seller).bond, BOND - 5 * PENALTY);
        assertEq(usdc.balanceOf(buyer), buyerBefore + 5 * PENALTY);
        assertEq(escrow.reliabilityBps(seller), 0);
        _assertBacked();
    }

    function test_SE02_noArbiter_drainStopsWhenBondExhausted() public {
        address who = _newSeller("thin", PENALTY_BPS, MIN_DELIVERY, OBJECTION, address(0), 3 * PENALTY);
        for (uint256 i; i < 3; i++) {
            uint256 id = _payAndDeliver(who);
            vm.prank(buyer);
            escrow.object(id);
        }
        assertEq(escrow.sellerStats(who).bond, 0);

        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.pay(who, AMOUNT, DELIVERY, JOB);
        _assertBacked();
    }

    function test_SE02_arbiterVariant_objectionDoesNotSlashUntilResolved() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 id = _payAndDeliver(arbSeller);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit SuretyEscrow.Disputed(id, arbiter, uint64(block.timestamp + escrow.ARBITER_WINDOW()));
        vm.prank(buyer);
        escrow.object(id);

        assertTrue(_isStatus(id, SuretyEscrow.Status.Disputed));
        SuretyEscrow.Seller memory s = escrow.sellerStats(arbSeller);
        assertEq(s.bond, BOND);
        assertEq(s.lockedBond, PENALTY);
        assertEq(s.refunded, 0);
        assertEq(s.objected, 1);
        assertEq(usdc.balanceOf(buyer), buyerBefore - AMOUNT, "no money moves on objection");

        // Buyer cannot decide their own dispute.
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.NotArbiter.selector);
        escrow.resolve(id, true);

        // Arbiter sides with the honest seller: bond untouched, buyer gets nothing.
        uint256 sellerBefore = usdc.balanceOf(arbSeller);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit SuretyEscrow.Resolved(id, arbiter, false);
        vm.prank(arbiter);
        escrow.resolve(id, false);

        s = escrow.sellerStats(arbSeller);
        assertEq(s.bond, BOND);
        assertEq(s.lockedBond, 0);
        assertEq(usdc.balanceOf(arbSeller), sellerBefore + AMOUNT);
        assertEq(usdc.balanceOf(buyer), buyerBefore - AMOUNT);
        _assertBacked();
    }

    // ------------------- required (1): absent arbiter path -------------------

    function test_dispute_absentArbiter_settleBoundaryRefundsAmountPlusPenalty() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 id = _disputed();
        uint64 decideBy = escrow.getPayment(id).decideBy;
        assertEq(decideBy, block.timestamp + escrow.ARBITER_WINDOW());

        vm.warp(decideBy);
        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.TooEarly.selector);
        escrow.settle(id);

        vm.warp(uint256(decideBy) + 1);
        // Arbiter is already locked out, before anyone settles.
        vm.prank(arbiter);
        vm.expectRevert(SuretyEscrow.TooLate.selector);
        escrow.resolve(id, true);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit SuretyEscrow.Refunded(id, buyer, AMOUNT, PENALTY);
        vm.prank(keeper);
        escrow.settle(id);

        assertEq(usdc.balanceOf(buyer), buyerBefore + PENALTY, "buyer made whole plus penalty");
        SuretyEscrow.Seller memory s = escrow.sellerStats(arbSeller);
        assertEq(s.bond, BOND - PENALTY, "bond shrinks by penalty");
        assertEq(s.lockedBond, 0);
        assertEq(s.refunded, 1);
        assertTrue(_isStatus(id, SuretyEscrow.Status.Refunded));

        // After settlement the arbiter's call hits WrongStatus, now and much later.
        vm.prank(arbiter);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.resolve(id, false);
        vm.warp(block.timestamp + 365 days);
        vm.prank(arbiter);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.resolve(id, true);
        _assertBacked();
    }

}

/// @notice SE-07: exact boundary timestamps for every deadline, and window limits.
contract SuretyAuditBoundaryTest is SuretyAuditBase {
    function _deliverBy(uint256 id) internal view returns (uint256) {
        return escrow.getPayment(id).deliverBy;
    }

    function _decideBy(uint256 id) internal view returns (uint256) {
        return escrow.getPayment(id).decideBy;
    }

    // ---------------- Pending: deliverBy ----------------

    function test_boundary_decline_atDeliverBy_succeeds() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 id = _pay(seller);
        vm.warp(_deliverBy(id));

        vm.prank(seller);
        escrow.decline(id);

        assertEq(usdc.balanceOf(buyer), buyerBefore, "refunded without penalty");
        assertEq(escrow.sellerStats(seller).bond, BOND);
        assertEq(escrow.sellerStats(seller).lockedBond, 0);
        _assertBacked();
    }

    function test_boundary_atDeliverByPlusOne_declineReverts_settleSlashes() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 id = _pay(seller);
        vm.warp(_deliverBy(id) + 1);

        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.TooLate.selector);
        escrow.decline(id);

        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.TooLate.selector);
        escrow.deliver(id, PROOF);

        vm.prank(keeper);
        escrow.settle(id);
        assertEq(usdc.balanceOf(buyer), buyerBefore + PENALTY);
        assertEq(escrow.sellerStats(seller).bond, BOND - PENALTY);
        _assertBacked();
    }

    function test_boundary_atDeliverBy_settleRevertsButDeliverWorks() public {
        uint256 id = _pay(seller);
        vm.warp(_deliverBy(id));

        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.TooEarly.selector);
        escrow.settle(id);

        _deliver(seller, id);
        assertTrue(_isStatus(id, SuretyEscrow.Status.Delivered));
    }

    function test_boundary_deliveryAtDeadline_objectionWindowStartsFromDeliveryTime() public {
        uint256 id = _pay(seller);
        uint256 dBy = _deliverBy(id);
        vm.warp(dBy);
        _deliver(seller, id);
        assertEq(_decideBy(id), dBy + OBJECTION);

        // Settle at deliverBy+1 no longer refunds: the payment is Delivered and its own window runs.
        vm.warp(dBy + 1);
        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.TooEarly.selector);
        escrow.settle(id);
    }

    function testFuzz_boundary_pending_exactlyOneOfDeliverAndSettle(uint256 dt) public {
        uint256 id = _pay(seller);
        uint256 t0 = block.timestamp;
        dt = bound(dt, 0, 2 * uint256(DELIVERY));
        vm.warp(t0 + dt);

        bool settled;
        bool delivered;
        vm.prank(keeper);
        try escrow.settle(id) {
            settled = true;
        } catch {}
        vm.prank(seller);
        try escrow.deliver(id, PROOF) {
            delivered = true;
        } catch {}

        assertTrue(settled != delivered, "exactly one must win");
        assertEq(settled, dt > DELIVERY);
        _assertBacked();
    }

    // ---------------- Delivered: objection deadline ----------------

    function test_boundary_atObjectionDeadline_objectWorks_settleReverts() public {
        uint256 id = _payAndDeliver(seller);
        vm.warp(_decideBy(id));

        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.TooEarly.selector);
        escrow.settle(id);

        vm.prank(buyer);
        escrow.object(id);
        assertTrue(_isStatus(id, SuretyEscrow.Status.Refunded));
    }

    function test_boundary_atObjectionDeadline_releaseWorks() public {
        uint256 id = _payAndDeliver(seller);
        vm.warp(_decideBy(id));
        uint256 sellerBefore = usdc.balanceOf(seller);

        vm.prank(buyer);
        escrow.release(id);

        assertEq(usdc.balanceOf(seller), sellerBefore + AMOUNT);
        assertEq(escrow.sellerStats(seller).delivered, 1);
        _assertBacked();
    }

    function test_boundary_afterObjectionDeadline_objectReverts_settleReleasesToSeller() public {
        uint256 id = _payAndDeliver(seller);
        vm.warp(_decideBy(id) + 1);

        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.TooLate.selector);
        escrow.object(id);

        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(keeper);
        escrow.settle(id);
        assertEq(usdc.balanceOf(seller), sellerBefore + AMOUNT);

        // Finished payments are final for every actor.
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.release(id);
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.object(id);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.settle(id);
        _assertBacked();
    }

    function test_boundary_buyerCanStillReleaseAfterObjectionDeadlineUntilSettled() public {
        uint256 id = _payAndDeliver(seller);
        vm.warp(_decideBy(id) + 1);
        uint256 sellerBefore = usdc.balanceOf(seller);

        vm.prank(buyer);
        escrow.release(id); // release has no deadline; it only needs status Delivered

        assertEq(usdc.balanceOf(seller), sellerBefore + AMOUNT);
        vm.expectRevert(SuretyEscrow.WrongStatus.selector);
        escrow.settle(id);
    }

    function testFuzz_boundary_delivered_exactlyOneOfObjectAndSettle(uint256 dt) public {
        uint256 id = _payAndDeliver(seller);
        uint256 t0 = block.timestamp;
        dt = bound(dt, 0, 2 * uint256(OBJECTION));
        vm.warp(t0 + dt);

        bool settled;
        bool objected;
        vm.prank(keeper);
        try escrow.settle(id) {
            settled = true;
        } catch {}
        vm.prank(buyer);
        try escrow.object(id) {
            objected = true;
        } catch {}

        assertTrue(settled != objected, "exactly one must win");
        assertEq(settled, dt > OBJECTION);
        _assertBacked();
    }

    // ---------------- Window limits ----------------

    function test_window_maxDeliveryWindow_boundary() public {
        uint32 maxWin = escrow.MAX_DELIVERY_WINDOW();
        uint256 t0 = block.timestamp;
        uint256 id = _payFrom(buyer, seller, AMOUNT, maxWin);
        assertEq(_deliverBy(id), t0 + maxWin);

        vm.warp(t0 + maxWin);
        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.TooEarly.selector);
        escrow.settle(id);

        vm.warp(t0 + maxWin + 1);
        vm.prank(keeper);
        escrow.settle(id);
        assertTrue(_isStatus(id, SuretyEscrow.Status.Refunded));
    }

    function test_window_minDeliveryWindow_exactlyAccepted() public {
        uint256 t0 = block.timestamp;
        uint256 id = _payFrom(buyer, seller, AMOUNT, MIN_DELIVERY);
        assertEq(_deliverBy(id), t0 + MIN_DELIVERY);
    }

    function test_window_registerAtLimits_andPayBoundsFollowSellerMin() public {
        uint32 maxWin = escrow.MAX_DELIVERY_WINDOW();
        address who = _newSeller("limits", 10_000, maxWin, escrow.MIN_OBJECTION_WINDOW(), address(0), 2 * AMOUNT);

        SuretyEscrow.Seller memory s = escrow.sellerStats(who);
        assertEq(s.penaltyBps, 10_000);
        assertEq(s.minDeliveryWindow, maxWin);
        assertEq(s.objectionWindow, 30);

        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.BadWindow.selector);
        escrow.pay(who, AMOUNT, maxWin - 1, JOB);
        uint256 id = _payFrom(buyer, who, AMOUNT, maxWin);
        assertEq(escrow.getPayment(id).penalty, AMOUNT);
    }

    function test_window_minObjectionWindow_boundary() public {
        uint32 minObj = escrow.MIN_OBJECTION_WINDOW();
        address who = _newSeller("minObj", PENALTY_BPS, MIN_DELIVERY, minObj, address(0), BOND);
        uint256 id = _payAndDeliver(who);
        uint256 dBy = _decideBy(id);
        assertEq(dBy, block.timestamp + 30);

        vm.warp(dBy);
        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.TooEarly.selector);
        escrow.settle(id);
        vm.warp(dBy + 1);
        vm.prank(keeper);
        escrow.settle(id);
        assertTrue(_isStatus(id, SuretyEscrow.Status.Released));
    }

    function test_window_maxObjectionWindow_boundary() public {
        uint32 maxObj = escrow.MAX_OBJECTION_WINDOW();
        address who = _newSeller("maxObj", PENALTY_BPS, MIN_DELIVERY, maxObj, address(0), BOND);
        uint256 id = _payAndDeliver(who);
        uint256 dBy = _decideBy(id);
        assertEq(dBy, block.timestamp + maxObj);

        vm.warp(dBy);
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.TooEarly.selector);
        escrow.settle(id);
        vm.warp(dBy + 1);
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.TooLate.selector);
        escrow.object(id);
        vm.prank(keeper);
        escrow.settle(id);
        assertTrue(_isStatus(id, SuretyEscrow.Status.Released));
        _assertBacked();
    }

}

/// @notice Edge terms (penaltyBps 0 / 10000), bond exactness, claim edge cases, accounting fuzz.
contract SuretyAuditEdgeTest is SuretyAuditBase {
    function test_penaltyBps10000_penaltyEqualsAmount_refundDoublesAndExhaustsBond() public {
        address who = _newSeller("full", 10_000, MIN_DELIVERY, OBJECTION, address(0), AMOUNT);
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 id = _payFrom(buyer, who, AMOUNT, DELIVERY);

        assertEq(escrow.getPayment(id).penalty, AMOUNT);
        assertEq(escrow.freeBond(who), 0);

        vm.warp(block.timestamp + DELIVERY + 1);
        escrow.settle(id);

        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT, "buyer receives amount extra");
        assertEq(escrow.sellerStats(who).bond, 0);
        assertEq(escrow.sellerStats(who).lockedBond, 0);
        _assertBacked();
    }

    function test_penaltyBps10000_revertsWhenBondBelowAmount() public {
        address who = _newSeller("short", 10_000, MIN_DELIVERY, OBJECTION, address(0), AMOUNT - 1);
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.pay(who, AMOUNT, DELIVERY, JOB);
    }

    function test_penaltyBps0_noLock_bondFullyWithdrawableWhilePaymentOpen() public {
        address who = _newSeller("nopen", 0, MIN_DELIVERY, OBJECTION, address(0), BOND);
        uint256 id = _payFrom(buyer, who, AMOUNT, DELIVERY);

        assertEq(escrow.sellerStats(who).lockedBond, 0);
        vm.prank(who);
        escrow.withdrawBond(BOND);
        assertEq(escrow.sellerStats(who).bond, 0);

        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.warp(block.timestamp + DELIVERY + 1);
        escrow.settle(id);
        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT, "refund is exactly the principal");
        _assertBacked();
    }

    function test_penaltyBps0_objectionRefundsPrincipalOnly() public {
        address who = _newSeller("nopen2", 0, MIN_DELIVERY, OBJECTION, address(0), BOND);
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 id = _payAndDeliver(who);
        vm.prank(buyer);
        escrow.object(id);

        assertEq(usdc.balanceOf(buyer), buyerBefore);
        assertEq(escrow.sellerStats(who).bond, BOND);
        _assertBacked();
    }

    function test_withdrawBond_exactFreeAmount_emitsAndLeavesLockedBond() public {
        _pay(seller); // locks PENALTY
        uint256 free = escrow.freeBond(seller);
        assertEq(free, BOND - PENALTY);

        uint256 before = usdc.balanceOf(seller);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit SuretyEscrow.BondWithdrawn(seller, free, PENALTY);
        vm.prank(seller);
        escrow.withdrawBond(free);

        assertEq(usdc.balanceOf(seller), before + free);
        assertEq(escrow.freeBond(seller), 0);
        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.withdrawBond(1);
        _assertBacked();
    }

    function test_withdrawBond_unregisteredCallerReverts() public {
        vm.prank(keeper);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.withdrawBond(1);
    }

    function test_addBond_emitsEvent() public {
        vm.expectEmit(true, false, false, true, address(escrow));
        emit SuretyEscrow.BondAdded(seller, 7 * USDC, BOND + 7 * USDC);
        vm.prank(seller);
        escrow.addBond(7 * USDC);
    }

    function test_register_emitsEvent() public {
        vm.expectEmit(true, false, false, true, address(escrow));
        emit SuretyEscrow.SellerRegistered(keeper, 250, 90, 45, arbiter);
        vm.prank(keeper);
        escrow.register(250, 90, 45, arbiter);
    }

    function test_claim_secondClaimRevertsAndEventsEmitted() public {
        uint256 id = _pay(seller);
        usdc.setBlocked(buyer, true);
        vm.warp(block.timestamp + DELIVERY + 1);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit SuretyEscrow.PayoutDeferred(buyer, AMOUNT + PENALTY);
        escrow.settle(id);
        usdc.setBlocked(buyer, false);

        vm.expectEmit(true, false, false, true, address(escrow));
        emit SuretyEscrow.Claimed(buyer, AMOUNT + PENALTY);
        vm.prank(buyer);
        escrow.claim();

        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.NothingToClaim.selector);
        escrow.claim();
        _assertBacked();
    }

    function test_claim_cannotBeTakenByAnotherAccount() public {
        uint256 id = _pay(seller);
        usdc.setBlocked(buyer, true);
        vm.warp(block.timestamp + DELIVERY + 1);
        escrow.settle(id);
        usdc.setBlocked(buyer, false);

        vm.prank(attacker);
        vm.expectRevert(SuretyEscrow.NothingToClaim.selector);
        escrow.claim();
        assertEq(escrow.claimable(buyer), AMOUNT + PENALTY);
    }

    function test_lifecycle_idsAreSequentialAndUnknownIdsAreEmpty() public {
        assertEq(escrow.lastPaymentId(), 0);
        assertEq(_pay(seller), 1);
        assertEq(_pay(sellerB), 2);
        assertEq(escrow.lastPaymentId(), 2);
        assertTrue(_isStatus(3, SuretyEscrow.Status.None));
    }

    // ---------------- fuzz ----------------

    function testFuzz_payThenTimeoutRefund_accounting(uint96 amount, uint16 bps) public {
        amount = uint96(bound(amount, 1, 100_000 * USDC));
        bps = uint16(bound(bps, 0, 10_000));
        address who = _newSeller("fz", bps, MIN_DELIVERY, OBJECTION, address(0), 100_000 * USDC);
        uint256 penalty = (uint256(amount) * bps) / 10_000;
        uint256 buyerBefore = usdc.balanceOf(buyer);

        uint256 id = _payFrom(buyer, who, amount, DELIVERY);
        assertEq(escrow.sellerStats(who).lockedBond, penalty);
        assertEq(escrow.freeBond(who), 100_000 * USDC - penalty);
        _assertBacked();

        vm.warp(block.timestamp + DELIVERY + 1);
        escrow.settle(id);

        assertEq(usdc.balanceOf(buyer), buyerBefore + penalty);
        assertEq(escrow.sellerStats(who).bond, 100_000 * USDC - penalty);
        assertEq(escrow.sellerStats(who).lockedBond, 0);
        _assertBacked();
    }

    function testFuzz_lifecycleConservation(uint96 amount, uint16 bps, uint8 path) public {
        amount = uint96(bound(amount, 1, 100_000 * USDC));
        bps = uint16(bound(bps, 0, 10_000));
        path = uint8(bound(path, 0, 4));
        address who = _newSeller("fz2", bps, MIN_DELIVERY, OBJECTION, address(0), 100_000 * USDC);
        uint256 penalty = (uint256(amount) * bps) / 10_000;
        uint256 buyerBefore = usdc.balanceOf(buyer);
        uint256 whoBefore = usdc.balanceOf(who);

        uint256 id = _payFrom(buyer, who, amount, DELIVERY);
        uint256 buyerGain; // gets back principal + this (paths 0, 1, 4)
        uint256 sellerGain;
        uint256 bondLoss;

        if (path == 0) {
            vm.warp(block.timestamp + DELIVERY + 1);
            escrow.settle(id);
            buyerGain = penalty;
            bondLoss = penalty;
        } else if (path == 1) {
            vm.prank(who);
            escrow.decline(id);
        } else if (path == 2) {
            _deliver(who, id);
            vm.prank(buyer);
            escrow.release(id);
            sellerGain = amount;
        } else if (path == 3) {
            _deliver(who, id);
            vm.warp(block.timestamp + OBJECTION + 1);
            escrow.settle(id);
            sellerGain = amount;
        } else {
            _deliver(who, id);
            vm.prank(buyer);
            escrow.object(id);
            buyerGain = penalty;
            bondLoss = penalty;
        }

        // Buyer's net change: +penalty on refund paths, 0 on decline, -amount when the seller is paid.
        uint256 buyerExpected = (path == 2 || path == 3) ? buyerBefore - amount : buyerBefore + buyerGain;
        assertEq(usdc.balanceOf(buyer), buyerExpected);
        assertEq(usdc.balanceOf(who), whoBefore + sellerGain);
        assertEq(escrow.sellerStats(who).bond, 100_000 * USDC - bondLoss);
        assertEq(escrow.sellerStats(who).lockedBond, 0);
        assertEq(usdc.balanceOf(address(escrow)), escrow.sellerStats(who).bond + 3 * BOND);
        _assertBacked();
        _assertLocked(who);
    }

}

/// @notice A contract seller that can batch `decline` and `withdrawBond` in one transaction.
contract SmartSeller {
    SuretyEscrow internal immutable escrow;
    IERC20 internal immutable token;

    constructor(SuretyEscrow target, IERC20 usdc) {
        escrow = target;
        token = usdc;
    }

    function setUp(uint256 bond) external {
        token.approve(address(escrow), type(uint256).max);
        escrow.register(1_000, 60, 600, address(0));
        escrow.addBond(bond);
    }

    function declineAndWithdraw(uint256 id, uint256 amount) external {
        escrow.decline(id);
        escrow.withdrawBond(amount);
    }
}

/// @notice SE-03: unsolicited payments lock the bond; decline unlocks it.
contract SuretyAuditGriefTest is SuretyAuditBase {
    uint256 internal constant LOCK_ALL = 10 * BOND; // 10% penalty == the whole bond

    function _lockAll() internal returns (uint256) {
        return _payFrom(attacker, seller, LOCK_ALL, DELIVERY);
    }

    function test_SE03_unsolicitedPay_locksAllFreeBondWithoutSellerConsent() public {
        uint256 id = _lockAll();

        SuretyEscrow.Payment memory p = escrow.getPayment(id);
        assertEq(p.buyer, attacker);
        assertEq(p.seller, seller);
        assertEq(escrow.sellerStats(seller).lockedBond, BOND);
        assertEq(escrow.freeBond(seller), 0);

        // Seller (plain wallet) cannot pull any bond out.
        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.withdrawBond(1);

        // Honest customers are also turned away while the bond is fully locked.
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.pay(seller, AMOUNT, DELIVERY, JOB);
        _assertBacked();
        _assertLocked(seller);
    }

    function test_SE03_partialLock_onlyUnlockedRemainderWithdrawable() public {
        _payFrom(attacker, seller, 5 * BOND, DELIVERY); // penalty = BOND / 2
        assertEq(escrow.freeBond(seller), BOND / 2);

        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.withdrawBond(BOND / 2 + 1);
        vm.prank(seller);
        escrow.withdrawBond(BOND / 2);
        assertEq(escrow.sellerStats(seller).bond, BOND / 2);
        assertEq(escrow.sellerStats(seller).lockedBond, BOND / 2);
    }

    function test_SE03_sellerDecline_unlocksBond_payerLosesNothing() public {
        uint256 attackerBefore = usdc.balanceOf(attacker);
        uint256 id = _lockAll();

        vm.expectEmit(true, true, false, true, address(escrow));
        emit SuretyEscrow.Declined(id, seller);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit SuretyEscrow.Refunded(id, attacker, LOCK_ALL, 0);
        vm.prank(seller);
        escrow.decline(id);

        assertEq(usdc.balanceOf(attacker), attackerBefore, "payer fully refunded");
        SuretyEscrow.Seller memory s = escrow.sellerStats(seller);
        assertEq(s.lockedBond, 0);
        assertEq(s.bond, BOND);
        assertEq(s.declined, 1);
        assertEq(s.refunded, 0);
        assertEq(escrow.reliabilityBps(seller), 0, "declines do not count toward reliability");

        vm.prank(seller);
        escrow.withdrawBond(BOND);
        assertEq(escrow.sellerStats(seller).bond, 0);
        _assertBacked();
    }

    function test_SE03_ignoredPayment_sellerLosesPenaltyToPayer() public {
        uint256 attackerBefore = usdc.balanceOf(attacker);
        uint256 id = _lockAll();
        vm.warp(block.timestamp + DELIVERY + 1);
        escrow.settle(id);

        assertEq(usdc.balanceOf(attacker), attackerBefore + BOND);
        assertEq(escrow.sellerStats(seller).bond, 0);
        _assertBacked();
    }

    function test_SE03_decline_worksAtDeadline_revertsAfter_andSettleSlashes() public {
        uint256 attackerBefore = usdc.balanceOf(attacker);
        uint256 early = _lockAll();
        vm.warp(escrow.getPayment(early).deliverBy);
        vm.prank(seller);
        escrow.decline(early);
        assertEq(usdc.balanceOf(attacker), attackerBefore);

        uint256 late = _lockAll();
        vm.warp(escrow.getPayment(late).deliverBy + 1);
        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.TooLate.selector);
        escrow.decline(late);

        escrow.settle(late);
        assertEq(usdc.balanceOf(attacker), attackerBefore + BOND);
        assertEq(escrow.sellerStats(seller).bond, 0);
        _assertBacked();
    }

    function test_SE03_attackerRelocksRightAfterDecline_withdrawBlockedAgain() public {
        uint256 attackerBefore = usdc.balanceOf(attacker);
        for (uint256 i; i < 3; i++) {
            uint256 id = _lockAll();
            vm.prank(seller);
            escrow.decline(id);
            assertEq(escrow.freeBond(seller), BOND);
        }
        assertEq(usdc.balanceOf(attacker), attackerBefore, "attacker capital only ever locked");
        assertEq(escrow.sellerStats(seller).declined, 3);

        // The attacker re-locks before the seller's withdrawal lands.
        _lockAll();
        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.withdrawBond(BOND);
        _assertBacked();
        _assertLocked(seller);
    }

    function test_SE03_lockDurationCappedAtMaxDeliveryWindow() public {
        uint256 id = _payFrom(attacker, seller, LOCK_ALL, escrow.MAX_DELIVERY_WINDOW());
        vm.warp(escrow.getPayment(id).deliverBy + 1);
        escrow.settle(id); // permissionless: no payment can hold bond longer than 30 days
        assertEq(escrow.sellerStats(seller).lockedBond, 0);
    }

    function test_SE03_bondStaysLockedThroughDeliveryUntilRelease() public {
        uint256 id = _payAndDeliver(seller);
        assertEq(escrow.sellerStats(seller).lockedBond, PENALTY);
        vm.prank(seller);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.withdrawBond(BOND);

        vm.prank(buyer);
        escrow.release(id);
        vm.prank(seller);
        escrow.withdrawBond(BOND);
        assertEq(escrow.sellerStats(seller).bond, 0);
    }

    function test_SE03_smartWallet_batchesDeclineAndWithdraw() public {
        SmartSeller smart = new SmartSeller(escrow, IERC20(address(usdc)));
        usdc.mint(address(smart), BOND);
        smart.setUp(BOND);

        uint256 id = _payFrom(attacker, address(smart), LOCK_ALL, DELIVERY);
        assertEq(escrow.freeBond(address(smart)), 0);

        smart.declineAndWithdraw(id, BOND);
        assertEq(usdc.balanceOf(address(smart)), BOND);
        assertEq(escrow.sellerStats(address(smart)).bond, 0);
    }
}

/// @notice SE-04 / SE-05: USDC blocklist behavior.
contract SuretyAuditBlocklistTest is SuretyAuditBase {
    function _timeout(uint256 id) internal {
        vm.warp(escrow.getPayment(id).deliverBy + 1);
        escrow.settle(id);
    }

    function test_SE05_blockedBuyer_settle_claimFailsWhileBlocked_succeedsAfterUnblock() public {
        uint256 id = _pay(seller);
        usdc.setBlocked(buyer, true);

        vm.expectEmit(true, false, false, true, address(escrow));
        emit SuretyEscrow.PayoutDeferred(buyer, AMOUNT + PENALTY);
        _timeout(id);

        assertTrue(_isStatus(id, SuretyEscrow.Status.Refunded), "payment still completes");
        assertEq(escrow.claimable(buyer), AMOUNT + PENALTY);
        assertEq(escrow.sellerStats(seller).lockedBond, 0);
        assertEq(escrow.sellerStats(seller).bond, BOND - PENALTY);
        _assertBacked();

        vm.prank(buyer);
        vm.expectRevert("blocked");
        escrow.claim();
        assertEq(escrow.claimable(buyer), AMOUNT + PENALTY, "failed claim keeps the record");
        _assertBacked();

        usdc.setBlocked(buyer, false);
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.claim();
        assertEq(usdc.balanceOf(buyer), before + AMOUNT + PENALTY);
        assertEq(escrow.claimable(buyer), 0);
        _assertBacked();
    }

    function test_SE05_blockedBuyer_decline_becomesClaimOfPrincipal() public {
        uint256 id = _pay(seller);
        usdc.setBlocked(buyer, true);
        vm.prank(seller);
        escrow.decline(id);

        assertEq(escrow.claimable(buyer), AMOUNT);
        assertEq(escrow.sellerStats(seller).lockedBond, 0);
        assertEq(escrow.sellerStats(seller).bond, BOND);
        _assertBacked();
    }

    function test_SE05_blockedBuyer_objectNoArbiter_becomesClaim() public {
        uint256 id = _payAndDeliver(seller);
        usdc.setBlocked(buyer, true);
        vm.prank(buyer); // calling the escrow is fine; only token moves are blocked
        escrow.object(id);
        assertEq(escrow.claimable(buyer), AMOUNT + PENALTY);
        _assertBacked();
    }

    function test_SE05_blockedBuyer_arbiterRefund_becomesClaim() public {
        uint256 id = _disputed();
        usdc.setBlocked(buyer, true);
        vm.prank(arbiter);
        escrow.resolve(id, true);
        assertEq(escrow.claimable(buyer), AMOUNT + PENALTY);
        _assertBacked();
    }

    function test_SE05_blockedSeller_releasePaths_becomeClaim_andBondExitStuck() public {
        uint256 settled = _payAndDeliver(seller);
        uint256 resolved = _disputed(); // arbSeller
        usdc.setBlocked(seller, true);
        usdc.setBlocked(arbSeller, true);

        vm.warp(escrow.getPayment(settled).decideBy + 1);
        escrow.settle(settled);
        assertEq(escrow.claimable(seller), AMOUNT);

        vm.prank(arbiter);
        escrow.resolve(resolved, false);
        assertEq(escrow.claimable(arbSeller), AMOUNT);

        // A blocked seller also cannot withdraw bond until unblocked; accounting is untouched.
        vm.prank(seller);
        vm.expectRevert("blocked");
        escrow.withdrawBond(BOND);
        assertEq(escrow.sellerStats(seller).bond, BOND);

        usdc.setBlocked(seller, false);
        vm.startPrank(seller);
        escrow.claim();
        escrow.withdrawBond(BOND);
        vm.stopPrank();
        assertEq(escrow.claimable(seller), 0);
        _assertBacked();
    }

    function test_SE05_claimsAccumulateAcrossPayments() public {
        uint256 a = _pay(seller);
        uint256 b = _payFrom(buyer, sellerB, AMOUNT, DELIVERY); // penalty 2
        usdc.setBlocked(buyer, true);
        _timeout(a);
        _timeout(b);

        assertEq(escrow.claimable(buyer), 2 * AMOUNT + PENALTY + 2 * PENALTY);
        usdc.setBlocked(buyer, false);
        uint256 before = usdc.balanceOf(buyer);
        vm.prank(buyer);
        escrow.claim();
        assertEq(usdc.balanceOf(buyer), before + 2 * AMOUNT + 3 * PENALTY);
        _assertBacked();
    }

    function test_SE05_blockedAccountDoesNotAffectOtherPayments() public {
        uint256 a = _pay(seller);
        uint256 b = _payFrom(buyerB, sellerB, AMOUNT, DELIVERY);
        usdc.setBlocked(buyer, true);

        uint256 buyerBBefore = usdc.balanceOf(buyerB);
        _timeout(a);
        _timeout(b);

        assertEq(escrow.claimable(buyer), AMOUNT + PENALTY);
        assertEq(escrow.claimable(buyerB), 0);
        assertEq(usdc.balanceOf(buyerB), buyerBBefore + AMOUNT + 2 * PENALTY, "paid out directly");
        _assertBacked();
    }

    // ------------------------------ SE-04: the escrow itself is blocked ------------------------------

    function test_SE04_blockedEscrow_payoutsDeferred_nothingLeaves() public {
        uint256 id = _pay(seller);
        uint256 pot = usdc.balanceOf(address(escrow));
        usdc.setBlocked(address(escrow), true);

        vm.expectEmit(true, false, false, true, address(escrow));
        emit SuretyEscrow.PayoutDeferred(buyer, AMOUNT + PENALTY);
        _timeout(id);

        // Accounting still completes, but no USDC moved.
        assertTrue(_isStatus(id, SuretyEscrow.Status.Refunded));
        assertEq(escrow.claimable(buyer), AMOUNT + PENALTY);
        assertEq(usdc.balanceOf(address(escrow)), pot);

        vm.prank(buyer);
        vm.expectRevert("blocked");
        escrow.claim();
        vm.prank(seller);
        vm.expectRevert("blocked");
        escrow.withdrawBond(1);
        assertEq(escrow.sellerStats(seller).bond, BOND - PENALTY);
        _assertBacked();
    }

    function test_SE04_blockedEscrow_newMoneyCannotEnter() public {
        usdc.setBlocked(address(escrow), true);

        vm.prank(buyer);
        vm.expectRevert("blocked");
        escrow.pay(seller, AMOUNT, DELIVERY, JOB);
        vm.prank(seller);
        vm.expectRevert("blocked");
        escrow.addBond(1);

        // Reverted calls leave no trace.
        assertEq(escrow.lastPaymentId(), 0);
        assertEq(escrow.sellerStats(seller).bond, BOND);
        assertEq(escrow.sellerStats(seller).lockedBond, 0);
    }

    function test_SE04_blockedEscrow_releasePayoutDeferred_thenRecoversOnUnblock() public {
        uint256 id = _payAndDeliver(seller);
        usdc.setBlocked(address(escrow), true);
        vm.prank(buyer);
        escrow.release(id);
        assertEq(escrow.claimable(seller), AMOUNT);

        usdc.setBlocked(address(escrow), false);
        uint256 before = usdc.balanceOf(seller);
        vm.startPrank(seller);
        escrow.claim();
        escrow.withdrawBond(BOND);
        vm.stopPrank();
        assertEq(usdc.balanceOf(seller), before + AMOUNT + BOND);
        _assertBacked();
    }
}

/// @notice Two sellers with overlapping open payments stay fully independent.
contract SuretyAuditMultiSellerTest is SuretyAuditBase {
    function _h(address who) internal view returns (bytes32) {
        return keccak256(abi.encode(escrow.sellerStats(who)));
    }

    function _check() internal view {
        _assertBacked();
        _assertLocked(seller);
        _assertLocked(sellerB);
    }

    function test_twoSellers_interleavedLifecycle_independentBondsAndStats() public {
        // A = seller (10%), B = sellerB (20%).
        uint256 a1 = _payFrom(buyer, seller, 10 * USDC, DELIVERY); // penalty 1
        uint256 b1 = _payFrom(buyerB, sellerB, 50 * USDC, DELIVERY); // penalty 10
        uint256 a2 = _payFrom(buyerB, seller, 20 * USDC, DELIVERY); // penalty 2
        assertEq(escrow.sellerStats(seller).lockedBond, 3 * USDC);
        assertEq(escrow.sellerStats(sellerB).lockedBond, 10 * USDC);
        assertEq(usdc.balanceOf(address(escrow)), 3 * BOND + 80 * USDC);
        _check();

        // B declines: A untouched.
        bytes32 aHash = _h(seller);
        uint256 buyerBBefore = usdc.balanceOf(buyerB);
        vm.prank(sellerB);
        escrow.decline(b1);
        assertEq(usdc.balanceOf(buyerB), buyerBBefore + 50 * USDC);
        assertEq(_h(seller), aHash, "A unaffected by B's decline");
        assertEq(escrow.sellerStats(sellerB).lockedBond, 0);
        assertEq(escrow.sellerStats(sellerB).bond, BOND);
        _check();

        // B takes another job, A delivers a1.
        uint256 b2 = _payFrom(buyer, sellerB, 30 * USDC, DELIVERY); // penalty 6
        _deliver(seller, a1);
        assertEq(escrow.sellerStats(sellerB).lockedBond, 6 * USDC);
        _check();

        // Buyer releases a1: only A's lock shrinks.
        bytes32 bHash = _h(sellerB);
        uint256 sellerBefore = usdc.balanceOf(seller);
        vm.prank(buyer);
        escrow.release(a1);
        assertEq(usdc.balanceOf(seller), sellerBefore + 10 * USDC);
        assertEq(escrow.sellerStats(seller).lockedBond, 2 * USDC);
        assertEq(_h(sellerB), bHash, "B unaffected by A's release");
        _check();

        // Timeouts, B first: a refund on B never touches A's bond or stats.
        vm.warp(block.timestamp + DELIVERY + 1);
        aHash = _h(seller);
        uint256 buyerBefore = usdc.balanceOf(buyer);
        escrow.settle(b2);
        assertEq(usdc.balanceOf(buyer), buyerBefore + 30 * USDC + 6 * USDC);
        assertEq(_h(seller), aHash, "A unaffected by B's refund");
        assertEq(escrow.sellerStats(sellerB).bond, BOND - 6 * USDC);
        _check();

        bHash = _h(sellerB);
        escrow.settle(a2);
        assertEq(_h(sellerB), bHash, "B unaffected by A's refund");
        assertEq(escrow.sellerStats(seller).bond, BOND - 2 * USDC);
        _check();

        SuretyEscrow.Seller memory sa = escrow.sellerStats(seller);
        assertEq(sa.delivered, 1);
        assertEq(sa.refunded, 1);
        assertEq(sa.declined, 0);
        assertEq(sa.lockedBond, 0);
        SuretyEscrow.Seller memory sb = escrow.sellerStats(sellerB);
        assertEq(sb.delivered, 0);
        assertEq(sb.refunded, 1);
        assertEq(sb.declined, 1);
        assertEq(sb.lockedBond, 0);
    }

    function test_twoSellers_blockedBuyerClaimStaysCountedInBacking() public {
        uint256 a = _payFrom(buyerB, seller, AMOUNT, DELIVERY);
        uint256 b = _payFrom(buyerB, sellerB, AMOUNT, DELIVERY);
        usdc.setBlocked(buyerB, true);

        vm.warp(block.timestamp + DELIVERY + 1);
        escrow.settle(a);
        _check();
        vm.prank(sellerB);
        vm.expectRevert(SuretyEscrow.TooLate.selector); // too late to decline; settle slashes instead
        escrow.decline(b);
        escrow.settle(b);
        _check();

        assertEq(escrow.claimable(buyerB), 2 * AMOUNT + PENALTY + 2 * PENALTY);

        // A's seller can still withdraw their remaining bond: B's refund cannot touch it.
        vm.prank(seller);
        escrow.withdrawBond(BOND - PENALTY);
        _check();
    }

    function test_twoSellers_lockedBondIsPerSeller_exhaustingOneDoesNotBlockOther() public {
        // Lock every last unit of A's free bond; B keeps accepting payments.
        _payFrom(attacker, seller, 10 * BOND, DELIVERY);
        assertEq(escrow.freeBond(seller), 0);
        assertEq(escrow.freeBond(sellerB), BOND);

        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.InsufficientBond.selector);
        escrow.pay(seller, AMOUNT, DELIVERY, JOB);
        _payFrom(buyer, sellerB, AMOUNT, DELIVERY);
        assertEq(escrow.sellerStats(sellerB).lockedBond, 2 * PENALTY);
        _check();
    }
}
