// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./ArbitrableEscrow.sol";

contract ArbitrableEscrowFactory {
    address public arbitrableEscrowAddress;
    
    event EscrowCreated(address indexed creator, address indexed funder, address indexed payee, ArbitrableEscrow escrow);

    mapping(address => ArbitrableEscrow[]) public deployedEscrows;

    constructor(address _arbitrableEscrowAddress) {
        arbitrableEscrowAddress = _arbitrableEscrowAddress;
    }

    function createEscrowAsFunder(address payee, string memory title) public {
        require(arbitrableEscrowAddress != address(0), "Escrow contract does not exist");

        ArbitrableEscrow newEscrow = ArbitrableEscrow(Clones.clone(arbitrableEscrowAddress));
        newEscrow.initializeAsFunder(msg.sender, payee, title);
        deployedEscrows[msg.sender].push(newEscrow);

        emit EscrowCreated(msg.sender, msg.sender, payee, newEscrow);
    }

    function createEscrowAsPayee(address funder, string memory title) public {
        require(arbitrableEscrowAddress != address(0), "Escrow contract does not exist");

        ArbitrableEscrow newEscrow = ArbitrableEscrow(Clones.clone(arbitrableEscrowAddress));
        newEscrow.initializeAsPayee(funder, msg.sender, title);
        deployedEscrows[msg.sender].push(newEscrow);

        emit EscrowCreated(msg.sender, funder, msg.sender, newEscrow);
    }

    function escrowsOf(address _owner) external view returns (ArbitrableEscrow[] memory) {
        return deployedEscrows[_owner];
    }
}