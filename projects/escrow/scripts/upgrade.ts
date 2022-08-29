// NOTE: Only used when we revert to Upgradeable contracts.

import { ethers, upgrades } from "hardhat";
import "@openzeppelin/hardhat-upgrades";

const BASE_CONTRACT_ADDRESS = "0x4a6Ff3686c8Cd581aaFA1CB34C9a441542a5196F";
const FACTORY_CONTRACT_ADDRESS = "0x15ED50b9F9AdD9BBc74e3A3631bA7BD86f1Aa99B";

async function main() {
  const BaseContract = await ethers.getContractFactory("ArbitrableEscrowUpgradeable");
  const baseContract = await upgrades.upgradeProxy(BASE_CONTRACT_ADDRESS, BaseContract);
  await baseContract.deployed();

  console.log(baseContract.address, " baseContract(proxy) address");
  console.log(await upgrades.erc1967.getImplementationAddress(baseContract.address), " getImplementationAddress(baseContract)");
  console.log(await upgrades.erc1967.getAdminAddress(baseContract.address), " getAdminAddress(baseContract)");
  console.log("Base contract UPGRADED to:", baseContract.address);

  const Factory = await ethers.getContractFactory("ArbitrableEscrowFactoryUpgradeable");
  const facotry = await upgrades.upgradeProxy(FACTORY_CONTRACT_ADDRESS, Factory);
  await facotry.deployed();

  console.log(facotry.address, " facotry(proxy) address");
  console.log(await upgrades.erc1967.getImplementationAddress(facotry.address), " getImplementationAddress(facotry)");
  console.log(await upgrades.erc1967.getAdminAddress(facotry.address), " getAdminAddress(facotry)");
  console.log("Factory contract UPGRADED to:", facotry.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
