// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// CHỈ ĐỂ TEST — cố tình chèn biến `z` TRƯỚC `x` để phá storage layout.
contract BoxV2Unsafe is Initializable, OwnableUpgradeable {
    uint256 private z;
    uint256 private x;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
    }

    function set(uint256 value) external {
        x = value;
    }

    function get() external view returns (uint256) {
        return x;
    }

    function setZ(uint256 value) external {
        z = value;
    }

    function getZ() external view returns (uint256) {
        return z;
    }
}
