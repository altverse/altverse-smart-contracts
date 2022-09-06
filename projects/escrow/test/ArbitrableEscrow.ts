import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { ERC20FakeUSDToken, ERC20FakeUSDToken2 } from "../typechain-types";

const emptyAddress = "0x0000000000000000000000000000000000000000";

describe("ArbitrableEscrow", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployEscrowFixture() {
    // Contracts are deployed using the first signer/account by default
    const [factoryAccount, funderAccount, payeeAccount] = await ethers.getSigners();

    const ArbitrableEscrow = await ethers.getContractFactory("ArbitrableEscrow");
    const arbitrableEscrow = await ArbitrableEscrow.deploy();

    await arbitrableEscrow.deployed();

    return { arbitrableEscrow, factoryAccount, funderAccount, payeeAccount };
  }

  async function deployEscrowFactoryFixtureWithFakeUSD(address: string) {
    // Contracts are deployed using the first signer/account by default
    const [factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2, otherAccount3] = await ethers.getSigners();

    const ArbitrableEscrowFactory = await ethers.getContractFactory("ArbitrableEscrowFactory");
    const arbitrableEscrowFactory = await ArbitrableEscrowFactory.deploy(address);

    await arbitrableEscrowFactory.deployed();

    const { fakeUSDToken, fakeUSDToken2 } = await deployFakeUSDFixture();

    return { arbitrableEscrowFactory, fakeUSDToken, fakeUSDToken2, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2, otherAccount3 };
  }

  async function deployEscrowFactoryFixtureWithAddress() {
    const { arbitrableEscrow } = await deployEscrowFixture();

    return deployEscrowFactoryFixtureWithFakeUSD(arbitrableEscrow.address);
  }

  async function deployFakeUSDFixture() {
    // Contracts are deployed using the first signer/account by default
    const [ownerAccount, funderAccount] = await ethers.getSigners();

    const FakeUSDToken = await ethers.getContractFactory("ERC20FakeUSDToken");
    const fakeUSDToken = await FakeUSDToken.deploy();

    await fakeUSDToken.deployed();

    const FakeUSDToken2 = await ethers.getContractFactory("ERC20FakeUSDToken2");
    const fakeUSDToken2 = await FakeUSDToken2.deploy();

    await fakeUSDToken2.deployed();

    return { fakeUSDToken, fakeUSDToken2, ownerAccount, funderAccount };
  }

  async function createFunderEscrow(presetPayee: boolean) {
    const { arbitrableEscrowFactory, fakeUSDToken, fakeUSDToken2, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2, otherAccount3 } = await loadFixture(
      deployEscrowFactoryFixtureWithAddress
    );

    const tx = await arbitrableEscrowFactory.connect(funderAccount).createEscrowAsFunder(presetPayee ? payeeAccount.address : emptyAddress, "");
    const txReceipt = await tx.wait();
    const event = txReceipt.events?.find((x) => {
      return x.event == "EscrowCreated";
    });

    const eventResult = event?.args;

    return { arbitrableEscrowFactory, tx, eventResult, fakeUSDToken, fakeUSDToken2, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2, otherAccount3 };
  }

  async function createPayeeEscrow(presetFunder: boolean) {
    const { arbitrableEscrowFactory, fakeUSDToken, fakeUSDToken2, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2, otherAccount3 } = await loadFixture(
      deployEscrowFactoryFixtureWithAddress
    );

    const tx = await arbitrableEscrowFactory.connect(payeeAccount).createEscrowAsPayee(presetFunder ? funderAccount.address : emptyAddress, "");
    const txReceipt = await tx.wait();
    const event = txReceipt.events?.find((x) => {
      return x.event == "EscrowCreated";
    });

    const eventResult = event?.args;

    return { arbitrableEscrowFactory, tx, eventResult, fakeUSDToken, fakeUSDToken2, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2, otherAccount3 };
  }

  describe("FakeUSDToken", function () {
    it("Should be able to transfer tokens", async function () {
      const { fakeUSDToken, ownerAccount, funderAccount } = await loadFixture(deployFakeUSDFixture);
      await expect(fakeUSDToken.transfer(funderAccount.address, 1000)).to.changeTokenBalances(fakeUSDToken, [ownerAccount, funderAccount], [-1000, 1000]);
    });

    it("Should be able to transfer tokens", async function () {
      const { fakeUSDToken2, ownerAccount, funderAccount } = await loadFixture(deployFakeUSDFixture);
      await expect(fakeUSDToken2.transfer(funderAccount.address, 1000)).to.changeTokenBalances(fakeUSDToken2, [ownerAccount, funderAccount], [-1000, 1000]);
    });
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { arbitrableEscrow, factoryAccount } = await loadFixture(deployEscrowFixture);

      const adminRole = await arbitrableEscrow.DEFAULT_ADMIN_ROLE();
      expect(await arbitrableEscrow.hasRole(adminRole, factoryAccount.address)).to.true;
    });

    it("Base contract should not be initialized", async function () {
      const { arbitrableEscrow, funderAccount, payeeAccount } = await loadFixture(deployEscrowFixture);

      await expect(arbitrableEscrow.initializeAsFunder(payeeAccount.address, funderAccount.address, "")).to.be.reverted;
      await expect(arbitrableEscrow.initializeAsPayee(payeeAccount.address, funderAccount.address, "")).to.be.reverted;
    });

    it("Should be able to clone escrow via factory (by funder)", async function () {
      const { tx } = await createFunderEscrow(true);

      await expect(tx).not.to.be.reverted;

      const { tx: onlyFunderTx } = await createFunderEscrow(false);

      await expect(onlyFunderTx).not.to.be.reverted;
    });

    it("Should be able to clone escrow via factory (by payee)", async function () {
      const { tx } = await createPayeeEscrow(true);

      await expect(tx).not.to.be.reverted;

      const { tx: onlyPayeeTx } = await createPayeeEscrow(false);

      await expect(onlyPayeeTx).not.to.be.reverted;
    });

    it("Should set empty address if opponent address is not provided", async function () {
      const { eventResult: onlyFunderEvent } = await createFunderEscrow(false);

      const onlyFunderEscrow = await ethers.getContractAt("ArbitrableEscrow", onlyFunderEvent?.escrow);
      await expect(onlyFunderEscrow.payees(0)).to.be.reverted;

      const { eventResult: onlyPayeeEvent } = await createPayeeEscrow(false);

      const onlyPayeeEscrow = await ethers.getContractAt("ArbitrableEscrow", onlyPayeeEvent?.escrow);
      await expect(onlyPayeeEscrow.funders(0)).to.be.reverted;
    });

    it("Should set correct roles when cloning escrow (w/ payee preset)", async function () {
      const { eventResult, arbitrableEscrowFactory, funderAccount, payeeAccount } = await createPayeeEscrow(true);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      const adminRole = await escrow.DEFAULT_ADMIN_ROLE();
      expect(await escrow.hasRole(adminRole, arbitrableEscrowFactory.address)).to.be.true;

      const factoryRole = await escrow.FACTORY_ROLE();
      expect(await escrow.hasRole(factoryRole, arbitrableEscrowFactory.address)).to.be.true;

      const funderRole = await escrow.FUNDER_ROLE();
      expect(await escrow.hasRole(funderRole, funderAccount.address)).to.be.true;

      const payeeRole = await escrow.PAYEE_ROLE();
      expect(await escrow.hasRole(payeeRole, payeeAccount.address)).to.be.true;
    });

    it("Should set correct roles when cloning escrow (w/ funder preset)", async function () {
      const { eventResult, arbitrableEscrowFactory, funderAccount, payeeAccount } = await createFunderEscrow(true);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      const adminRole = await escrow.DEFAULT_ADMIN_ROLE();
      expect(await escrow.hasRole(adminRole, arbitrableEscrowFactory.address)).to.be.true;

      const factoryRole = await escrow.FACTORY_ROLE();
      expect(await escrow.hasRole(factoryRole, arbitrableEscrowFactory.address)).to.be.true;

      const funderRole = await escrow.FUNDER_ROLE();
      expect(await escrow.hasRole(funderRole, funderAccount.address)).to.be.true;

      const payeeRole = await escrow.PAYEE_ROLE();
      expect(await escrow.hasRole(payeeRole, payeeAccount.address)).to.be.true;
    });
  });

  describe("Metadata", function () {
    it("Should provide correct uri", async function () {
      const { eventResult: funderWithoutPayeeEventResult, funderAccount, otherAccount1, otherAccount2, otherAccount3, fakeUSDToken } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", funderWithoutPayeeEventResult?.escrow);
      const baseUri = process.env.METADATA_BASE_URL;
      console.log(baseUri);

      expect(await escrow.escrowURI()).to.equal(`${baseUri}/${escrow.address}`);
    });
  });

  describe("Registeration", function () {
    it("Should set correct roles when registering as funder", async function () {
      // Funder creates.
      const { eventResult: funderWithoutPayeeEventResult, funderAccount, otherAccount1, otherAccount2, otherAccount3, fakeUSDToken } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", funderWithoutPayeeEventResult?.escrow);

      // then another funder registers by deposit.
      await fakeUSDToken.transfer(otherAccount1.address, 100);
      await fakeUSDToken.connect(otherAccount1).approve(escrow.address, 100);
      await expect(escrow.connect(otherAccount1).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;
      const funderRole = await escrow.FUNDER_ROLE();
      expect(await escrow.hasRole(funderRole, otherAccount1.address)).to.be.true;

      // then candidate payee registers.
      await escrow.connect(otherAccount2).registerAsPayee(ethers.utils.formatBytes32String("identifier"));
      const payeeRole = await escrow.PAYEE_ROLE();
      expect(await escrow.hasRole(payeeRole, otherAccount2.address)).to.be.false;

      // and unwanted payee also registers.
      await escrow.connect(otherAccount3).registerAsPayee(ethers.utils.formatBytes32String("false_identifier"));
      expect(await escrow.hasRole(payeeRole, otherAccount3.address)).to.be.false;

      // when approved by creator (funderAccount - funder), then PAYEE_ROLE should be granted for the payee.
      await escrow.connect(funderAccount).grantPayeeRole([otherAccount2.address]);
      expect(await escrow.hasRole(payeeRole, otherAccount2.address)).to.be.true;
      expect(await escrow.hasRole(payeeRole, otherAccount3.address)).to.be.false;
    });

    it("Should set correct roles when registering as payee", async function () {
      // Funder creates.
      const { eventResult: funderWithoutPayeeEventResult, payeeAccount, otherAccount1, otherAccount2, otherAccount3, fakeUSDToken } = await createPayeeEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", funderWithoutPayeeEventResult?.escrow);

      // then funder registers by deposit.
      await fakeUSDToken.transfer(otherAccount1.address, 100);
      await fakeUSDToken.connect(otherAccount1).approve(escrow.address, 100);
      await expect(escrow.connect(otherAccount1).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;
      const funderRole = await escrow.FUNDER_ROLE();
      expect(await escrow.hasRole(funderRole, otherAccount1.address)).to.be.true;

      // then some other payee registers.
      await escrow.connect(otherAccount2).registerAsPayee(ethers.utils.formatBytes32String("identifier"));
      const payeeRole = await escrow.PAYEE_ROLE();
      expect(await escrow.hasRole(payeeRole, otherAccount2.address)).to.be.false;

      // and unwanted payee also registers.
      await escrow.connect(otherAccount3).registerAsPayee(ethers.utils.formatBytes32String("false_identifier"));
      expect(await escrow.hasRole(payeeRole, otherAccount3.address)).to.be.false;

      // when approved by creator (funderAccount - funder), then PAYEE_ROLE should be granted for the payee.
      await escrow.connect(payeeAccount).grantPayeeRole([otherAccount2.address]);
      expect(await escrow.hasRole(payeeRole, otherAccount2.address)).to.be.true;
      expect(await escrow.hasRole(payeeRole, otherAccount3.address)).to.be.false;
    });

    it("Should add into funders list when registered as funder", async function () {
      // Funder creates.
      const { eventResult: funderWithoutPayeeEventResult, funderAccount, otherAccount1, fakeUSDToken } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", funderWithoutPayeeEventResult?.escrow);

      expect(await escrow.funders(0)).to.be.equal(funderAccount.address);

      // then another funder registers.
      await fakeUSDToken.transfer(otherAccount1.address, 100);
      await fakeUSDToken.connect(otherAccount1).approve(escrow.address, 100);
      await expect(escrow.connect(otherAccount1).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;
      expect(await escrow.funders(1)).to.be.equal(otherAccount1.address);
    });

    it("Should add into payee list when registered and granted as payee", async function () {
      // Funder creates.
      const { eventResult: funderWithoutPayeeEventResult, payeeAccount, otherAccount1 } = await createPayeeEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", funderWithoutPayeeEventResult?.escrow);

      expect(await escrow.payees(0)).to.be.equal(payeeAccount.address);

      // Payee joined
      await expect(escrow.connect(otherAccount1).registerAsPayee(ethers.utils.formatBytes32String("identifier"))).not.to.be.reverted;

      // Grant payee
      await escrow.connect(payeeAccount).grantPayeeRole([otherAccount1.address]);

      expect(await escrow.payees(1)).to.be.equal(otherAccount1.address);
    });

    it("Should not be able to register both funder and payee (as funder)", async function () {
      // Funder creates.
      const { eventResult, funderAccount } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      // then trying to be a payee.
      await expect(escrow.connect(funderAccount).registerAsPayee(ethers.utils.formatBytes32String("identifier"))).to.be.revertedWith("RoleBasedEscrow: funder cannot be a payee");
    });

    it("Should not be able to register both funder and payee (as payee)", async function () {
      // Payee creates.
      const { eventResult, payeeAccount, fakeUSDToken } = await createPayeeEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      // then trying to be a funder.
      await fakeUSDToken.transfer(payeeAccount.address, 100);
      await fakeUSDToken.connect(payeeAccount).approve(escrow.address, 100);
      await expect(escrow.connect(payeeAccount).deposit(fakeUSDToken.address, { value: 100 })).to.be.revertedWith("RoleBasedEscrow: payee cannot be a funder");
    });

    it("Should not be able to register twice for the payee role", async function () {
      // Payee creates.
      const { eventResult, payeeAccount } = await createPayeeEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      // register as candidate
      await expect(escrow.connect(payeeAccount).registerAsPayee(ethers.utils.formatBytes32String("identifier"))).not.to.be.reverted;

      // then trying to be a payee again by granting himself.
      await expect(escrow.connect(payeeAccount).grantPayeeRole([payeeAccount.address])).to.be.revertedWith("RoleBasedEscrow: cannot register twice as payee");
    });

    it("Should not be able to register twice for the payee candidate", async function () {
      // Payee creates.
      const { eventResult, payeeAccount, otherAccount1 } = await createPayeeEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      // register as candidate
      await expect(escrow.connect(otherAccount1).registerAsPayee(ethers.utils.formatBytes32String("identifier"))).not.to.be.reverted;

      // register twice
      await expect(escrow.connect(otherAccount1).registerAsPayee(ethers.utils.formatBytes32String("identifier"))).to.be.revertedWith("RoleBasedEscrow: cannot register twice as payee candidate");
    });
  });

  describe("Deposits (Funding)", function () {
    it("Should be able to deposit ERC20 tokens", async function () {
      const { eventResult, fakeUSDToken, funderAccount } = await createFunderEscrow(false);
      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      await fakeUSDToken.transfer(funderAccount.address, 1000);

      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 100);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;

      expect(await fakeUSDToken.balanceOf(funderAccount.address)).to.equal(900);
    });

    it("Should have correct amount of funds when deposit ERC20 tokens", async function () {
      const { eventResult, fakeUSDToken, fakeUSDToken2, funderAccount, otherAccount1 } = await createFunderEscrow(false);
      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      await fakeUSDToken.transfer(funderAccount.address, 1000);

      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 300);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 200 })).not.to.be.reverted;

      await fakeUSDToken2.transfer(otherAccount1.address, 1000);

      await fakeUSDToken2.connect(otherAccount1).approve(escrow.address, 300);
      await expect(escrow.connect(otherAccount1).deposit(fakeUSDToken2.address, { value: 300 })).not.to.be.reverted;

      expect(await fakeUSDToken.balanceOf(escrow.address)).to.equal(300);
      expect(await escrow.funds(funderAccount.address, fakeUSDToken.address)).to.equal(300);

      expect(await fakeUSDToken2.balanceOf(escrow.address)).to.equal(300);
      expect(await escrow.funds(otherAccount1.address, fakeUSDToken2.address)).to.equal(300);
    });

    it("Should be able to deposit multiple ERC20 tokens", async function () {
      const { eventResult, fakeUSDToken, fakeUSDToken2, funderAccount } = await createFunderEscrow(false);
      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      await fakeUSDToken.transfer(funderAccount.address, 1000);

      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 100);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;
      expect(await fakeUSDToken.balanceOf(funderAccount.address)).to.equal("900");
      expect(await escrow.funds(funderAccount.address, fakeUSDToken.address)).to.equal(100);

      await fakeUSDToken2.transfer(funderAccount.address, 1000);

      await fakeUSDToken2.connect(funderAccount).approve(escrow.address, 200);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken2.address, { value: 200 })).not.to.be.reverted;
      expect(await fakeUSDToken2.balanceOf(funderAccount.address)).to.equal("800");
      expect(await escrow.funds(funderAccount.address, fakeUSDToken2.address)).to.equal(200);
    });

    it("Should be able to deposit multiple times of same ERC20 tokens", async function () {
      const { eventResult, fakeUSDToken, fakeUSDToken2, funderAccount } = await createFunderEscrow(false);
      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      await fakeUSDToken.transfer(funderAccount.address, 1000);

      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 300);

      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;
      expect(await fakeUSDToken.balanceOf(funderAccount.address)).to.equal(900);

      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 200 })).not.to.be.reverted;
      expect(await fakeUSDToken.balanceOf(funderAccount.address)).to.equal(700);

      expect(await escrow.funds(funderAccount.address, fakeUSDToken.address)).to.equal(300);
    });

    it("Should mark deposit value for deposited funder only", async function () {
      const { eventResult, fakeUSDToken, funderAccount } = await createFunderEscrow(false);
      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      await fakeUSDToken.transfer(funderAccount.address, 1000);

      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 100);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;

      expect(await fakeUSDToken.balanceOf(funderAccount.address)).to.equal(900);
    });

    it("Should revert deposit if there is insufficient at funder's wallet", async function () {
      const { eventResult, fakeUSDToken, funderAccount } = await createFunderEscrow(false);
      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      await fakeUSDToken.transfer(funderAccount.address, 1000);

      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 1100);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 1100 })).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });
  });

  describe("Contract Activation", function () {
    it("Should not be able activate if there is no payee", async function () {
      const { eventResult, fakeUSDToken, funderAccount, payeeAccount } = await createFunderEscrow(false);
      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      await fakeUSDToken.transfer(funderAccount.address, 1000);

      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 1000);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;

      // Contract accepted
      await expect(escrow.connect(funderAccount).activateContract()).to.be.revertedWith("RoleBasedEscrow: There must be at least one payee");
    });
  });

  describe("Withdrawals", function () {
    it("Funders should be able to withdraw their funded ERC20 tokens before ACTIVE State", async function () {
      const { eventResult, fakeUSDToken, fakeUSDToken2, funderAccount } = await createFunderEscrow(false);
      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      await fakeUSDToken.transfer(funderAccount.address, 1000);

      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 1000);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 200 })).not.to.be.reverted;

      await fakeUSDToken2.transfer(funderAccount.address, 1000);

      await fakeUSDToken2.connect(funderAccount).approve(escrow.address, 1000);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken2.address, { value: 300 })).not.to.be.reverted;

      // Currently INITIALIZED state.
      await expect(escrow.connect(funderAccount).withdraw()).not.to.be.reverted;
      expect(await fakeUSDToken.balanceOf(funderAccount.address)).to.equal(1000);
      expect(await fakeUSDToken2.balanceOf(funderAccount.address)).to.equal(1000);
    });

    it("Should not be able to withdraw (both payee/funder) when payee accepts the contract and contract is still in active", async function () {
      const { eventResult, fakeUSDToken, funderAccount, payeeAccount } = await createFunderEscrow(false);
      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      await fakeUSDToken.transfer(funderAccount.address, 1000);

      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 1000);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;

      // Payee joined
      await expect(escrow.connect(payeeAccount).registerAsPayee(ethers.utils.formatBytes32String("identifier"))).not.to.be.reverted;

      // Grant payee
      await escrow.connect(funderAccount).grantPayeeRole([payeeAccount.address]);

      // Contract accepted
      await expect(escrow.connect(funderAccount).activateContract()).not.to.be.reverted;

      expect(await escrow.withdrawalAllowed(emptyAddress)).to.equal(false);
    });
  });

  describe("Settlement", function () {
    it("Should be able to settle after the confirmation is performed.", async function () {
      const { eventResult, fakeUSDToken, funderAccount, payeeAccount } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      // Deposit
      await fakeUSDToken.transfer(funderAccount.address, 1000);
      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 1000);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;

      // Payee join & grant
      await expect(escrow.connect(payeeAccount).registerAsPayee(ethers.utils.formatBytes32String("identifier"))).not.to.be.reverted;
      await escrow.connect(funderAccount).grantPayeeRole([payeeAccount.address]);

      // Contract accepted and Settle
      await expect(escrow.connect(funderAccount).activateContract()).not.to.be.reverted;
      await expect(escrow.connect(funderAccount).settle(true)).not.to.be.reverted;
    });

    it("Should not be able to settle before the confirmation is performed.", async function () {});

    it("Should be able to get rewarded when the settlement has completed. (autoWithdraw = true)", async function () {});

    it("Should not be able to get rewarded automatically when the settlement has completed. (autoWithdraw = false)", async function () {});

    it("Should be able to withdraw when the settlement has completed with autoWithdraw = false.", async function () {});

    it("Should set to FINALIZED state after the settlement has completed", async function () {});
  });

  describe("Events", function () {
    // TODOs:
    // event Deposited(address indexed funder, ERC20 erc20Token, uint256 amount);
    // event Withdrawn(address indexed payee, ERC20[] erc20Token, uint256[] amount);
    // event PayeeCandidateRegistered(address indexed payee);
    // event PayeeRegistered(address indexed payee);
    // event FunderRegistered(address indexed funder);
    // event ContractActivated(address indexed funder);
    // event ContractFinalized(address indexed sender);
    it("Should emit FunderRegistered event when depositing", async function () {
      const { eventResult, fakeUSDToken, funderAccount } = await createPayeeEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      await fakeUSDToken.transfer(funderAccount.address, 300);
      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 300);
      await expect(escrow.connect(funderAccount).deposit(fakeUSDToken.address, { value: 300 }))
        .to.emit(escrow, "FunderRegistered")
        .withArgs(funderAccount.address);
    });

    it("Should emit PayeeRegistered event when payee is granted", async function () {
      const { eventResult, funderAccount, payeeAccount } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);
      await escrow.connect(payeeAccount).registerAsPayee(ethers.utils.formatBytes32String("identifier"));

      await expect(escrow.connect(funderAccount).grantPayeeRole([payeeAccount.address]))
        .to.emit(escrow, "PayeeRegistered")
        .withArgs(payeeAccount.address);
    });
  });

  describe("One-to-One Happy Path", function () {
    it("Should pass each steps properly w/ createEscrowAsFunder", async function () {
      const { eventResult, fakeUSDToken, funderAccount, payeeAccount } = await createFunderEscrow(false);

      const escrowAddress = eventResult?.escrow;

      // const contractWithPublicAccess = await ethers.getContractAt("ArbitrableEscrow", escrowAddress);

      // 1. A funder create a contract
      const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
      const onlyFunder = await contractWithFunder.funders(0);
      expect(onlyFunder).to.be.equals(funderAccount.address);

      // 2. A payee registers himself as a payee of the contract
      // Secret identifier is shared between the funder and the payee
      const secretIdentifier = ethers.utils.formatBytes32String("0123456789abcdef");
      const contractWithPayee = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, payeeAccount);
      await contractWithPayee.registerAsPayee(secretIdentifier);
      const onlyPayeeCandidate = await contractWithPayee.payeeCandidates(0);
      // since the payee is not yet confirmed payee
      await expect(contractWithPayee.payees(0)).to.be.reverted;
      expect(onlyPayeeCandidate).to.be.equals(payeeAccount.address);

      // 3. The funder first approve an ERC20 token
      // The funder has 1000 USDT now
      await fakeUSDToken.transfer(funderAccount.address, 1000);
      // Spending 300 USDT is allowed
      await fakeUSDToken.connect(funderAccount).approve(escrowAddress, 300);

      const toDeposit = 300;
      await contractWithFunder.deposit(fakeUSDToken.address, { value: toDeposit });
      const fund = await contractWithFunder.funds(funderAccount.address, fakeUSDToken.address);
      expect(fund).to.be.equals(toDeposit);

      // 4. The funder grant payee role to the payee with shared secret identifier
      await contractWithFunder.grantPayeeRole([payeeAccount.address]);
      const onlyPayee = await contractWithFunder.payees(0);
      expect(onlyPayee).to.be.equals(payeeAccount.address);

      // 5. The funder activates the contract
      await contractWithFunder.activateContract();
      const updatedState = await contractWithFunder.state();
      expect(updatedState).to.be.equals(1);

      // (The payee do his job)
      // 6. The funder settles the contract
      await contractWithFunder.settle(false);
      const updatedState2 = await contractWithFunder.state();
      expect(updatedState2).to.be.equals(2);
      expect(await contractWithFunder.withdrawalAllowed(payeeAccount.address)).to.be.true;

      const reward = await contractWithFunder.funds(payeeAccount.address, fakeUSDToken.address);
      expect(+reward).to.equals(toDeposit);

      // 7. The payee withdraw his reward
      await contractWithPayee.withdraw();
      const payeeBalance = await fakeUSDToken.connect(payeeAccount).balanceOf(payeeAccount.address);
      expect(+payeeBalance).to.equals(toDeposit);
    });

    it("Should pass each steps properly w/ createEscrowAsPayee", async function () {
      // Note that this testcase only covers one-to-one case.
      // Note that if a payee initiates a contract,
      // - the payee doesn't need to grant himself as a contract's payee, it is set when initialized.
      // - the payee activates the contract.

      const { eventResult, fakeUSDToken, funderAccount, payeeAccount } = await createPayeeEscrow(false);

      const escrowAddress = eventResult?.escrow;

      // 1. A payee create a contract
      const contractWithPayee = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, payeeAccount);
      const onlyPayee = await contractWithPayee.payees(0);
      expect(onlyPayee).to.be.equals(payeeAccount.address);
      // since the payee is not yet confirmed payee
      await expect(contractWithPayee.payeeCandidates(0)).to.be.reverted;

      // 2. A funder need to approve an ERC20 token
      // The funder has 1000 USDT now
      await fakeUSDToken.transfer(funderAccount.address, 1000);
      // Spending 300 USDT is allowed
      await fakeUSDToken.connect(funderAccount).approve(escrowAddress, 300);

      // 3. The funder deposit the token
      const toDeposit = 300;
      const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
      await contractWithFunder.deposit(fakeUSDToken.address, { value: toDeposit });
      const fund = await contractWithFunder.funds(funderAccount.address, fakeUSDToken.address);
      expect(fund).to.be.equals(toDeposit);

      // 4. The funder activates the contract
      await contractWithPayee.activateContract();
      const updatedState = await contractWithPayee.state();
      expect(updatedState).to.be.equals(1);

      // (The payee does his job)

      // 6. The funder settles the contract
      await contractWithFunder.settle(false);
      const updatedState2 = await contractWithFunder.state();
      expect(updatedState2).to.be.equals(2);
      expect(await contractWithFunder.withdrawalAllowed(payeeAccount.address)).to.be.true;

      const reward = await contractWithFunder.funds(payeeAccount.address, fakeUSDToken.address);
      expect(+reward).to.equals(toDeposit);

      // 7. The payee withdraw his reward
      await contractWithPayee.withdraw();
      const payeeBalance = await fakeUSDToken.connect(payeeAccount).balanceOf(payeeAccount.address);
      expect(+payeeBalance).to.equals(toDeposit);
    });
  });

  describe("Proper response for all public function calls for each steps made by each actors", function () {
    // The contract should response properly for each public function in a intended way.
    //
    // The list below is all possible public calls:
    // ArbitrableEscrow:
    // - requestArbitration
    // RoleBasedEscrow:
    // - initializeAsFunder
    // - initializeAsPayee
    // - registerAsPayee
    // - grantPayeeRole
    // - deposit
    // - withdraw
    // - withdrawalAllowed
    // - activateContract
    // - settle
    // - state
    // - payeeExist
    // - funderExist
    // - candidateExist

    describe("Right after createEscrowAsFunder all public calls made by funder should work properly", async function () {
      let escrowAddress: string;
      let arbitrableEscrowFactory;
      let fakeUSDToken: ERC20FakeUSDToken;
      let fakeUSDToken2: ERC20FakeUSDToken2;
      let funderAccount: SignerWithAddress;
      let otherAccount1: SignerWithAddress;
      let otherAccount2: SignerWithAddress;
      let payeeAccount: SignerWithAddress;

      this.beforeEach(async function () {
        const fixture = await createFunderEscrow(false);
        escrowAddress = fixture.eventResult?.escrow;
        arbitrableEscrowFactory = fixture.arbitrableEscrowFactory;
        fakeUSDToken = fixture.fakeUSDToken;
        fakeUSDToken2 = fixture.fakeUSDToken2;
        funderAccount = fixture.funderAccount;
        otherAccount1 = fixture.otherAccount1;
        otherAccount2 = fixture.otherAccount2;
        payeeAccount = fixture.payeeAccount;
      });

      it("requestArbitration: should be possible only when the contract is activated", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        await expect(contractWithFunder.requestArbitration()).to.be.revertedWith("ArbitrableEscrow: can only start arbitration while ACTIVE");
      });

      it("initializeAsFunder: if contract is already initalized initializeAsFunder should not be possible", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        await expect(contractWithFunder.initializeAsFunder(funderAccount.address, payeeAccount.address, "")).to.be.reverted;
      });

      it("initializeAsPayee: if contract is already initalized initializeAsPayee should not be possible", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        await expect(contractWithFunder.initializeAsPayee(funderAccount.address, payeeAccount.address, "")).to.be.reverted;
      });

      // (4) registerAsPayee: Since registerAsPayee progresses the state of this contract, it does not test here.

      it("grantPayeeRole: function call with empty array should be reverted", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        await expect(contractWithFunder.grantPayeeRole([])).to.be.revertedWith("RoleBasedEscrow: array must be larger than 0");
      });

      it("grantPayeeRole: since payee is yet set, should be reverted", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        await expect(contractWithFunder.grantPayeeRole([payeeAccount.address])).to.be.revertedWith("RoleBasedEscrow: there is no candidates to grant");
      });

      // (6) deposit: Since deposit changes the state of this contarct, it does not test here.

      it("withdraw: withdraw should be possible, although there's no effect at all", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        await expect(contractWithFunder.withdraw()).not.to.be.reverted;
      });

      it("withdrawalAllowed: funder should be possible", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        // Since there is no deposit in this test, there is no effect at all. But withdarwl should be allowed.
        expect(await contractWithFunder.withdrawalAllowed(funderAccount.address)).to.equals(true);
      });

      it("activateContract should be reverted since no payee is set", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        await expect(contractWithFunder.activateContract()).to.be.revertedWith("RoleBasedEscrow: There must be at least one payee");
      });

      it("settle should be reverted since the state of the contract is INITIALIZED", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        await expect(contractWithFunder.settle(false)).to.be.revertedWith("RoleBasedEscrow: Escrow can be finalized (settled) on ACTIVATED state only");
      });

      it("state should react properly", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        expect(await contractWithFunder.state()).to.equals(0);
      });

      it("payeeExist should react properly", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        expect(await contractWithFunder.payeeExist(funderAccount.address)).to.be.false;
        expect(await contractWithFunder.payeeExist(payeeAccount.address)).to.be.false;
      });

      it("funderExist should react properly", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        expect(await contractWithFunder.funderExist(funderAccount.address)).to.be.true;
        expect(await contractWithFunder.funderExist(payeeAccount.address)).to.be.false;
      });

      it("candidateExist should react properly", async function () {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        expect(await contractWithFunder.candidateExist(funderAccount.address)).to.be.false;
        expect(await contractWithFunder.candidateExist(payeeAccount.address)).to.be.false;
      });
    });

    describe("Right after registerAsPayee all public calls made by funder should work properly", async function () {
      let escrowAddress: string;
      let arbitrableEscrowFactory;
      let fakeUSDToken: ERC20FakeUSDToken;
      let fakeUSDToken2: ERC20FakeUSDToken2;
      let funderAccount: SignerWithAddress;
      let otherAccount1: SignerWithAddress;
      let otherAccount2: SignerWithAddress;
      let payeeAccount: SignerWithAddress;

      this.beforeEach(async function () {
        const fixture = await createFunderEscrow(false);
        escrowAddress = fixture.eventResult?.escrow;
        arbitrableEscrowFactory = fixture.arbitrableEscrowFactory;
        fakeUSDToken = fixture.fakeUSDToken;
        fakeUSDToken2 = fixture.fakeUSDToken2;
        funderAccount = fixture.funderAccount;
        otherAccount1 = fixture.otherAccount1;
        otherAccount2 = fixture.otherAccount2;
        payeeAccount = fixture.payeeAccount;
      });

      const goToRegisterAsPayeeStep = async ({ escrowAddress, funderAccount, payeeAccount }: { escrowAddress: string; funderAccount: SignerWithAddress; payeeAccount: SignerWithAddress }) => {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        const secretIdentifier = ethers.utils.formatBytes32String("0123456789abcdef");
        const contractWithPayee = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, payeeAccount);
        await contractWithPayee.registerAsPayee(secretIdentifier);
        return contractWithFunder;
      };

      it("requestArbitration: should be possible only when the contract is activated", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        await expect(contractWithFunder.requestArbitration()).to.be.revertedWith("ArbitrableEscrow: can only start arbitration while ACTIVE");
      });

      it("initializeAsFunder: if contract is already initalized initializeAsFunder should not be possible", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        await expect(contractWithFunder.initializeAsFunder(funderAccount.address, payeeAccount.address, "")).to.be.reverted;
      });

      it("initializeAsPayee: if contract is already initalized initializeAsPayee should not be possible", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        await expect(contractWithFunder.initializeAsPayee(funderAccount.address, payeeAccount.address, "")).to.be.reverted;
      });

      it("registerAsPayee: if the contract creator is funder, then he cannot be register himself as a payee", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        const secretIdentifier = ethers.utils.formatBytes32String("EVILFUNDER");
        await expect(contractWithFunder.registerAsPayee(secretIdentifier)).to.be.reverted;
      });

      it("grantPayeeRole: since a candidate is ready, should not be reverted", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        await expect(contractWithFunder.grantPayeeRole([payeeAccount.address])).not.to.be.reverted;
      });

      // deposit: Since deposit changes the state of this contarct to the next step, it does not test here.

      it("withdraw: withdraw should be possible, although there's no effect at all", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        await expect(contractWithFunder.withdraw()).not.to.be.reverted;
      });

      it("withdrawalAllowed: funder should be possible", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        // Since there is no deposit in this test, there is no effect at all. But withdarwl should be allowed.
        expect(await contractWithFunder.withdrawalAllowed(funderAccount.address)).to.equals(true);
      });

      it("activateContract should be reverted since no payee is set", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        await expect(contractWithFunder.activateContract()).to.be.reverted;
      });

      it("settle should be reverted since the state of the contract is INITIALIZED", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        await expect(contractWithFunder.settle(false)).to.be.revertedWith("RoleBasedEscrow: Escrow can be finalized (settled) on ACTIVATED state only");
      });

      it("state should react properly", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        expect(await contractWithFunder.state()).to.equals(0);
      });

      it("payeeExist should react properly", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        expect(await contractWithFunder.payeeExist(funderAccount.address)).to.be.false;
        expect(await contractWithFunder.payeeExist(payeeAccount.address)).to.be.false;
      });

      it("funderExist should react properly", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        expect(await contractWithFunder.funderExist(funderAccount.address)).to.be.true;
        expect(await contractWithFunder.funderExist(payeeAccount.address)).to.be.false;
      });

      it("candidateExist should react properly", async function () {
        const contractWithFunder = await goToRegisterAsPayeeStep({ escrowAddress, funderAccount, payeeAccount });
        expect(await contractWithFunder.candidateExist(funderAccount.address)).to.be.false;
        expect(await contractWithFunder.candidateExist(payeeAccount.address)).to.be.true;
      });
    });

    describe("Right after deposit all public calls made by funder should work properly", async function () {
      let escrowAddress: string;
      let arbitrableEscrowFactory;
      let fakeUSDToken: ERC20FakeUSDToken;
      let fakeUSDToken2: ERC20FakeUSDToken2;
      let funderAccount: SignerWithAddress;
      let otherAccount1: SignerWithAddress;
      let otherAccount2: SignerWithAddress;
      let payeeAccount: SignerWithAddress;

      this.beforeEach(async function () {
        const fixture = await createFunderEscrow(false);
        escrowAddress = fixture.eventResult?.escrow;
        arbitrableEscrowFactory = fixture.arbitrableEscrowFactory;
        fakeUSDToken = fixture.fakeUSDToken;
        fakeUSDToken2 = fixture.fakeUSDToken2;
        funderAccount = fixture.funderAccount;
        otherAccount1 = fixture.otherAccount1;
        otherAccount2 = fixture.otherAccount2;
        payeeAccount = fixture.payeeAccount;
      });

      const goToDepositStep = async ({
        escrowAddress,
        funderAccount,
        payeeAccount,
        fakeUSDToken,
      }: {
        escrowAddress: string;
        funderAccount: SignerWithAddress;
        payeeAccount: SignerWithAddress;
        fakeUSDToken: ERC20FakeUSDToken;
      }) => {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        const secretIdentifier = ethers.utils.formatBytes32String("0123456789abcdef");
        const contractWithPayee = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, payeeAccount);
        await contractWithPayee.registerAsPayee(secretIdentifier);

        // 3. The funder first approve an ERC20 token
        // The funder has 1000 USDT now
        await fakeUSDToken.transfer(funderAccount.address, 1000);
        // Spending 300 USDT is allowed
        await fakeUSDToken.connect(funderAccount).approve(escrowAddress, 1000);

        const toDeposit = 300;
        await contractWithFunder.deposit(fakeUSDToken.address, { value: toDeposit });
        return contractWithFunder;
      };

      it("requestArbitration: should be possible only when the contract is activated", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.requestArbitration()).to.be.revertedWith("ArbitrableEscrow: can only start arbitration while ACTIVE");
      });

      it("initializeAsFunder: if contract is already initalized initializeAsFunder should not be possible", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.initializeAsFunder(funderAccount.address, payeeAccount.address, "")).to.be.reverted;
      });

      it("initializeAsPayee: if contract is already initalized initializeAsPayee should not be possible", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.initializeAsPayee(funderAccount.address, payeeAccount.address, "")).to.be.reverted;
      });

      it("registerAsPayee: if the contract creator is funder, then he cannot be register himself as a payee", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        const secretIdentifier = ethers.utils.formatBytes32String("EVILFUNDER");
        await expect(contractWithFunder.registerAsPayee(secretIdentifier)).to.be.reverted;
      });

      it("grantPayeeRole: since a candidate is ready, should not be reverted", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.grantPayeeRole([payeeAccount.address])).not.to.be.reverted;
      });

      it("deposit: additional `deposit` should deposit more", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.deposit(fakeUSDToken.address, { value: 300 })).not.to.be.reverted;
        expect(await contractWithFunder.funds(funderAccount.address, fakeUSDToken.address)).to.equals(600); // 300 + 300
      });

      it("withdraw: withdraw should be possible and balance should match", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.withdraw()).not.to.be.reverted;
        expect(await contractWithFunder.funds(funderAccount.address, fakeUSDToken.address)).to.equals(0);
        expect(+(await fakeUSDToken.balanceOf(funderAccount.address))).to.equals(1000);
      });

      it("withdrawalAllowed: funder should be possible", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        expect(await contractWithFunder.withdrawalAllowed(funderAccount.address)).to.equals(true);
      });

      it("activateContract should be reverted since no payee is set", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.activateContract()).to.be.reverted;
      });

      it("settle should be reverted since the state of the contract is INITIALIZED", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.settle(false)).to.be.revertedWith("RoleBasedEscrow: Escrow can be finalized (settled) on ACTIVATED state only");
      });

      it("state should react properly", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        expect(await contractWithFunder.state()).to.equals(0);
      });

      it("payeeExist should react properly", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        expect(await contractWithFunder.payeeExist(funderAccount.address)).to.be.false;
        expect(await contractWithFunder.payeeExist(payeeAccount.address)).to.be.false;
      });

      it("funderExist should react properly", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        expect(await contractWithFunder.funderExist(funderAccount.address)).to.be.true;
        expect(await contractWithFunder.funderExist(payeeAccount.address)).to.be.false;
      });

      it("candidateExist should react properly", async function () {
        const contractWithFunder = await goToDepositStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        expect(await contractWithFunder.candidateExist(funderAccount.address)).to.be.false;
        expect(await contractWithFunder.candidateExist(payeeAccount.address)).to.be.true;
      });
    });

    describe("Right after deposit all public calls made by funder should work properly", async function () {
      let escrowAddress: string;
      let arbitrableEscrowFactory;
      let fakeUSDToken: ERC20FakeUSDToken;
      let fakeUSDToken2: ERC20FakeUSDToken2;
      let funderAccount: SignerWithAddress;
      let otherAccount1: SignerWithAddress;
      let otherAccount2: SignerWithAddress;
      let payeeAccount: SignerWithAddress;

      this.beforeEach(async function () {
        const fixture = await createFunderEscrow(false);
        escrowAddress = fixture.eventResult?.escrow;
        arbitrableEscrowFactory = fixture.arbitrableEscrowFactory;
        fakeUSDToken = fixture.fakeUSDToken;
        fakeUSDToken2 = fixture.fakeUSDToken2;
        funderAccount = fixture.funderAccount;
        otherAccount1 = fixture.otherAccount1;
        otherAccount2 = fixture.otherAccount2;
        payeeAccount = fixture.payeeAccount;
      });

      const goToGrantPayeeRoleStep = async ({
        escrowAddress,
        funderAccount,
        payeeAccount,
        fakeUSDToken,
      }: {
        escrowAddress: string;
        funderAccount: SignerWithAddress;
        payeeAccount: SignerWithAddress;
        fakeUSDToken: ERC20FakeUSDToken;
      }) => {
        const contractWithFunder = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, funderAccount);
        const secretIdentifier = ethers.utils.formatBytes32String("0123456789abcdef");
        const contractWithPayee = await ethers.getContractAt("ArbitrableEscrow", escrowAddress, payeeAccount);
        await contractWithPayee.registerAsPayee(secretIdentifier);

        // 3. The funder first approve an ERC20 token
        // The funder has 1000 USDT now
        await fakeUSDToken.transfer(funderAccount.address, 1000);
        // Spending 300 USDT is allowed
        await fakeUSDToken.connect(funderAccount).approve(escrowAddress, 1000);

        const toDeposit = 300;
        await contractWithFunder.deposit(fakeUSDToken.address, { value: toDeposit });
        await contractWithFunder.grantPayeeRole([payeeAccount.address]);
        return contractWithFunder;
      };

      it("requestArbitration: should be possible only when the contract is activated", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.requestArbitration()).to.be.revertedWith("ArbitrableEscrow: can only start arbitration while ACTIVE");
      });

      it("initializeAsFunder: if contract is already initalized initializeAsFunder should not be possible", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.initializeAsFunder(funderAccount.address, payeeAccount.address, "")).to.be.reverted;
      });

      it("initializeAsPayee: if contract is already initalized initializeAsPayee should not be possible", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.initializeAsPayee(funderAccount.address, payeeAccount.address, "")).to.be.reverted;
      });

      it("registerAsPayee: if the contract creator is funder, then he cannot be register himself as a payee", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        const secretIdentifier = ethers.utils.formatBytes32String("EVILFUNDER");
        await expect(contractWithFunder.registerAsPayee(secretIdentifier)).to.be.reverted;
      });

      it("grantPayeeRole: since a candidate has been just set as a payee, it should be reverted with a message", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.grantPayeeRole([payeeAccount.address])).to.be.revertedWith("RoleBasedEscrow: cannot register twice as payee");
      });

      it("deposit: additional `deposit` should deposit more", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.deposit(fakeUSDToken.address, { value: 300 })).not.to.be.reverted;
        expect(await contractWithFunder.funds(funderAccount.address, fakeUSDToken.address)).to.equals(600); // 300 + 300
      });

      it("withdraw: withdraw should be possible and balance should match", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.withdraw()).not.to.be.reverted;
        expect(await contractWithFunder.funds(funderAccount.address, fakeUSDToken.address)).to.equals(0);
        expect(+(await fakeUSDToken.balanceOf(funderAccount.address))).to.equals(1000);
      });

      it("withdrawalAllowed: funder should be possible", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        expect(await contractWithFunder.withdrawalAllowed(funderAccount.address)).to.equals(true);
      });

      it("activateContract should not be reverted since a payee is set", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.activateContract()).not.to.be.reverted;
      });

      it("settle should be reverted since the state of the contract is INITIALIZED", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        await expect(contractWithFunder.settle(false)).to.be.revertedWith("RoleBasedEscrow: Escrow can be finalized (settled) on ACTIVATED state only");
      });

      it("state should react properly", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        expect(await contractWithFunder.state()).to.equals(0);
      });

      it("payeeExist should react properly", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        expect(await contractWithFunder.payeeExist(funderAccount.address)).to.be.false;
        // now that the payee has been set it should exist
        expect(await contractWithFunder.payeeExist(payeeAccount.address)).to.be.true;
      });

      it("funderExist should react properly", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        expect(await contractWithFunder.funderExist(funderAccount.address)).to.be.true;
        expect(await contractWithFunder.funderExist(payeeAccount.address)).to.be.false;
      });

      it("candidateExist should react properly", async function () {
        const contractWithFunder = await goToGrantPayeeRoleStep({ escrowAddress, funderAccount, payeeAccount, fakeUSDToken });
        expect(await contractWithFunder.candidateExist(funderAccount.address)).to.be.false;
        // although that the candidate has become actual payee it should still be true
        expect(await contractWithFunder.candidateExist(payeeAccount.address)).to.be.true;
      });
    });
  });
});
