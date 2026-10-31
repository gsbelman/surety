// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SuretyEscrow} from "../src/SuretyEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @notice Drives random lifecycles and tracks what the escrow must hold.
contract Handler is Test {
    SuretyEscrow public immutable escrow;
    MockUSDC public immutable usdc;

    address[] public sellers;
    address[] public buyers;
    uint256[] public ids;

    constructor(SuretyEscrow target, MockUSDC token) {
        escrow = target;
        usdc = token;
        for (uint256 i; i < 3; i++) {
            address seller = makeAddr(string.concat("seller", vm.toString(i)));
            address buyer = makeAddr(string.concat("buyer", vm.toString(i)));
            sellers.push(seller);
            buyers.push(buyer);
            usdc.mint(seller, 1_000_000e6);
            usdc.mint(buyer, 1_000_000e6);
            vm.startPrank(seller);
            usdc.approve(address(escrow), type(uint256).max);
            escrow.register(uint16(500 * (i + 1)), 60, 60, address(0));
            escrow.addBond(10_000e6);
            vm.stopPrank();
            vm.prank(buyer);
            usdc.approve(address(escrow), type(uint256).max);
        }
    }

    function sellerCount() external view returns (uint256) {
        return sellers.length;
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function _id(uint256 seed) internal view returns (uint256) {
        return ids[seed % ids.length];
    }

    function pay(uint256 sellerSeed, uint256 buyerSeed, uint256 amount, uint32 window) external {
        address seller = sellers[sellerSeed % sellers.length];
        address buyer = buyers[buyerSeed % buyers.length];
        amount = bound(amount, 1, 1_000e6);
        window = uint32(bound(window, 60, 1 days));
        vm.prank(buyer);
        try escrow.pay(seller, amount, window, bytes32(0)) returns (uint256 id) {
            ids.push(id);
        } catch {}
    }

    function deliver(uint256 seed) external {
        if (ids.length == 0) return;
        uint256 id = _id(seed);
        vm.prank(escrow.getPayment(id).seller);
        try escrow.deliver(id, bytes32(uint256(1))) {} catch {}
    }

    function decline(uint256 seed) external {
        if (ids.length == 0) return;
        uint256 id = _id(seed);
        vm.prank(escrow.getPayment(id).seller);
        try escrow.decline(id) {} catch {}
    }

    function release(uint256 seed) external {
        if (ids.length == 0) return;
        uint256 id = _id(seed);
        vm.prank(escrow.getPayment(id).buyer);
        try escrow.release(id) {} catch {}
    }

    function object(uint256 seed) external {
        if (ids.length == 0) return;
        uint256 id = _id(seed);
        vm.prank(escrow.getPayment(id).buyer);
        try escrow.object(id) {} catch {}
    }

    function settle(uint256 seed) external {
        if (ids.length == 0) return;
        try escrow.settle(_id(seed)) {} catch {}
    }

    function withdrawBond(uint256 sellerSeed, uint256 amount) external {
        address seller = sellers[sellerSeed % sellers.length];
        amount = bound(amount, 1, 10_000e6);
        vm.prank(seller);
        try escrow.withdrawBond(amount) {} catch {}
    }

    function addBond(uint256 sellerSeed, uint256 amount) external {
        address seller = sellers[sellerSeed % sellers.length];
        amount = bound(amount, 1, 1_000e6);
        vm.prank(seller);
        try escrow.addBond(amount) {} catch {}
    }

    function setBlocked(uint256 buyerSeed, bool isBlocked) external {
        usdc.setBlocked(buyers[buyerSeed % buyers.length], isBlocked);
    }

    function warp(uint256 secondsForward) external {
        vm.warp(block.timestamp + bound(secondsForward, 1, 2 days));
    }
}

contract SuretyEscrowInvariantTest is Test {
    SuretyEscrow internal escrow;
    MockUSDC internal usdc;
    Handler internal handler;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new SuretyEscrow(IERC20(address(usdc)));
        handler = new Handler(escrow, usdc);
        targetContract(address(handler));
    }

    /// @dev Open escrow plus bonds plus claims must equal the balance of the contract.
    function invariant_escrowIsFullyBacked() public view {
        uint256 owed;
        for (uint256 i; i < handler.sellerCount(); i++) {
            owed += escrow.sellerStats(handler.sellers(i)).bond;
            owed += escrow.claimable(handler.buyers(i));
        }
        for (uint256 i; i < handler.idCount(); i++) {
            SuretyEscrow.Payment memory p = escrow.getPayment(handler.ids(i));
            if (p.status == SuretyEscrow.Status.Pending || p.status == SuretyEscrow.Status.Delivered) {
                owed += p.amount;
            }
        }
        assertEq(usdc.balanceOf(address(escrow)), owed);
    }

    /// @dev Open penalties must equal the locked bond, and the lock must fit inside the bond.
    function invariant_lockedBondMatchesOpenPenalties() public view {
        for (uint256 i; i < handler.sellerCount(); i++) {
            address seller = handler.sellers(i);
            SuretyEscrow.Seller memory s = escrow.sellerStats(seller);
            uint256 open;
            for (uint256 j; j < handler.idCount(); j++) {
                SuretyEscrow.Payment memory p = escrow.getPayment(handler.ids(j));
                bool isOpen = p.status == SuretyEscrow.Status.Pending || p.status == SuretyEscrow.Status.Delivered;
                if (p.seller == seller && isOpen) open += p.penalty;
            }
            assertEq(s.lockedBond, open);
            assertLe(s.lockedBond, s.bond);
        }
    }
}
