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
contract RoleBasedEscrow is Initializable, AccessControl {
    using SafeERC20 for IERC20;
    using Address for address payable;

    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 public constant FUNDER_ROLE = keccak256("FUNDER_ROLE");
    bytes32 public constant PAYEE_ROLE = keccak256("PAYEE_ROLE");
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");
    
    event Deposited(address indexed funder, IERC20 erc20Token, uint256 amount);
    event Withdrawn(address indexed payee, IERC20[] erc20Token, uint256[] amount);
    event PayeeRegistered(address indexed payee);
    event FunderRegistered(address indexed funder);
    event ContractActivated(address indexed funder);
    event FinalizeContract(address indexed sender);

    modifier onlyFactory() {
        require(hasRole(FACTORY_ROLE, msg.sender), "RoleBasedEscrow: Only the factory can call this function.");
        _;
    }

    modifier onlyCreator() {
        require(hasRole(CREATOR_ROLE, msg.sender), "RoleBasedEscrow: Only the creator can call this function.");
        _;
    }

    modifier onlyPayee() {
        require(hasRole(PAYEE_ROLE, msg.sender), "RoleBasedEscrow: Only the payee can call this function.");
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


    IERC20[] fundedTokens;

    address[] public payeeCandidates;
    mapping (address => bytes32) candidatesIdentifier;

    address[] public payees;
    address[] public funders;
    mapping (address => mapping (IERC20 => uint256)) public funds;

    bool public isBaseContract;
    address private _factory;

    /**
     * @dev Constructor. 
     *      Constructor must be removed if you want to use Upgradeable.
     */
     constructor() {
        // The base contract must not be initialized, since we are using clones.
        isBaseContract = true;

        _factory = msg.sender;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(FACTORY_ROLE, msg.sender);
    }
    
    function __Escrow_init(address funder, address payee) internal onlyInitializing { 
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(FACTORY_ROLE, msg.sender);
        
        if (payee != address(0)) _registerPayee(payee);
        if (funder != address(0)) _registerFunder(funder);

        _state = State.INITIALIZED;
    }

    function __Escrow_init_unchained() internal onlyInitializing {
    }

    function initialize(address funder, address payee) public virtual initializer {
        require(isBaseContract == false, "ArbitrableEscrow: The base contract cannot be initialized");
        require(payee != funder, "ArbitrableEscrow: payee cannot be itself");

        __Escrow_init(funder, payee);
        __Escrow_init_unchained();
    }

    /**
     * @dev Register payee
     */
    function registerAsPayee(bytes32 identifier) public {
        require(state() < State.ACTIVATED, "RoleBasedEscrow: can only deposit while INITIATED");

        payeeCandidates.push(msg.sender);
        candidatesIdentifier[msg.sender] = identifier;

        //_registerPayee(msg.sender);
    }

    function _registerPayee(address payee) internal {
        require(payee != address(0), "RoleBasedEscrow: payee address must not be empty");
        require(payeeExist(payee) == false, "RoleBasedEscrow: cannot register twice as payee");
        require(funderExist(payee) == false, "RoleBasedEscrow: funder cannot be a payee");
        
        payees.push(payee);
        _setupRole(PAYEE_ROLE, payee);

        emit PayeeRegistered(payee);
    }
    
    function grantPayeeRole(address[] memory payeesToGrant) external onlyCreator {
        for (uint i = 0; i < payeesToGrant.length; i++) {
            address payeeToGrant = payeesToGrant[i];
            
            if (_existingAddress(payeeCandidates, payeeToGrant)) {
                _registerPayee(payeeToGrant);
            }
        }
    }

    function _registerFunder(address funder) internal {
        require(funder != address(0), "RoleBasedEscrow: funder address must not be empty");
        require(funderExist(funder) == false, "RoleBasedEscrow: cannot register twice as funder");
        require(payeeExist(funder) == false, "RoleBasedEscrow: payee cannot be a funder");

        funders.push(funder);
        _setupRole(FUNDER_ROLE, funder);

        emit FunderRegistered(funder);
    }

    /**
     * @dev Deposit ERC20 compatible funds after the contract has initiated.
     * @param tokenAddress token to be deposited
     */
    function deposit(address tokenAddress) payable external {
        require(state() >= State.INITIALIZED && state() <= State.ACTIVATED, "RoleBasedEscrow: can only deposit after INITIATED");
        require(msg.value > 0, "RoleBasedEscrow: Token amount must be greater than zero");
 
        IERC20 erc20Token = IERC20(tokenAddress);
        erc20Token.safeTransferFrom(msg.sender, address(this), msg.value);

        _addTokenList(erc20Token);
        _addFunder(msg.sender);

        funds[msg.sender][erc20Token] += msg.value;

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

    function _withdraw(address payee) private {
        IERC20[] memory tokenWithdrawn = new IERC20[](fundedTokens.length);
        uint256[] memory amountWithdrawn = new uint256[](fundedTokens.length);

        for (uint i = 0; i < fundedTokens.length; i++) {
            IERC20 token = fundedTokens[i];
            uint256 amount = funds[payee][token];
            if (amount > 0) {
                token.transfer(payee, amount);
                funds[payee][token] = 0;

                tokenWithdrawn[i] = token;
                amountWithdrawn[i] = amount;
            }
        }

        emit Withdrawn(msg.sender, tokenWithdrawn, amountWithdrawn);
    }

    function withdrawalAllowed(address) public view virtual returns (bool) {
        return state() == State.INITIALIZED || state() == State.FINALIZED;
    }

    function activateContract() external virtual onlyCreator {
        require(state() == State.INITIALIZED, "RoleBasedEscrow: Escrow can be activated only after initialized");
        require(payees.length > 0, "RoleBasedEscrow: There must be at least one payee");

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

        _finalize();
    }

    function _finalize() internal {
        _state = State.FINALIZED;

        emit FinalizeContract(msg.sender);
    }

    function _totalAmountOf(IERC20 token, address[] memory parties) private view returns (uint256) {
        uint256 totalAmountPerToken = 0;
        for (uint index = 0; index < parties.length; index++) {
            address party = parties[index];
            totalAmountPerToken += funds[party][token];
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

        fundedTokens.push(token);
    }

    function _addFunder(address funder) private {
        for (uint i = 0; i < funders.length; i++) {
            if (funders[i] == funder) {
                // Already exist. Should not add on the list.
                return;
            }
        }

        // Add new funder on the list.
        _registerFunder(funder);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/#storage_gaps
     */
    uint256[49] private __gap;
}
