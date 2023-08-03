// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.11;

library InitStorage {
    bytes32 constant INIT_STORAGE_POSITION = keccak256("init.storage");

    struct Data {
        bool initialized;
    }

    function initStorage() internal pure returns (Data storage initData) {
        bytes32 position = INIT_STORAGE_POSITION;
        assembly {
            initData.slot := position
        }
    }
}