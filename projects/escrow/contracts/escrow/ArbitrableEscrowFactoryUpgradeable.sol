// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "./ArbitrableEscrowUpgradeable.sol";

contract ArbitrableEscrowUpgradeableFactory is ContextUpgradeable {
    address public arbitrableEscrowAddress;
    
    event EscrowCreated(address indexed founder, address indexed payee, ArbitrableEscrowUpgradeable escrow);

    mapping(address => ArbitrableEscrowUpgradeable[]) public deployedEscrows;

    constructor(address _arbitrableEscrowAddress) {
        arbitrableEscrowAddress = _arbitrableEscrowAddress;
    }

    function createEscrow(address payable initialPayee) public {
        require(arbitrableEscrowAddress != address(0), "Escrow contract does not exist");

        console.log('Factory msg.sender:', msg.sender);

        ArbitrableEscrowUpgradeable newEscrow = ArbitrableEscrowUpgradeable(ClonesUpgradeable.clone(arbitrableEscrowAddress));
        newEscrow.initialize(initialPayee, payable(msg.sender));

        deployedEscrows[msg.sender].push(newEscrow);

        emit EscrowCreated(msg.sender, initialPayee, newEscrow);
    }

    function escrowsOf(address _owner) external view returns (ArbitrableEscrowUpgradeable[] memory) {
        return deployedEscrows[_owner];
    }
}