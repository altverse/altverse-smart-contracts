// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (utils/escrow/Escrow.sol)

pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title Escrow
 * @dev Base escrow contract, holds funds designated for a payee until they
 * withdraw them.
 */
contract RoleBasedEscrowUpgradeable is Initializable, AccessControlUpgradeable {
    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 public constant FOUNDER_ROLE = keccak256("FOUNDER_ROLE");
    bytes32 public constant PAYEE_ROLE = keccak256("PAYEE_ROLE");

    modifier onlyFactory() {
        require(hasRole(FACTORY_ROLE, msg.sender), "Only the factory can call this function.");
        _;
    }

    modifier onlyFounder() {
        require(hasRole(FOUNDER_ROLE, msg.sender), "Only the founder can call this function.");
        _;
    }

    modifier onlyPayee() {
        require(hasRole(PAYEE_ROLE, msg.sender), "Only the payee can call this function.");
        _;
    }

    function __Escrow_init() internal onlyInitializing { 
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(FACTORY_ROLE, msg.sender);
    }

    function __Escrow_init_unchained() internal onlyInitializing {
    }

    function initialize(address payable founder, address payable payee) public virtual initializer {
        __Escrow_init();

        _setupRole(FOUNDER_ROLE, founder);
        _setupRole(PAYEE_ROLE, payee);
    }

    using AddressUpgradeable for address payable;

    event Deposited(address indexed payee, uint256 weiAmount);
    event Withdrawn(address indexed payee, uint256 weiAmount);

    mapping(address => uint256) private _deposits;

    function depositsOf(address payee) public view returns (uint256) {
        return _deposits[payee];
    }

    /**
     * @dev Stores the sent amount as credit to be withdrawn.
     * @param payee The destination address of the funds.
     *
     * Emits a {Deposited} event.
     */
    function deposit(address payee) public payable virtual {
        uint256 amount = msg.value;
        _deposits[payee] += amount;
        emit Deposited(payee, amount);
    }

    /**
     * @dev Withdraw accumulated balance for a payee, forwarding all gas to the
     * recipient.
     *
     * WARNING: Forwarding all gas opens the door to reentrancy vulnerabilities.
     * Make sure you trust the recipient, or are either following the
     * checks-effects-interactions pattern or using {ReentrancyGuard}.
     *
     * @param payee The address whose funds will be withdrawn and transferred to.
     *
     * Emits a {Withdrawn} event.
     */
    function withdraw(address payable payee) public virtual {
        uint256 payment = _deposits[payee];

        _deposits[payee] = 0;

        payee.sendValue(payment);

        emit Withdrawn(payee, payment);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
