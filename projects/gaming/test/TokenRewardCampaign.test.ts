import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenRewardCampaignManager } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, utils } from "ethers";
import { TokenRewardCampaign } from "../typechain-types";

describe("TokenRewardCampaign", () => {
  let CampaignManager: TokenRewardCampaignManager;
  let Campaign: TokenRewardCampaign;
  let owner: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addrs: SignerWithAddress[];

  beforeEach(async () => {
    [owner, addr1, ...addrs] = await ethers.getSigners();

    const ERC20TokenFactory = await ethers.getContractFactory("ERC20");
    const ERC20 = await ERC20TokenFactory.deploy("TOKEN", "TKN");

    // Prepare contract fixture
    const CampaignManagerFactory = await ethers.getContractFactory("TokenRewardCampaignManager");
    CampaignManager = await CampaignManagerFactory.connect(owner).deploy();
    await CampaignManager.deployed();

    const CampaignFactory = await ethers.getContractFactory("TokenRewardCampaign");
    Campaign = await CampaignFactory.connect(owner).deploy(
      owner.address,
      ERC20.address,
      ethers.utils.parseUnits("1000", 18),
      BigNumber.from("10"),
      BigNumber.from("1"),
      owner.address,
      owner.address
    );
    await Campaign.deployed();
  });

  describe("Deployment", () => {
    it("Should set the right owner", async () => {
      expect(await CampaignManager.owner()).to.equal(await owner.getAddress());
      expect(await Campaign.owner()).to.equal(await owner.getAddress());
    });
  });

  describe("Participate", () => {
    it("Should set the right owner", async () => {
      await Campaign.connect(owner).startCampaign();
      await Campaign.connect(addr1).participate(
        "0x3c3e0e1a33f1037a2c3347f8c1950d013af7d0debe6f8665fa97429c262a5a503540778c0f6ae9fe17845ea60e79925cc05f614d7737adbc23a230090b1ee2a91c"
      );
    });
  });
});
