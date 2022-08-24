// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./RoleBasedEscrowUpgradeable.sol";

/**
 * @title ArbitrableEscrow
 * @dev Escrow that holds funds for a transaction between 2 parties. Arbiters can be allocated when a dispute has occurred.
 * @dev Intended usage: See {Escrow}. Same usage guidelines apply here.
 * @dev The owner account (that is, the contract that instantiates this
 * contract) may deposit, close the deposit period, and allow for either
 * withdrawal by the payee, or refunds to the depositors. 
 */
contract ArbitrableEscrowUpgradeable is Initializable, RoleBasedEscrowUpgradeable  {
    using SafeERC20 for IERC20;

    event Disputed(address indexed caller);

    bool public isInDispute = false;
    
    function __ArbitrableEscrow_init() internal onlyInitializing {
        __ArbitrableEscrow_init_unchained();
    }

    function __ArbitrableEscrow_init_unchained() internal onlyInitializing {
    }

    /**
     * @dev Initializer. Since the contract will be cloned and constructor is redundant, we need initialize function.
     * @param payee of the deposits.
     */
    function initialize(address funder, address payee) initializer public override {
        require(isBaseContract == false, "ArbitrableEscrow: The base contract cannot be initialized");
        require(payee != funder, "ArbitrableEscrow: payee cannot be itself");

        __ArbitrableEscrow_init();
        __Escrow_init(funder, payee);
    }

    function requestArbitration() external onlyFunder onlyPayee {
        require(state() == State.ACTIVE, "ArbitrableEscrow: can only start arbitration while ACTIVE");

        isInDispute = true;

        // TODO: add arbitrators using arbitrator contract.
        emit Disputed(msg.sender);
    }
}