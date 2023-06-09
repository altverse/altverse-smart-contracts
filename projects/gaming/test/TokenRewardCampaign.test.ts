import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenRewardCampaignManager } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, utils } from "ethers";
import { TokenRewardCampaign } from "../typechain-types";

describe("AltNFT", () => {
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
      await Campaign.startCampaign();
      await Campaign.participate(
        BigNumber.from("1"),
        "0x603bae2e5a19bf6d85d7d0b7e461fa3197b2975e08dcdd34d7b4e74806fc3477462bf9e19f784949c67c1f199e64bd7cef9c414669dbbf80267c77b81c139d211c"
      );
    });
  });
});
