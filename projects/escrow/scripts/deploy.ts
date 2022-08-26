import { ethers, upgrades } from "hardhat";
import "@openzeppelin/hardhat-upgrades";

async function main() {
  const BaseContract = await ethers.getContractFactory("ArbitrableEscrowUpgradeable");
  const baseContract = await upgrades.deployProxy(BaseContract);
  await baseContract.deployed();

  console.log("Base contract deployed to:", baseContract.address);

  const Factory = await ethers.getContractFactory("ArbitrableEscrowFactoryUpgradeable");
  const facotry = await upgrades.deployProxy(Factory, [baseContract.address]);
  await facotry.deployed();

  console.log("Factory contract deployed to:", facotry.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
