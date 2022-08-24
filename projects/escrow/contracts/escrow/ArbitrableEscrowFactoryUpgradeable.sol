// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "./ArbitrableEscrowUpgradeable.sol";

contract ArbitrableEscrowFactoryUpgradeable is ContextUpgradeable {
    address public arbitrableEscrowAddress;
    
    event EscrowCreated(address indexed creator, address indexed funder, address indexed payee, ArbitrableEscrowUpgradeable escrow);

    mapping(address => ArbitrableEscrowUpgradeable[]) public deployedEscrows;

    constructor(address _arbitrableEscrowAddress) {
        arbitrableEscrowAddress = _arbitrableEscrowAddress;
    }

    function createEscrowAsFunder(address payee) public {
        require(arbitrableEscrowAddress != address(0), "Escrow contract does not exist");

        ArbitrableEscrowUpgradeable newEscrow = ArbitrableEscrowUpgradeable(ClonesUpgradeable.clone(arbitrableEscrowAddress));
        newEscrow.initialize(msg.sender, payee);
        deployedEscrows[msg.sender].push(newEscrow);

        emit EscrowCreated(msg.sender, msg.sender, payee, newEscrow);
    }

    function createEscrowAsPayee(address funder) public {
        require(arbitrableEscrowAddress != address(0), "Escrow contract does not exist");

        ArbitrableEscrowUpgradeable newEscrow = ArbitrableEscrowUpgradeable(ClonesUpgradeable.clone(arbitrableEscrowAddress));
        newEscrow.initialize(funder, msg.sender);
        deployedEscrows[msg.sender].push(newEscrow);

        emit EscrowCreated(msg.sender, funder, msg.sender, newEscrow);
    }

    function escrowsOf(address _owner) external view returns (ArbitrableEscrowUpgradeable[] memory) {
        return deployedEscrows[_owner];
    }
}