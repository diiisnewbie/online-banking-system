// SPDX-License-Identifier: MIT
// TESTING ONLY — NOT FOR PRODUCTION
pragma solidity ^0.8.28;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SavingCore} from "../SavingCore.sol";

contract ReentrantReceiver is IERC721Receiver {
    SavingCore public targetCore;
    uint256 public attackAmount;
    bool public hasAttacked;

    function attack(SavingCore core, IERC20 usdc, uint256 amount) external {
        targetCore = core;
        attackAmount = amount;
        hasAttacked = false;

        usdc.approve(address(core), amount * 2);
        core.openDeposit(0, amount);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        if (!hasAttacked) {
            hasAttacked = true;
            targetCore.openDeposit(0, attackAmount);
        }
        return this.onERC721Received.selector;
    }
}
