import { ethers, upgrades } from "hardhat";
import "@openzeppelin/hardhat-upgrades";

const emptyAddress = "0x0000000000000000000000000000000000000000";
const altverseTestAddress = "0x4F1f9c9e62F8b36346CC2f633b33dc190DC54424";

async function main() {
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
