// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./ArbitrableSimplifiedEscrow.sol";

contract ArbitrableSimplifiedEscrowFactory {
    address public ArbitrableSimplifiedEscrowAddress;
    
    event EscrowCreated(address indexed creator, address indexed funder, address indexed payee, ArbitrableSimplifiedEscrow escrow);

    mapping(address => ArbitrableSimplifiedEscrow[]) public deployedEscrows;

    constructor(address _ArbitrableSimplifiedEscrowAddress) {
        ArbitrableSimplifiedEscrowAddress = _ArbitrableSimplifiedEscrowAddress;
    }

    function createEscrowAsPayee(address funder) public {
        require(ArbitrableSimplifiedEscrowAddress != address(0), "Escrow contract does not exist");

        ArbitrableSimplifiedEscrow newEscrow = ArbitrableSimplifiedEscrow(Clones.clone(ArbitrableSimplifiedEscrowAddress));
        newEscrow.initialize(funder, msg.sender);
        deployedEscrows[msg.sender].push(newEscrow);

        emit EscrowCreated(msg.sender, funder, msg.sender, newEscrow);
    }

    function escrowsOf(address _owner) external view returns (ArbitrableSimplifiedEscrow[] memory) {
        return deployedEscrows[_owner];
    }
}