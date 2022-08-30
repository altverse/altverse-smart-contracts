// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Escrow
 * @dev Base escrow contract, holds funds designated for a payee until they
 * withdraw them.
 */
contract RoleBasedSimplifiedEscrow is Initializable, AccessControl {
    using SafeERC20 for IERC20;
    using Address for address payable;

    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 public constant FUNDER_ROLE = keccak256("FUNDER_ROLE");
    bytes32 public constant PAYEE_ROLE = keccak256("PAYEE_ROLE");
    
    event Deposited(address indexed funder, IERC20 erc20Token, uint256 amount);
    event Withdrawn(address indexed payee, IERC20 erc20Token, uint256 amount);
    event PayeeRegistered(address indexed payee);
    event FunderRegistered(address indexed funder);
    event ContractActivated(address indexed funder);
    event ContractAccepted(address indexed payee);
    event DeliveryConfirmed(address indexed confirmer);

    modifier onlyFactory() {
        require(hasRole(FACTORY_ROLE, msg.sender), "RoleBasedEscrow: Only the factory can call this function.");
        _;
    }

    modifier onlyFactoryOrFunder() {
        require(hasRole(FACTORY_ROLE, msg.sender) || hasRole(FUNDER_ROLE, msg.sender), "RoleBasedEscrow: Only the factory OR funder can call this function.");
        _;
    }

    modifier onlyFunder() {
        require(hasRole(FUNDER_ROLE, msg.sender), "RoleBasedEscrow: Only the funder can call this function.");
        _;
    }

    modifier onlyPayee() {
        require(hasRole(PAYEE_ROLE, msg.sender), "RoleBasedEscrow: Only the payee can call this function.");
        _;
    }

    
    modifier onlyParticipant() {
        require(hasRole(FACTORY_ROLE, msg.sender) || hasRole(FUNDER_ROLE, msg.sender) || hasRole(PAYEE_ROLE, msg.sender), "RoleBasedEscrow: Only the participant can call this function.");
        _;
    }
   
    enum State {
        INITIALIZED,
        ACTIVATED, 
        FINALIZED
    }

    State internal _state;

    IERC20 fund;
    address payee;
    bool public isBaseContract;

    /**
     * @dev Constructor. 
     *      Constructor must be removed if you want to use Upgradeable.
     */
     constructor() {
        // The base contract must not be initialized, since we are using clones.
        isBaseContract = true;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(FACTORY_ROLE, msg.sender);
    }
    
    function __Escrow_init(address funderAddess, address payeeAddress) internal onlyInitializing { 
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(FACTORY_ROLE, msg.sender);
        
        if (payeeAddress != address(0)) _registerPayee(payeeAddress);
        if (funderAddess != address(0)) _registerFunder(funderAddess);

        _state = State.INITIALIZED;
    }

    function __Escrow_init_unchained() internal onlyInitializing {
    }

    function initialize(address funderAddress, address payeeAddress) public virtual initializer {
        require(isBaseContract == false, "ArbitrableEscrow: The base contract cannot be initialized");
        require(payeeAddress != funderAddress, "ArbitrableEscrow: payee cannot be itself");

        __Escrow_init(funderAddress, payeeAddress);
        __Escrow_init_unchained();
    }

    /**
     * @dev Register payee
     */
    function registerAsPayee() public {
        require(state() < State.ACTIVATED, "RoleBasedEscrow: can only deposit while INITIATED");

        _registerPayee(msg.sender);
    }

    function _registerPayee(address payeeAddress) internal {
        require(payeeAddress != address(0), "RoleBasedEscrow: payee address must not be empty");
        require(payee != address(0), "RoleBasedEscrow: only one payee can exist");
        
        payee = payeeAddress;
        _setupRole(PAYEE_ROLE, payeeAddress);

        emit PayeeRegistered(payeeAddress);
    }
    
    /**
     * @dev This must not be called from external. Only one funder can exist.
     */
    function _registerFunder(address funder) internal {
        require(funder != address(0), "RoleBasedEscrow: funder address must not be empty");
        require(funder != payee, "RoleBasedEscrow: payee cannot be a funder");

        _setupRole(FUNDER_ROLE, funder);

        emit FunderRegistered(funder);
    }

    /**
     * @dev Deposit ERC20 compatible funds after the contract has initiated.
     * @param tokenAddress token to be deposited
     */
    function deposit(address tokenAddress) payable external {
        require(state() < State.FINALIZED, "RoleBasedEscrow: can only deposit before FINALIZED");
        require(msg.value > 0, "RoleBasedEscrow: Token amount must be greater than zero");
        require(address(fund) == address(0) || address(fund) == tokenAddress, "RoleBasedEscrow: Can only deposit 1 token at once");
        
        IERC20 erc20Token = IERC20(tokenAddress);
        erc20Token.safeTransferFrom(msg.sender, address(this), msg.value);
        fund = erc20Token;

        _registerFunder(msg.sender);

        emit Deposited(msg.sender, erc20Token, msg.value);
    }

    /**
     * @dev Withdraw accumulated balance for a payee, forwarding all gas to the
     * recipient.
     *
     * WARNING: Forwarding all gas opens the door to reentrancy vulnerabilities.
     * Make sure you trust the recipient, or are either following the
     * checks-effects-interactions pattern or using {ReentrancyGuard}.
     *
     *
     * Emits a {Withdrawn} event.
     */
    function withdraw() external virtual onlyParticipant {
        require(withdrawalAllowed(msg.sender), "RoleBasedEscrow: Cannot withdraw on current state");
        
        _withdraw(msg.sender);
    }

    function _withdraw(address payeeAddress) private {
        uint256 amount = fund.balanceOf(address(this));
        fund.transfer(payeeAddress, amount);

        _state = State.FINALIZED;

        emit Withdrawn(payeeAddress, fund, amount);
    }

    function withdrawalAllowed(address wallet) public view virtual returns (bool) {
        if (hasRole(FUNDER_ROLE, wallet)) {
            return state() == State.INITIALIZED;
        }
        
        if (hasRole(PAYEE_ROLE, wallet)) {
            return state() == State.FINALIZED;
        }

        return false;
    }

    function activateContract() external virtual onlyFunder {
        require(state() == State.INITIALIZED, "RoleBasedEscrow: Escrow can be activated only after initialized");
        require(payee != address(0), "RoleBasedEscrow: There must be at least one payee");

        _state = State.ACTIVATED;

        emit ContractActivated(msg.sender);
    }

    /**
     * @dev Settle accumulated funds for a payee.
     * @param autoWithdraw forwarding all gas to the recipient 
     * WARNING: Forwarding all gas opens the door to reentrancy vulnerabilities.
     * Make sure you trust the recipient, or are either following the
     * checks-effects-interactions pattern or using {ReentrancyGuard}.
     *
     * Emits a {Withdrawn} event.
     */
    function settle(bool autoWithdraw) public virtual onlyFactoryOrFunder {
        require(state() == State.ACTIVATED, "RoleBasedEscrow: Escrow can be finalized (settled) on ACTIVATED state only");
        
        _state = State.FINALIZED;

        // Withdraw
        if (autoWithdraw) {
            _withdraw(payee);
        }
    }

    /**
     * @return The current state of the escrow.
     */
    function state() public view virtual returns (State) {
        return _state;
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/#storage_gaps
     */
    uint256[49] private __gap;
}
