import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

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
    const [factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2] = await ethers.getSigners();

    const ArbitrableEscrowFactory = await ethers.getContractFactory("ArbitrableEscrowFactory");
    const arbitrableEscrowFactory = await ArbitrableEscrowFactory.deploy(address);

    await arbitrableEscrowFactory.deployed();

    const { fakeUSDToken, fakeUSDToken2 } = await deployFakeUSDFixture();

    return { arbitrableEscrowFactory, fakeUSDToken, fakeUSDToken2, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2 };
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
    const fakeUSDToken2 = await FakeUSDToken.deploy();

    await fakeUSDToken2.deployed();

    return { fakeUSDToken, fakeUSDToken2, ownerAccount, funderAccount };
  }

  async function createFunderEscrow(presetPayee: boolean) {
    const { arbitrableEscrowFactory, fakeUSDToken, fakeUSDToken2, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2 } = await loadFixture(
      deployEscrowFactoryFixtureWithAddress
    );

    const tx = await arbitrableEscrowFactory.connect(funderAccount).createEscrowAsFunder(presetPayee ? payeeAccount.address : emptyAddress);
    const txReceipt = await tx.wait();
    const event = txReceipt.events?.find((x) => {
      return x.event == "EscrowCreated";
    });

    const eventResult = event?.args;

    return { arbitrableEscrowFactory, tx, eventResult, fakeUSDToken, fakeUSDToken2, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2 };
  }

  // async function createPayeeEscrow(presetFunder: boolean) {
  //   const { arbitrableEscrowFactory, fakeUSDToken, fakeUSDToken2, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2 } = await loadFixture(
  //     deployEscrowFactoryFixtureWithAddress
  //   );

  //   const tx = await arbitrableEscrowFactory.connect(payeeAccount).createEscrowAsPayee(presetFunder ? funderAccount.address : emptyAddress);
  //   const txReceipt = await tx.wait();
  //   const event = txReceipt.events?.find((x) => {
  //     return x.event == "EscrowCreated";
  //   });

  //   const eventResult = event?.args;

  //   return { arbitrableEscrowFactory, tx, eventResult, fakeUSDToken, fakeUSDToken2, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2 };
  // }

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

      await expect(arbitrableEscrow.initialize(payeeAccount.address, funderAccount.address)).to.be.reverted;
    });

    it("Should be able to clone escrow via factory (by funder)", async function () {
      const { tx } = await createFunderEscrow(true);

      await expect(tx).not.to.be.reverted;

      const { tx: onlyFunderTx } = await createFunderEscrow(false);

      await expect(onlyFunderTx).not.to.be.reverted;
    });

    // it("Should be able to clone escrow via factory (by payee)", async function () {
    //   const { tx } = await createPayeeEscrow(true);

    //   await expect(tx).not.to.be.reverted;

    //   const { tx: onlyPayeeTx } = await createPayeeEscrow(false);

    //   await expect(onlyPayeeTx).not.to.be.reverted;
    // });

    it("Should set empty address if opponent address is not provided", async function () {
      const { eventResult: onlyFunderEvent } = await createFunderEscrow(false);

      const onlyFunderEscrow = await ethers.getContractAt("ArbitrableEscrow", onlyFunderEvent?.escrow);
      await expect(onlyFunderEscrow.payees(0)).to.be.reverted;

      // const { eventResult: onlyPayeeEvent } = await createPayeeEscrow(false);

      // const onlyPayeeEscrow = await ethers.getContractAt("ArbitrableEscrow", onlyPayeeEvent?.escrow);
      // await expect(onlyPayeeEscrow.funders(0)).to.be.reverted;
    });

    // it("Should set correct roles when cloning escrow (w/ payee preset)", async function () {
    //   const { eventResult, arbitrableEscrowFactory, funderAccount, payeeAccount } = await createPayeeEscrow(true);

    //   const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

    //   const adminRole = await escrow.DEFAULT_ADMIN_ROLE();
    //   expect(await escrow.hasRole(adminRole, arbitrableEscrowFactory.address)).to.be.true;

    //   const factoryRole = await escrow.FACTORY_ROLE();
    //   expect(await escrow.hasRole(factoryRole, arbitrableEscrowFactory.address)).to.be.true;

    //   const funderRole = await escrow.FUNDER_ROLE();
    //   expect(await escrow.hasRole(funderRole, funderAccount.address)).to.be.true;

    //   const payeeRole = await escrow.PAYEE_ROLE();
    //   expect(await escrow.hasRole(payeeRole, payeeAccount.address)).to.be.true;
    // });

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

  describe("Registeration", function () {
    it("Should set correct roles when registering as funder/payee", async function () {
      // Funder creates.
      const { eventResult: funderWithoutPayeeEventResult, otherAccount1, otherAccount2, fakeUSDToken } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", funderWithoutPayeeEventResult?.escrow);

      // then another funder registers by deposit.
      await fakeUSDToken.transfer(otherAccount1.address, 100);
      await fakeUSDToken.connect(otherAccount1).approve(escrow.address, 100);
      await expect(escrow.connect(otherAccount1).deposit(fakeUSDToken.address, { value: 100 })).not.to.be.reverted;
      const funderRole = await escrow.FUNDER_ROLE();
      expect(await escrow.hasRole(funderRole, otherAccount1.address)).to.be.true;

      // then another payee registers.
      await escrow.connect(otherAccount2).registerAsPayee();
      const payeeRole = await escrow.PAYEE_ROLE();
      expect(await escrow.hasRole(payeeRole, otherAccount2.address)).to.be.true;
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

    // it("Should add into payee list when registered as payee", async function () {
    //   // Funder creates.
    //   const { eventResult: funderWithoutPayeeEventResult, payeeAccount, otherAccount1 } = await createPayeeEscrow(false);

    //   const escrow = await ethers.getContractAt("ArbitrableEscrow", funderWithoutPayeeEventResult?.escrow);

    //   expect(await escrow.payees(0)).to.be.equal(payeeAccount.address);

    //   // then another funder registers.
    //   await escrow.connect(otherAccount1).registerAsPayee();
    //   expect(await escrow.payees(1)).to.be.equal(otherAccount1.address);
    // });

    it("Should not be able to register both funder and payee (as funder)", async function () {
      // Funder creates.
      const { eventResult, funderAccount } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      // then trying to be a payee.
      await expect(escrow.connect(funderAccount).registerAsPayee()).to.be.revertedWith("RoleBasedEscrow: funder cannot be a payee");
    });

    // it("Should not be able to register both funder and payee (as payee)", async function () {
    //   // Payee creates.
    //   const { eventResult, payeeAccount, fakeUSDToken } = await createPayeeEscrow(false);

    //   const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

    //   // then trying to be a funder.
    //   await fakeUSDToken.transfer(payeeAccount.address, 100);
    //   await fakeUSDToken.connect(payeeAccount).approve(escrow.address, 100);
    //   await expect(escrow.connect(payeeAccount).deposit(fakeUSDToken.address, { value: 100 })).to.be.revertedWith("RoleBasedEscrow: payee cannot be a funder");
    // });

    // it("Should not be able to register twice for the funder role", async function () {
    //   // Funder creates.
    //   const { eventResult, funderAccount } = await createFunderEscrow(false);

    //   const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

    //   // then trying to be a funder again.
    //   await expect(escrow.connect(funderAccount).registerAsFunder()).to.be.revertedWith("RoleBasedEscrow: cannot register twice as funder");
    // });

    // it("Should not be able to register twice for the payee role", async function () {
    //   // Payee creates.
    //   const { eventResult, payeeAccount } = await createPayeeEscrow(false);

    //   const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

    //   // then trying to be a payee again.
    //   await expect(escrow.connect(payeeAccount).registerAsPayee()).to.be.revertedWith("RoleBasedEscrow: cannot register twice as payee");
    // });
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
      await expect(escrow.connect(payeeAccount).registerAsPayee()).not.to.be.reverted;

      // Contract accepted
      await expect(escrow.connect(funderAccount).activateContract()).not.to.be.reverted;

      expect(await escrow.withdrawalAllowed(emptyAddress)).to.equal(false);
    });
  });

  describe("Contract Confirmation", function () {});

  describe("Events", function () {
    // it("Should emit FunderRegistered event when registering as funder", async function () {
    //   const { eventResult, funderAccount } = await createPayeeEscrow(false);

    //   const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

    //   await expect(escrow.connect(funderAccount).registerAsFunder()).to.emit(escrow, "FunderRegistered").withArgs(funderAccount.address);
    // });

    it("Should emit PayeeRegistered event when registering as payee", async function () {
      const { eventResult, payeeAccount } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrow", eventResult?.escrow);

      await expect(escrow.connect(payeeAccount).registerAsPayee()).to.emit(escrow, "PayeeRegistered").withArgs(payeeAccount.address);
    });
  });
});
