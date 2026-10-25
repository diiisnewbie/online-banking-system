// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IVaultManager {
    function paused() external view returns (bool);
    function feeReceiver() external view returns (address);
    function payoutInterest(address to, uint256 amount) external;
}
