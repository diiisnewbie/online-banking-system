// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVaultManager} from "./interfaces/IVaultManager.sol";
import {ISavingCore} from "./interfaces/ISavingCore.sol";

contract VaultManager is IVaultManager, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Custom Errors ---
    error ZeroAddress();
    error SavingCoreAlreadySet();
    error NotSavingCore();
    error InsufficientVaultLiquidity();
    error AmountExceedsBalance();
    error InsufficientCommitted();

    // --- Events ---
    event SavingCoreSet(address indexed core);
    event FeeReceiverSet(address indexed receiver);
    event VaultFunded(address indexed funder, uint256 amount);
    event VaultWithdrawn(address indexed to, uint256 amount);
    event InterestPaid(address indexed to, uint256 amount);

    // --- State Variables ---
    IERC20 public immutable usdc;
    address public savingCore;
    address public override feeReceiver;

    constructor(IERC20 usdc_, address initialOwner) Ownable(initialOwner) {
        if (address(usdc_) == address(0)) revert ZeroAddress();
        usdc = usdc_;
        feeReceiver = initialOwner;
    }

    function paused() public view override(IVaultManager, Pausable) returns (bool) {
        return super.paused();
    }

    function setSavingCore(address core) external onlyOwner {
        if (savingCore != address(0)) revert SavingCoreAlreadySet();
        if (core == address(0)) revert ZeroAddress();
        savingCore = core;
        emit SavingCoreSet(core);
    }

    function setFeeReceiver(address r) external onlyOwner {
        if (r == address(0)) revert ZeroAddress();
        feeReceiver = r;
        emit FeeReceiverSet(r);
    }

    function fundVault(uint256 amount) external onlyOwner nonReentrant {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit VaultFunded(msg.sender, amount);
    }

    function withdrawVault(uint256 amount) external onlyOwner whenNotPaused nonReentrant {
        uint256 balance = usdc.balanceOf(address(this));
        if (amount > balance) revert AmountExceedsBalance();

        // Chot chan C2 [D25]: Chi kiem tra khi da ket noi SavingCore [D34]
        if (savingCore != address(0)) {
            uint256 committed = ISavingCore(savingCore).totalCommittedInterest();
            if (balance - amount < committed) revert InsufficientCommitted();
        }

        usdc.safeTransfer(msg.sender, amount);
        emit VaultWithdrawn(msg.sender, amount);
    }

    function payoutInterest(address to, uint256 amount) external override whenNotPaused nonReentrant {
        if (msg.sender != savingCore) revert NotSavingCore();
        if (amount == 0) return;
        if (usdc.balanceOf(address(this)) < amount) revert InsufficientVaultLiquidity();
        usdc.safeTransfer(to, amount);
        emit InterestPaid(to, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
