import { ethers } from "hardhat";
import "@openzeppelin/hardhat-upgrades";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const BaseContract = await ethers.getContractFactory("ArbitrableEscrow");
  const baseContract = await BaseContract.deploy();
  await baseContract.deployed();

  console.log("Base contract deployed to:", baseContract.address);

  const Factory = await ethers.getContractFactory("ArbitrableEscrowFactory");
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
