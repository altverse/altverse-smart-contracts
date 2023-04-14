import { expect } from "chai";
import { ethers } from "hardhat";
import { AltNFT } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("AltNFT", () => {
  let AltNFTContract: AltNFT;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addrs: SignerWithAddress[];

  beforeEach(async () => {
    [owner, addr1, ...addrs] = await ethers.getSigners();

    // Prepare contract fixture
    const AltNFTFactory = await ethers.getContractFactory("AltNFT");
    AltNFTContract = await AltNFTFactory.deploy("AltNFT", "ANFT", await owner.getAddress(), 500);
    await AltNFTContract.deployed();

    // Lazy mint a new token
    const uri = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
    const supply = 100;
    const data = "0x"; // Empty bytes data
    await AltNFTContract.lazyMint(supply, uri, data);
  });

  describe("Deployment", () => {
    it("Should set the right owner", async () => {
      expect(await AltNFTContract.owner()).to.equal(await owner.getAddress());
    });
  });

  describe("Token Minter", () => {
    it("Should have the correct token minter after lazy minting", async () => {
      const tokenId = 1;
      expect(await AltNFTContract.tokenIdToMinter(tokenId)).to.equal(await owner.getAddress());
    });
  });

  describe("Max Claimable Count", () => {
    it("Should set the max claimable count for a tokenId and wallet", async () => {
      const tokenId = 1;
      const count = 10;
      await AltNFTContract.setMaxClaimableCount(tokenId, await addr1.getAddress(), count);
      expect(await AltNFTContract.maxClaimableCount(tokenId, await addr1.getAddress())).to.equal(count);
    });

    it("Should only allow the owner or token minter to set the max claimable count", async () => {
      const tokenId = 1;
      const count = 10;
      await expect(
        AltNFTContract.connect(addr1).setMaxClaimableCount(tokenId, await addr1.getAddress(), count)
      ).to.be.revertedWith("Not authorized");
    });
  });

  describe("Verify Claim", () => {
    it("Should allow claiming within the max claimable count", async () => {
      const tokenId = 1;
      const quantity = 5;
      const count = 10;
      await AltNFTContract.setMaxClaimableCount(tokenId, await addr1.getAddress(), count);
      await AltNFTContract.connect(addr1).claim(await addr1.getAddress(), tokenId, quantity);
      expect(await AltNFTContract.balanceOf(await addr1.getAddress(), tokenId)).to.equal(quantity);
    });

    it("Should revert if claiming more than the max claimable count", async () => {
      const tokenId = 1;
      const quantity = 15;
      const count = 10;
      await AltNFTContract.setMaxClaimableCount(tokenId, await addr1.getAddress(), count);
      await expect(AltNFTContract.connect(addr1).claim(await addr1.getAddress(), tokenId, quantity)).to.be.revertedWith(
        "Claim exceeds max allowed"
      );
    });
  });
});
