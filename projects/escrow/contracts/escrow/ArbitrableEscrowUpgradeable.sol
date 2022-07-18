// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
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
    using AddressUpgradeable for address payable;
    
    event ContractAccepted(address indexed primaryPayee);
    event DeliveryConfirmed(address indexed confirmer);
    event Disputed(address indexed caller);

    enum State {
        INITIATED, 
        ACTIVE, 
        DISPUTE, // Dispute occurrs
        FINALIZED,
        CLOSED
    }

    State private _state;

    bool public isBaseContract;
    address public factory;
    address public primaryFounder;
    address public primaryPayee;

    /**
     * @dev Constructor.
     */
     constructor() {
        console.log("constructor Escrow");

        // The base contract must not be initialized, since we are using clones.
        isBaseContract = true;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(FACTORY_ROLE, msg.sender);
        _setupRole(FOUNDER_ROLE, msg.sender);
        _setupRole(PAYEE_ROLE, msg.sender);
    }

    function __ArbitrableEscrow_init() internal onlyInitializing {
        __Escrow_init();
        __ArbitrableEscrow_init_unchained();
    }

    function __ArbitrableEscrow_init_unchained() internal onlyInitializing {
    }

    /**
     * @dev Initializer. Since the contract will be cloned and constructor is redundant, we need initialize function.
     * @param initialPayee of the deposits.
     */
    function initialize(address payable initialPayee, address payable founder) initializer public override {
        console.log("initialize Arb Escrow");
        require(isBaseContract == false, "ArbitrableEscrow: The base contract cannot be initialized");
        require(initialPayee != address(0), "ArbitrableEscrow: initialPayee is the zero address");
        require(initialPayee != address(founder), "ArbitrableEscrow: initialPayee cannot be itself");
        
        __ArbitrableEscrow_init();
        
        factory = msg.sender;
        primaryPayee = initialPayee;
        primaryFounder = founder;

        _setupRole(FOUNDER_ROLE, founder);
        _setupRole(PAYEE_ROLE, initialPayee);

        console.log('initialize msg.sender:', msg.sender);
        console.log('initialize founder:', founder);
        console.log('initialize payee:', initialPayee);

        _state = State.INITIATED;
    }

    /**
     * @dev Deposit funds
     * @param payee The address funds will be sent to if the contract is finzalied.
     */
    function deposit(address payee) public payable virtual override {
        require(state() == State.INITIATED, "ArbitrableEscrow: can only deposit while INITIATED");
        super.deposit(payee);
    }

    /**
     * @dev Deposit additional funds after the contract has initiated.
     * @param payee The address funds will be sent to if the contract is finzalied.
     */
    function addFunds(address payee) external payable {
        require(state() != State.FINALIZED && state() != State.CLOSED, "ArbitrableEscrow: can only deposit while ACTIVE");
        super.deposit(payee);
    }

    function withdrawalAllowed(address) public view returns (bool) {
        return state() == State.FINALIZED;
    }

    function withdraw(address payable payee) public override {
        require(withdrawalAllowed(payee) == true, "Withdraw is not allowed to payee");
        super.withdraw(payee);
    }

    /**
     * @return The current state of the escrow.
     */
    function state() public view virtual returns (State) {
        return _state;
    }

    function acceptContract() external onlyPayee {
        require(address(msg.sender) == primaryPayee, "ArbitrableEscrow: only the primary payee can accept the contract");
        _state = State.ACTIVE;

        emit ContractAccepted(msg.sender);
    }

    function confirmDelivery() external onlyFounder {
        require(state() == State.ACTIVE || state() == State.DISPUTE, "ArbitrableEscrow: can only confirm delivery while ACTIVE or on DISPUTE");
        _state = State.FINALIZED;

        emit DeliveryConfirmed(msg.sender);
    }

    function requestArbitration() external onlyFounder onlyPayee {
        require(state() == State.ACTIVE, "ArbitrableEscrow: can only start arbitration while ACTIVE");
        _state = State.DISPUTE;

        // TODO: add arbitrators using arbitrator contract.
        emit Disputed(msg.sender);
    }
}