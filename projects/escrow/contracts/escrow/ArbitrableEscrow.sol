// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./RoleBasedEscrow.sol";

/**
 * @title ArbitrableEscrow
 * @dev Escrow that holds funds for a transaction between 2 parties. Arbiters can be allocated when a dispute has occurred.
 * @dev Intended usage: See openzeppelin's {Escrow}. Same usage guidelines apply here.
 * @dev The owner account (that is, the contract that instantiates this
 * contract) may deposit, close the deposit period, and allow for either
 * withdrawal by the payee, or refunds to the depositors. 
 */
contract ArbitrableEscrow is Initializable, RoleBasedEscrow  {
    using SafeERC20 for ERC20;

    event Disputed(address indexed caller);

    bool public isInDispute;
    
    function __ArbitrableEscrow_init() internal onlyInitializing {
        __ArbitrableEscrow_init_unchained();
    }

    function __ArbitrableEscrow_init_unchained() internal onlyInitializing {
    }

    /**
     * @dev Initializer. Since the contract will be cloned and constructor is redundant, we need initialize function.
     * @param payee of the deposits.
     */
    function _initialize(address funder, address payee, string memory title_) internal override {
        require(!isBaseContract, "ArbitrableEscrow: The base contract cannot be initialized");
        require(payee != funder, "ArbitrableEscrow: payee cannot be itself");

        __ArbitrableEscrow_init();
        __Escrow_init(funder, payee, title_);
    }

    function requestArbitration() external onlyParticipant {
        require(state() == State.ACTIVATED, "ArbitrableEscrow: can only start arbitration while ACTIVE");

        isInDispute = true;

        // TODO: add arbitrators using arbitrator contract.
        emit Disputed(msg.sender);
    }
}