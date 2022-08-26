import { ethers, upgrades } from "hardhat";
import "@openzeppelin/hardhat-upgrades";

const BASE_CONTRACT_ADDRESS = "";
const FACTORY_CONTRACT_ADDRESS = "";

async function main() {
  const BaseContract = await ethers.getContractFactory("ArbitrableEscrowUpgradeable");
  const baseContract = await upgrades.upgradeProxy(BASE_CONTRACT_ADDRESS, BaseContract);
  await baseContract.deployed();

  console.log("Base contract UPGRADED to:", baseContract.address);

  const Factory = await ethers.getContractFactory("ArbitrableEscrowFactoryUpgradeable");
  const facotry = await upgrades.upgradeProxy(FACTORY_CONTRACT_ADDRESS, Factory);
  await facotry.deployed();

  console.log("Factory contract UPGRADED to:", facotry.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
