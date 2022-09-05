// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./ArbitrableEscrow.sol";

contract ArbitrableEscrowFactory {
    address public arbitrableEscrowAddress;
    
    event EscrowCreated(address indexed creator, address indexed funder, address indexed payee, ArbitrableEscrow escrow);

    mapping(address => ArbitrableEscrow[]) public deployedEscrows;

    constructor(address _arbitrableEscrowAddress) {
        require(_arbitrableEscrowAddress != address(0), "Escrow contract must have valid address");
        arbitrableEscrowAddress = _arbitrableEscrowAddress;
    }

    function createEscrowAsFunder(address payee, string memory title) external {
        require(arbitrableEscrowAddress != address(0), "Escrow contract does not exist");

        ArbitrableEscrow newEscrow = ArbitrableEscrow(Clones.clone(arbitrableEscrowAddress));

        emit EscrowCreated(msg.sender, msg.sender, payee, newEscrow);

        deployedEscrows[msg.sender].push(newEscrow);

        newEscrow.initializeAsFunder(msg.sender, payee, title);
    }

    function createEscrowAsPayee(address funder, string memory title) external {
        require(arbitrableEscrowAddress != address(0), "Escrow contract does not exist");

        ArbitrableEscrow newEscrow = ArbitrableEscrow(Clones.clone(arbitrableEscrowAddress));
        
        emit EscrowCreated(msg.sender, funder, msg.sender, newEscrow);
        
        deployedEscrows[msg.sender].push(newEscrow);

        newEscrow.initializeAsPayee(funder, msg.sender, title);
    }

    function escrowsOf(address _owner) external view returns (ArbitrableEscrow[] memory) {
        return deployedEscrows[_owner];
    }
}