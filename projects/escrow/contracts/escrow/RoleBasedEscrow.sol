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
    using SafeERC20 for ERC20;
    using Address for address payable;

    bytes32 public constant FACTORY_ROLE = keccak256("FACTORY_ROLE");
    bytes32 public constant FUNDER_ROLE = keccak256("FUNDER_ROLE");
    bytes32 public constant PAYEE_ROLE = keccak256("PAYEE_ROLE");
    bytes32 public constant CREATOR_ROLE = keccak256("CREATOR_ROLE");
    
    event Deposited(address indexed funder, ERC20 erc20Token, uint256 amount);
    event Withdrawn(address indexed payee, ERC20[] erc20Token, uint256[] amount);
    event PayeeCandidateRegistered(address indexed payee);
    event PayeeRegistered(address indexed payee);
    event FunderRegistered(address indexed funder);
    event ContractActivated(address indexed creator);
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

    string title;

    ERC20[] fundedTokens;

    address[] public payeeCandidates;
    mapping (address => bytes32) candidatesIdentifier;

    address[] public payees;
    address[] public funders;
    mapping (address => mapping (ERC20 => uint256)) public funds;

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
    
    function __Escrow_init(address funder, address payee, string memory title_) internal onlyInitializing { 
        _state = State.INITIALIZED;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(FACTORY_ROLE, msg.sender);
        
        if (payee != address(0)) _registerPayee(payee);
        if (funder != address(0)) _registerFunder(funder);

        title = title_;
    }


    function initializeAsFunder(address funder, address payee, string memory _title) external initializer {
          _setupRole(CREATOR_ROLE, funder);
        _initialize(funder, payee, _title);
    }

    function initializeAsPayee(address funder, address payee, string memory _title) external initializer {
        _setupRole(CREATOR_ROLE, payee);
        _initialize(funder, payee, _title);
    }

    function _initialize(address funder, address payee, string memory _title) internal virtual {
        require(!isBaseContract, "ArbitrableEscrow: The base contract cannot be initialized");
        require(payee != funder, "ArbitrableEscrow: payee cannot be itself");

        __Escrow_init(funder, payee, _title);
    }

    /**
     * @dev Register payee
     */
    function registerAsPayee(bytes32 identifier) public {
        require(state() < State.ACTIVATED, "RoleBasedEscrow: can only deposit while INITIATED");
        require(!candidateExist(msg.sender), "RoleBasedEscrow: cannot register twice as payee candidate");
         require(!funderExist(msg.sender), "RoleBasedEscrow: funder cannot be a payee");

        payeeCandidates.push(msg.sender);
        candidatesIdentifier[msg.sender] = identifier;

        emit PayeeCandidateRegistered(msg.sender);
    }

    function _registerPayee(address payee) internal {
        require(payee != address(0), "RoleBasedEscrow: payee address must not be empty");
        require(!payeeExist(payee), "RoleBasedEscrow: cannot register twice as payee");
        require(!funderExist(payee), "RoleBasedEscrow: funder cannot be a payee");
        
        payees.push(payee);
        _setupRole(PAYEE_ROLE, payee);

        emit PayeeRegistered(payee);
    }
    
    function grantPayeeRole(address[] memory payeesToGrant) external onlyCreator {
        require(payeesToGrant.length > 0, "RoleBasedEscrow: array must be larger than 0");
        require(payeeCandidates.length > 0, "RoleBasedEscrow: there is no candidates to grant");

        for (uint i = 0; i < payeesToGrant.length; i++) {
            address payeeToGrant = payeesToGrant[i];
            
            if (_existingAddress(payeeCandidates, payeeToGrant)) {
                _registerPayee(payeeToGrant);
            }
        }
    }

    function _registerFunder(address funder) internal {
        require(funder != address(0), "RoleBasedEscrow: funder address must not be empty");
        require(!funderExist(funder), "RoleBasedEscrow: cannot register twice as funder");
        require(!payeeExist(funder), "RoleBasedEscrow: payee cannot be a funder");

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
 
        ERC20 erc20Token = ERC20(tokenAddress);

        _addTokenList(erc20Token);
        _addFunder(msg.sender);

        funds[msg.sender][erc20Token] += msg.value;

        emit Deposited(msg.sender, erc20Token, msg.value);

        erc20Token.safeTransferFrom(msg.sender, address(this), msg.value);
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
        ERC20[] memory tokenWithdrawn = new ERC20[](fundedTokens.length);
        uint256[] memory amountWithdrawn = new uint256[](fundedTokens.length);

        for (uint i = 0; i < fundedTokens.length; i++) {
            ERC20 token = fundedTokens[i];
            uint256 amount = funds[payee][token];
            if (amount > 0) {
                funds[payee][token] = 0;
                token.safeTransfer(payee, amount);

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
            ERC20 token = fundedTokens[tokenIndex];
            uint256 totalAmountPerToken = _totalAmountOf(token, funders);
            // Then distribute to payees equally
            if (totalAmountPerToken > 0 && payees.length > 0) {
                uint256 numberOfPayees = payees.length;
                uint256 amountEach = totalAmountPerToken / numberOfPayees;

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
                // console.log("LeftOver: token - ", address(token));
                // console.log("LeftOver: totalAmountPerToken - ", totalAmountPerToken);
            }
        }

        _finalize();
    }

    function _finalize() internal {
        _state = State.FINALIZED;

        emit FinalizeContract(msg.sender);
    }

    function _totalAmountOf(ERC20 token, address[] memory parties) private view returns (uint256) {
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

    function candidateExist(address candidate) public view returns (bool) {
        return _existingAddress(payeeCandidates, candidate);
    }

    function _existingAddress(address[] memory array, address target) private pure returns (bool) {
        for (uint i = 0; i < array.length; i++) {
            if (array[i] == target) {
                return true;
            }
        }

        return false;
    }

    function _addTokenList(ERC20 token) private {
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
}
