// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Box} from "./Box.sol";

contract BoxV2 is Box {
    uint256 private y;

    function setY(uint256 value) external {
        y = value;
    }

    function getY() external view returns (uint256) {
        return y;
    }

    function version() external pure returns (string memory) {
        return "2.0.0";
    }
}
