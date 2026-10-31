// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SuretyEscrow} from "../src/SuretyEscrow.sol";

/// @notice Deploys SuretyEscrow. The key comes from the environment, so it never appears in argv.
contract Deploy is Script {
    /// @dev The ERC-20 interface of USDC, on Arc mainnet and Arc testnet.
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (SuretyEscrow escrow) {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        escrow = new SuretyEscrow(IERC20(ARC_USDC));
        vm.stopBroadcast();
    }
}
