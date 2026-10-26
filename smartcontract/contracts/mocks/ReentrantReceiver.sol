// SPDX-License-Identifier: MIT
// TESTING ONLY - NOT FOR PRODUCTION
pragma solidity ^0.8.28;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SavingCore} from "../SavingCore.sol";

contract ReentrantReceiver is IERC721Receiver {
    enum AttackMode { None, OpenDeposit, RenewDeposit, WithdrawAtMaturity }

    SavingCore public targetCore;
    IERC20 public targetUsdc;
    uint256 public attackAmount;
    uint256 public attackDepositId;
    uint256 public attackNewPlanId;
    AttackMode public mode;
    bool public hasAttacked;

    function openLegitimate(SavingCore core, IERC20 usdc, uint256 amount) external {
        targetCore = core;
        targetUsdc = usdc;
        mode = AttackMode.None;
        hasAttacked = false;

        usdc.approve(address(core), amount);
        core.openDeposit(0, amount);
    }

    function attack(SavingCore core, IERC20 usdc, uint256 amount) external {
        targetCore = core;
        targetUsdc = usdc;
        attackAmount = amount;
        mode = AttackMode.OpenDeposit;
        hasAttacked = false;

        usdc.approve(address(core), amount * 2);
        core.openDeposit(0, amount);
    }

    function attackRenew(SavingCore core, IERC20 usdc, uint256 depositId, uint256 newPlanId) external {
        targetCore = core;
        targetUsdc = usdc;
        attackDepositId = depositId;
        attackNewPlanId = newPlanId;
        mode = AttackMode.RenewDeposit;
        hasAttacked = false;

        core.renewDeposit(depositId, newPlanId);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external override returns (bytes4) {
        if (!hasAttacked && mode != AttackMode.None) {
            hasAttacked = true;
            if (mode == AttackMode.OpenDeposit) {
                targetCore.openDeposit(0, attackAmount);
            } else if (mode == AttackMode.RenewDeposit) {
                targetCore.renewDeposit(attackDepositId, attackNewPlanId);
            } else if (mode == AttackMode.WithdrawAtMaturity) {
                targetCore.withdrawAtMaturity(attackDepositId);
            }
        }
        return this.onERC721Received.selector;
    }
}
