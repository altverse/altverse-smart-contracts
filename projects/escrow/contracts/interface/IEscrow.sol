// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev Interface of the Escrow service
 */
interface IEscrow {
     /**
     * @dev Emitted when funder deposited erc20Token
     *
     */
    event Deposited(address indexed funder, IERC20 erc20Token, uint256 amount);

     /**
     * @dev Emitted when funder withdrawn erc20Tokens
     *
     */
    event Withdrawn(address indexed payee, IERC20[] erc20Token, uint256[] amount);


    event PayeeRegistered(address indexed payee);
    event FunderRegistered(address indexed funder);
    event ContractActivated(address indexed funder);
    event ContractAccepted(address indexed payee);
    event DeliveryConfirmed(address indexed confirmer);
    
    /**
     * @dev Depoist token of provided address
     */
    function deposit(address tokenAddress) payable external;

    /**
     * @dev Depoist token of provided address
     */
    function withdraw() external;

    /**
     * @dev Distirbute tokens to payees
     */
    function settle(bool autoWithdraw) external;
}
