// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A 6-decimal USDC stand-in with the blocklist behavior of real USDC.
contract MockUSDC is ERC20 {
    mapping(address account => bool blocked) public blocked;

    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal virtual override {
        require(!blocked[from] && !blocked[to], "blocked");
        super._update(from, to, value);
    }
}

/// @notice A token with 18 decimals. The escrow must reject it.
contract Mock18Decimals is ERC20 {
    constructor() ERC20("Wrong", "WRONG") {}
}

/// @notice A token that calls a hook on each transfer, so a test can attempt reentrancy.
contract HookToken is MockUSDC {
    address public hook;

    function setHook(address newHook) external {
        hook = newHook;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        address h = hook;
        if (h != address(0)) {
            hook = address(0);
            Reenterer(h).onTransfer();
            hook = h;
        }
    }
}

interface Reenterer {
    function onTransfer() external;
}
