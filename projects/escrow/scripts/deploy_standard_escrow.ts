import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  const StandardEscrow = await ethers.getContractFactory("StandardEscrow");
  const standardEscrow = await StandardEscrow.deploy("0xc1B588e1b73a490F85e6D593266640BE2e03b05F", 0);
  await standardEscrow.deployed();

  console.log("StandardEscrow contract deployed to:", standardEscrow.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
