import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenRewardCampaignManager } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, utils } from "ethers";
import { TokenRewardCampaign } from "../typechain-types";
import hre from "hardhat";

describe("TokenRewardCampaign", () => {
  let CampaignManager: TokenRewardCampaignManager;
  let Campaign: TokenRewardCampaign;
  let owner: SignerWithAddress;
  let addrs: SignerWithAddress[];
  let creator: SignerWithAddress;

  beforeEach(async () => {
    [owner, creator, ...addrs] = await ethers.getSigners();

    const ERC20TokenFactory = await ethers.getContractFactory("ERC20");
    const ERC20 = await ERC20TokenFactory.deploy("TOKEN", "TKN");

    // Prepare contract fixture
    const CampaignManagerFactory = await ethers.getContractFactory("TokenRewardCampaignManager");
    CampaignManager = await CampaignManagerFactory.connect(creator).deploy();
    await CampaignManager.deployed();

    const CampaignFactory = await ethers.getContractFactory("TokenRewardCampaign");
    Campaign = await CampaignFactory.connect(creator).deploy(
      owner.address,
      ERC20.address,
      ethers.utils.parseUnits("1000", 18),
      BigNumber.from("10"),
      BigNumber.from("1"),
      owner.address,
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
        name: "NFTRewardCampaign",
        version: "1",
        chainId: hre.network.config.chainId,
        verifyingContract: Campaign.address,
      };

      const types = {
        ParticipationData: [{ name: "user", type: "address" }],
      };

      const value = {
        user: user.address,
      };

      const signature = await creator._signTypedData(domain, types, value);
      await Campaign.connect(owner).startCampaign();
      expect(Campaign.connect(user).participate({ user: user.address }, signature)).not.to.be.reverted;
    });
  });
});
