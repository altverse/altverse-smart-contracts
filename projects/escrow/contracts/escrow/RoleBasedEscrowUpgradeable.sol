// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (utils/escrow/Escrow.sol)

pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Escrow
 * @dev Base escrow contract, holds funds designated for a payee until they
 * withdraw them.
 */
contract RoleBasedEscrowUpgradeable is Initializable, AccessControlUpgradeable {
    using SafeERC20 for IERC20;
    using AddressUpgradeable for address payable;

    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 public constant FUNDER_ROLE = keccak256("FUNDER_ROLE");
    bytes32 public constant PAYEE_ROLE = keccak256("PAYEE_ROLE");
    
    event Initialized(address indexed funder, address indexed payee);
    event Deposited(address indexed funder, IERC20 erc20Token, uint256 amount);
    event Withdrawn(address indexed payee, IERC20[] erc20Token, uint256[] amount);
    event PayeeRegistered(address indexed payee);
    event FunderRegistered(address indexed funder);
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
        GENESIS,
        INITIALIZED, 
        ACTIVE, 
        FINALIZED
    }

    State internal _state;

    IERC20[] fundedTokens;
    address[] public payees;
    address[] public funders;
    mapping (address => mapping (IERC20 => uint256)) public funds;

    bool public isBaseContract;
    address private _factory;
    
    /**
     * @dev Constructor.
     */
     constructor() {
        console.log("constructor RoleBasedEscrow");

        // The base contract must not be initialized, since we are using clones.
        isBaseContract = true;

        _factory = msg.sender;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(FACTORY_ROLE, msg.sender);
        _setupRole(FUNDER_ROLE, msg.sender);
        _setupRole(PAYEE_ROLE, msg.sender);
    }

    function __Escrow_init(address funder, address payee) internal onlyInitializing { 
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(FACTORY_ROLE, msg.sender);
        
        console.log(payee);
        console.log(funder);

        if (payee != address(0)) {
            payees.push(payee);
            _setupRole(PAYEE_ROLE, payee);
        }

        if (funder != address(0)) {
            funders.push(funder);
            _setupRole(FUNDER_ROLE, funder);
        }
    }

    function __Escrow_init_unchained() internal onlyInitializing {
    }

    function initialize(address funder, address payee) public virtual initializer {
        require(isBaseContract == false, "ArbitrableEscrow: The base contract cannot be initialized");
        require(payee != funder, "ArbitrableEscrow: payee cannot be itself");

        __Escrow_init(funder, payee);

        emit Initialized(funder, payee);
    }

    /**
     * @dev Register payee
     */
    function registerAsPayee() public {
        require(state() < State.ACTIVE, "RoleBasedEscrow: can only deposit while INITIATED");
        require(funderExist(msg.sender) == false, "RoleBasedEscrow: funder cannot be a payee");

        payees.push(msg.sender);
        _setupRole(PAYEE_ROLE, msg.sender);

        emit PayeeRegistered(msg.sender);
    }

    /**
     * @dev Register payee
     */
    function registerAsFunder() public {
        require(state() < State.ACTIVE, "RoleBasedEscrow: can only deposit while INITIATED");
        require(payeeExist(msg.sender) == false, "RoleBasedEscrow: payee cannot be a funder");

        funders.push(msg.sender);
        _setupRole(FUNDER_ROLE, msg.sender);

        emit FunderRegistered(msg.sender);
    }

    /**
     * @dev Deposit funds after the contract has initiated.
     * @param tokenAddress token to be deposited
     * @param amount amount of token to be deposited
     */
    function deposit(address tokenAddress, uint256 amount) external onlyFunder {
        require(state() > State.GENESIS && state() <= State.ACTIVE, "RoleBasedEscrow: can only deposit after INITIATED");
        require(amount > 0, "RoleBasedEscrow: Token amount must be greater than zero");
        require(payeeExist(msg.sender) == false, "RoleBasedEscrow: Funder cannot be one of the payees");

        IERC20 erc20Token = IERC20(tokenAddress);
        _addTokenList(erc20Token);
        _addFunder(msg.sender);

        funds[msg.sender][erc20Token] += amount;

        emit Deposited(msg.sender, erc20Token, amount);
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

    function _withdraw(address payee) private {
        IERC20[] memory tokenWithdrawn;
        uint256[] memory amountWithdrawn;

        for (uint i = 0; i < fundedTokens.length; i++) {
            IERC20 token = fundedTokens[i];
            uint256 amount = funds[payee][token];
            if (amount > 0) {
                token.safeTransferFrom(address(this), payee, amount);
                funds[payee][token] = 0;

                tokenWithdrawn[tokenWithdrawn.length] = token;
                amountWithdrawn[tokenWithdrawn.length] = amount;
            }
        }

        emit Withdrawn(msg.sender, tokenWithdrawn, amountWithdrawn);
    }

    function withdrawalAllowed(address) public view virtual returns (bool) {
        return state() == State.INITIALIZED || state() == State.FINALIZED;
    }

    function acceptContract() external virtual onlyPayee {
        require(state() == State.INITIALIZED, "RoleBasedEscrow: Escrow can be activated only after initialized");
        _state = State.ACTIVE;

        emit ContractAccepted(msg.sender);
    }

    function confirmDelivery(bool autoWithdraw) external virtual onlyFunder {
        require(state() == State.ACTIVE, "ArbitrableEscrow: can only confirm delivery while ACTIVE or on DISPUTE");
        _state = State.FINALIZED;

        settle(autoWithdraw);

        emit DeliveryConfirmed(msg.sender);
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
        require(state() == State.ACTIVE, "RoleBasedEscrow: Escrow can be finalized (settled) on ACTIVE state only");
        
        // For each token funded
        for (uint tokenIndex = 0; tokenIndex < fundedTokens.length; tokenIndex++) {
            IERC20 token = fundedTokens[tokenIndex];
            uint256 totalAmountPerToken = _totalAmountOf(token, funders);

            // Then distribute to payees equally
            if (totalAmountPerToken > 0 && payees.length > 0) {
                uint256 numberOfPayees = payees.length;
                uint256 amountEach = numberOfPayees / totalAmountPerToken;

                for (uint payeeIndex = 0; payeeIndex < payees.length; payeeIndex++) {
                    address payee = payees[payeeIndex];
                    funds[payee][token] = amountEach;             
                    totalAmountPerToken -= amountEach;

                    // Withdraw
                    if (autoWithdraw) {
                        _withdraw(payee);
                    }
                }

                // TODO: Put leftover amount to Treasury
                console.log("LeftOver: token - ", address(token));
                console.log("LeftOver: totalAmountPerToken - ", totalAmountPerToken);
            }
        }

        _state = State.FINALIZED;
    }

    function _totalAmountOf(IERC20 token, address[] memory parties) private view returns (uint256) {
        uint256 totalAmountPerToken = 0;
        for (uint index = 0; index < parties.length; index++) {
            address party = parties[index];
            totalAmountPerToken = funds[party][token];
        }

        return totalAmountPerToken;
    }

    /**
     * @return The current state of the escrow.
     */
    function state() public view virtual returns (State) {
        return _state;
    }

    function payeeExist(address payee) public view returns (bool) {
        return _existingAddress(payees, payee);
    }

    function funderExist(address funder) public view returns (bool) {
        return _existingAddress(funders, funder);
    }

    function _existingAddress(address[] memory array, address target) private pure returns (bool) {
        for (uint i = 0; i < array.length; i++) {
            if (array[i] == target) {
                return true;
            }
        }

        return false;
    }

    function _addTokenList(IERC20 token) private {
        for (uint i = 0; i < fundedTokens.length; i++) {
            if (fundedTokens[i] == token) {
                fundedTokens[i] = token;
                return;
            }
        }

        fundedTokens[fundedTokens.length] = token;
    }

    function _addFunder(address funder) private {
        for (uint i = 0; i < funders.length; i++) {
            if (funders[i] == funder) {
                // Already exist. Should not add on the list.
                return;
            }
        }

        // Add new funder on the list.
        funders.push(funder);
        _setupRole(FUNDER_ROLE, funder);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
