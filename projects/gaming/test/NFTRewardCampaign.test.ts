import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, utils } from "ethers";
import { NFTRewardCampaign, MockERC721, NFTRewardCampaignManager } from "../typechain-types";
import hre from "hardhat";
import { ERC721 } from "../typechain-types/@openzeppelin/contracts/token/ERC721/ERC721";

describe("TokenRewardCampaign", () => {
  let CampaignManager: NFTRewardCampaignManager;
  let Campaign: NFTRewardCampaign;
  let MockNFTContract: MockERC721;
  let owner: SignerWithAddress;
  let addrs: SignerWithAddress[];
  let creator: SignerWithAddress;

  beforeEach(async () => {
    [owner, creator, ...addrs] = await ethers.getSigners();

    // Prepare contract fixture
    const CampaignManagerFactory = await ethers.getContractFactory("NFTRewardCampaignManager");
    CampaignManager = await CampaignManagerFactory.connect(creator).deploy();
    await CampaignManager.deployed();

    const ERC721TokenFactory = await ethers.getContractFactory("MockERC721");
    MockNFTContract = await ERC721TokenFactory.deploy("Mock NFT", "MNFT");
    await MockNFTContract.connect(creator).mint(owner.address, 1);

    const CampaignFactory = await ethers.getContractFactory("NFTRewardCampaign");
    Campaign = await CampaignFactory.connect(creator).deploy(
      owner.address, // Campaign owner
      MockNFTContract.address, // nft
      [BigNumber.from("1")], // tokenIds
      BigNumber.from("0"), // amount
      BigNumber.from("1"), // tokenType
      BigNumber.from("1"), // rewardSeat
      BigNumber.from("0"), // campaignType
      CampaignManager.address, // governer
      creator.address
    );
    await Campaign.deployed();
  });

  describe("Deployment", () => {
    it("Should set the right owner", async () => {
      expect(await CampaignManager.owner()).to.equal(await creator.getAddress());
      expect(await Campaign.owner()).to.equal(await owner.getAddress());
    });
  });

  describe("Participate", () => {
    it("Should participate with right signature", async () => {
      const user = addrs[3];

      const domain = {
        name: "TokenRewardCampaign",
        version: "1",
        chainId: hre.network.config.chainId,
        verifyingContract: Campaign.address,
      };

      const types = {
        ClaimData: [
          { name: "user", type: "address" },
          { name: "campaignId", type: "uint256" },
          { name: "tokenId", type: "uint256" },
          { name: "rewardAmount", type: "uint256" },
          { name: "creator", type: "address" },
        ],
      };

      const value = {
        user: user.address,
        campaignId: 0,
        tokenId: 1,
        rewardAmount: 1,
        creator: creator.address,
      };

      const signature = await creator._signTypedData(domain, types, value);
      expect(
        Campaign.connect(user).participate(
          { user: user.address, campaignId: 0, tokenId: 1, rewardAmount: 1, creator: creator.address },
          signature
        )
      ).not.to.be.revertedWith("Invalid signature");
    });
  });

  describe("Creation", () => {
    it("Should create campaign", async () => {
      const user = addrs[3];

      // Mint a NFT
      // await MockNFTContract.connect(creator).mint(user.address, 1);
      // await MockNFTContract.connect(user).approve(CampaignContract.address, 1);

      // await CampaignContract.connect(user).createCampaign(MockNFTContract.address, [1], 1, 0);

      // const campaignId = await CampaignContract.campaignsByOwner(user.address, 0);
      // const createdCampaign = await CampaignContract.campaigns(campaignId);

      // expect(createdCampaign.nftAddress).to.equal(MockNFTContract.address);
      // expect(createdCampaign.rewardAmount).to.equal(1);
      // expect(createdCampaign.owner).to.equal(user.address);
    });

    it("Should withdraw correctly with emergency withdraw", async () => {
      const user = addrs[3];

      // Mint a NFT
      // await MockNFTContract.connect(creator).mint(user.address, 1);
      // await MockNFTContract.connect(user).approve(Campaign.address, 1);

      // expect(await MockNFTContract.ownerOf(1)).to.be.equal(user.address);

      // await Campaign.connect(user).createCampaign(MockNFTContract.address, [1], 1, 0);

      // expect(await MockNFTContract.ownerOf(1)).to.be.equal(Campaign.address);

      // const campaignId = await Campaign.campaignsByOwner(user.address, 0);
      // await Campaign.connect(creator).emergencyWithdraw(campaignId);

      // expect(await MockNFTContract.ownerOf(1)).to.be.equal(user.address);
    });
  });
});
