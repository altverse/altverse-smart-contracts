import { ethers } from "hardhat";

async function main() {
  const BaseContract = await ethers.getContractFactory("ArbitrableEscrowUpgradeable.sol");
  const baseContract = await BaseContract.deploy();
  await baseContract.deployed();

  console.log("Base contract deployed to:", baseContract.address);

  const Factory = await ethers.getContractFactory("ArbitrableEscrowFactoryUpgradeable.sol");
  const facotry = await Factory.deploy(baseContract.address);
  await facotry.deployed();

  console.log("Factory contract deployed to:", facotry.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
