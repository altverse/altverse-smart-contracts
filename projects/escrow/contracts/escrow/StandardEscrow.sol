// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

import "./ArbitrableEscrowFactory.sol";
import "./EscrowMetadata.sol";

/**
 * @title StandardEscrow
 * @dev Base escrow contract, holds funds designated for a payee until they
 * withdraw them.
 */
contract StandardEscrow is ReentrancyGuard, EscrowMetadata, Ownable, Pausable {
    using SafeMath for uint256;
    using SafeERC20 for ERC20;
    using Address for address payable;

    event Deposited(uint256 contractId, address indexed funder, ERC20 erc20Token, uint256 amount);
    event Withdrawn(uint256 contractId, address indexed actor, address indexed recipient, ERC20 erc20Token, uint256 amount, uint256 fee);
    event ContractActivated(uint256 contractId, address indexed payee);
    event ContractFinalized(uint256 contractId, address indexed funder);

    modifier nonContract() {
        require(!_isContract(msg.sender), "Contract not allowed");
        require(msg.sender == tx.origin, "Proxy contract not allowed");
        _;
    }

    enum State {
        INITIALIZED, 
        ACTIVATED, 
        FINALIZED
    }

    struct EscrowContract {
        uint256 id;
        State state;
        string title;
        address funder;
        address payee;
        ERC20 token;
        uint256 determined;
        uint256 initial;
        uint256 balance;
        uint256 createdAt;
    }

    mapping(uint256 => EscrowContract) private _contracts;

    // Keep track of funders/payees' contract ids.
    mapping(address => uint256[]) private _funderContracts;
    mapping(address => uint256[]) private _payeeContracts;

    uint256 private _currentContractId = 1;

    address private _treasury;
    uint256 private _withdrawFee = 0;   // 1 = 0.01%, 10 = 0.1%, 100 = 1%

    constructor(address treasury_, uint256 withdrawFee_) {
        _treasury = treasury_;
        _withdrawFee = withdrawFee_;
    }

    function updateTreasury(address newTreasury) public onlyOwner {
        _treasury = newTreasury;
    }

    function updateWithdrawFee(uint256 newWithdrawFee) public onlyOwner {
        require(newWithdrawFee > 0 || newWithdrawFee < 10000, "StandardEscrow: The amount must be greater than 0 and less than 10000 (100%)");
        _withdrawFee = newWithdrawFee;
    }

    function createEscrow(string memory title, address payee_, ERC20 token_, uint256 amount_) external nonContract whenNotPaused {
        require(amount_ > 0, "StandardEscrow: The amount must be greater than 0");
        require(msg.sender != payee_, "StandardEscrow: The payee cannot be equal to the creator");
        
        EscrowContract memory newContract = EscrowContract({
            id: _currentContractId,
            title: title,
            createdAt: block.timestamp,
            state: State.INITIALIZED,
            funder: msg.sender,
            payee: payee_,
            token: token_,
            determined: 0,
            initial: amount_,
            balance: amount_
        });

        _contracts[_currentContractId] = newContract;
        _funderContracts[msg.sender].push(_currentContractId);
        _payeeContracts[payee_].push(_currentContractId);

        ERC20 erc20Token = ERC20(token_);

        emit Deposited(_currentContractId++, msg.sender, token_, amount_);
        erc20Token.safeTransferFrom(msg.sender, address(this), amount_);
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
    function withdraw(uint256 contractId, uint256 amount) external virtual nonContract nonReentrant whenNotPaused {
        EscrowContract storage escrow = getEscrowSafe(contractId);
        require(withdrawalAllowed(escrow, msg.sender, amount), "StandardEscrow: Cannot withdraw on current state");
        
        if (escrow.payee == msg.sender) {
            _withdrawWithFee(escrow, msg.sender, amount);
        }
        else {
            _withdraw(escrow, msg.sender, amount);
        }
    }

    function deposit(uint256 contractId, ERC20 token_, uint256 amount_) external virtual nonContract nonReentrant whenNotPaused {
        EscrowContract storage escrow = getEscrowSafe(contractId);
        require(escrow.state != State.FINALIZED, "StandardEscrow: deposit is possible before finalization");
        require(escrow.funder == msg.sender, "StandardEscrow: The funder does not match");
        require(escrow.token == token_, "StandardEscrow: Provided token does not match initial deposit");
        
        escrow.balance += amount_;

        if (escrow.state == State.ACTIVATED) {
            escrow.determined += amount_;
        }

        ERC20 erc20Token = ERC20(token_);
        emit Deposited(contractId, msg.sender, token_, amount_);
        erc20Token.safeTransferFrom(msg.sender, address(this), amount_);
    }

    function withdrawalAllowed(EscrowContract memory escrow, address actor, uint256 amount) public view virtual returns (bool) {
        return ((escrow.state == State.INITIALIZED && escrow.funder == actor)
          || (escrow.state == State.FINALIZED && escrow.payee == actor))
          && escrow.balance >= amount;
    }

    function _withdraw(EscrowContract storage escrow, address to, uint256 amount) private {
        SafeERC20.safeTransfer(escrow.token, to, amount);
        escrow.balance -= amount;
        emit Withdrawn(escrow.id, msg.sender, to, escrow.token, amount, _withdrawFee);
    }

    function _withdrawWithFee(EscrowContract storage escrow, address to, uint256 amount) private {
        uint256 amountOfWithdrawFee = 0;

        // Send fees to treasury if exist 
        if (_withdrawFee > 0) {
            amountOfWithdrawFee = amount.mul(_withdrawFee).div(10000);
            SafeERC20.safeTransfer(escrow.token, _treasury, amountOfWithdrawFee);
        }
        
        uint256 amountToWithdraw = amount.sub(amountOfWithdrawFee);

        SafeERC20.safeTransfer(escrow.token, to, amountToWithdraw);
        escrow.balance -= amount;
        emit Withdrawn(escrow.id, msg.sender, to, escrow.token, amountToWithdraw, _withdrawFee);
    }

    function activateContract(uint256 contractId) external virtual {
        EscrowContract storage escrow = getEscrowSafe(contractId);
        require(escrow.state == State.INITIALIZED, "StandardEscrow: Escrow can be activated only after initialized");
        require(escrow.payee == msg.sender, "StandardEscrow: The payee does not match");
        require(escrow.balance != 0, "StandardEscrow: Escrow with zero balance cannot be activated");
        require(escrow.balance >= escrow.initial, "StandardEscrow: The balance must be greater than the initial deposit");

        escrow.state = State.ACTIVATED;
        escrow.determined = escrow.balance;
        
        emit ContractActivated(escrow.id, msg.sender);
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
    function settle(uint256 contractId, bool autoWithdraw) external virtual {
        EscrowContract storage escrow = getEscrowSafe(contractId);
        require(escrow.state == State.ACTIVATED, "StandardEscrow: Escrow can be finalized (settled) on ACTIVATED state only");
        require(escrow.funder == msg.sender, "StandardEscrow: Escrow can only be finalized by the funder of the escrow");
        
        _finalize(escrow);

        if (autoWithdraw) {
            _withdrawWithFee(escrow, escrow.payee, escrow.balance);
        }
    }

    function _finalize(EscrowContract storage escrow) internal {
        escrow.state = State.FINALIZED;
        emit ContractFinalized(escrow.id, msg.sender);
    }

    /**
     * @return EscrowContract a contract by id within a memory
     */
    function getEscrow(uint256 contractId) public view virtual returns (EscrowContract memory) {
        return _contracts[contractId];
    }

    /**
     * @return EscrowContract a contract by a pointer to it.
     */
    function getEscrowSafe(uint256 contractId) private view returns (EscrowContract storage) {
      EscrowContract storage escrow =  _contracts[contractId];
      require(escrow.id != 0, "Contract does not exists");
      return escrow;
    }

    /**
     * @notice Check if an address is a contract
     */
    function _isContract(address _addr) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }
        return size > 0;
    }

    /**
     * returns array of contract of a funder in a cursored manner. Note that the cursor starts from the lastest one.
     * @param cursor index from which search the array. It assumes 0 is the lastest one.
     * @param size size of the page, hard limit 100
     */
    function findEscrowsAsFunderByCursor(address funder, uint256 cursor, uint256 size) external view returns (EscrowContract[] memory result, uint256 total) {
        require(cursor >= 0, "StandardEscrow: cursor must be greater than equal to 0");
        require(size > 0 && size <= 100, "StandardEscrow: size must be greater than 0");
        
        uint256[] memory contractIds = _funderContracts[funder];
        uint256 totalLength = contractIds.length;
        if (totalLength == 0) {
            return (new EscrowContract[](0), 0);
        }

        if (totalLength - 1 < cursor) {
            return (new EscrowContract[](0), totalLength);
        }

        uint256 offset = totalLength - 1 - cursor;
        uint256 determinedSize;

        if (offset < size) {
            determinedSize = offset + 1;
        } else {
            determinedSize = size;
        }

        result = new EscrowContract[](determinedSize);

        for (uint256 i = 0; i < determinedSize; i++) {
            result[i] = getEscrow(contractIds[offset - i]);
        }

        return (result, totalLength);
    }

    /**
     * returns array of contract of a payee in a cursored manner. Note that the cursor starts from the lastest one.
     * @param cursor index from which search the array. It assumes 0 is the lastest one
     * @param size size of the page, hard limit 100
     */
    function findEscrowsAsPayeeByCursor(address payee, uint256 cursor, uint256 size) external view returns (EscrowContract[] memory result, uint256 total) {
        require(cursor >= 0, "StandardEscrow: cursor must be greater than equal to 0");
        require(size > 0 && size <= 100, "StandardEscrow: size must be greater than 0");
        
        uint256[] memory contractIds = _payeeContracts[payee];
        uint256 totalLength = contractIds.length;
        if (totalLength == 0) {
            return (new EscrowContract[](0), 0);
        }

        if (totalLength - 1 < cursor) {
            return (new EscrowContract[](0), totalLength);
        }

        uint256 offset = totalLength - 1 - cursor;
        uint256 determinedSize;
        
        if (offset < size) {
            determinedSize = offset + 1;
        } else {
            determinedSize = size;
        }

        result = new EscrowContract[](determinedSize);

        for (uint256 i = 0; i < determinedSize; i++) {
            result[i] =  getEscrow(contractIds[offset - i]);
        }

        return (result, totalLength);
    }

    function emergencyWithdraw(uint256 contractId) external onlyOwner nonReentrant{ 
        EscrowContract storage escrow = getEscrowSafe(contractId);
        require(escrow.state >= State.ACTIVATED, "StandardEscrow: Emergency withdraw works after ACTIVATED state");

        _finalize(escrow);

        SafeERC20.safeTransfer(escrow.token, _treasury, escrow.balance);
        escrow.balance = 0;
        
        emit Withdrawn(escrow.id, msg.sender, _treasury, escrow.token, escrow.balance, 0);
    }
}
