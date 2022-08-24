import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const emptyAddress = "0x0000000000000000000000000000000000000000";

describe("ArbitrableEscrowUpgradeable", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployEscrowFixture() {
    // Contracts are deployed using the first signer/account by default
    const [factoryAccount, funderAccount, payeeAccount] = await ethers.getSigners();

    const ArbitrableEscrowUpgradeable = await ethers.getContractFactory("ArbitrableEscrowUpgradeable");
    const arbitrableEscrowUpgradeable = await ArbitrableEscrowUpgradeable.deploy();

    await arbitrableEscrowUpgradeable.deployed();

    return { arbitrableEscrowUpgradeable, factoryAccount, funderAccount, payeeAccount };
  }

  async function deployEscrowFactoryFixture(address: string) {
    // Contracts are deployed using the first signer/account by default
    const [factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2] = await ethers.getSigners();

    const ArbitrableEscrowFactoryUpgradeable = await ethers.getContractFactory("ArbitrableEscrowFactoryUpgradeable");
    const arbitrableEscrowFactoryUpgradeable = await ArbitrableEscrowFactoryUpgradeable.deploy(address);

    await arbitrableEscrowFactoryUpgradeable.deployed();

    return { arbitrableEscrowFactoryUpgradeable, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2 };
  }

  async function deployEscrowFactoryFixtureWithAddress() {
    // Contracts are deployed using the first signer/account by default
    const { arbitrableEscrowUpgradeable } = await deployEscrowFixture();

    return deployEscrowFactoryFixture(arbitrableEscrowUpgradeable.address);
  }

  async function createFunderEscrow(presetPayee: boolean) {
    const { arbitrableEscrowFactoryUpgradeable, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2 } = await loadFixture(deployEscrowFactoryFixtureWithAddress);

    const tx = await arbitrableEscrowFactoryUpgradeable.connect(funderAccount).createEscrowAsFunder(presetPayee ? payeeAccount.address : emptyAddress);
    const txReceipt = await tx.wait();
    const event = txReceipt.events?.find((x) => {
      return x.event == "EscrowCreated";
    });

    const eventResult = event?.args;

    return { arbitrableEscrowFactoryUpgradeable, tx, eventResult, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2 };
  }

  async function createPayeeEscrow(presetFunder: boolean) {
    const { arbitrableEscrowFactoryUpgradeable, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2 } = await loadFixture(deployEscrowFactoryFixtureWithAddress);

    const tx = await arbitrableEscrowFactoryUpgradeable.connect(payeeAccount).createEscrowAsPayee(presetFunder ? funderAccount.address : emptyAddress);
    const txReceipt = await tx.wait();
    const event = txReceipt.events?.find((x) => {
      return x.event == "EscrowCreated";
    });

    const eventResult = event?.args;

    return { arbitrableEscrowFactoryUpgradeable, tx, eventResult, factoryAccount, funderAccount, payeeAccount, otherAccount1, otherAccount2 };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { arbitrableEscrowUpgradeable, factoryAccount } = await loadFixture(deployEscrowFixture);

      const adminRole = await arbitrableEscrowUpgradeable.DEFAULT_ADMIN_ROLE();
      expect(await arbitrableEscrowUpgradeable.hasRole(adminRole, factoryAccount.address)).to.true;
    });

    it("Base contract should not be initialized", async function () {
      const { arbitrableEscrowUpgradeable, funderAccount, payeeAccount } = await loadFixture(deployEscrowFixture);

      await expect(arbitrableEscrowUpgradeable.initialize(payeeAccount.address, funderAccount.address)).to.be.reverted;
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

      const onlyFunderEscrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", onlyFunderEvent?.escrow);
      await expect(onlyFunderEscrow.payees(0)).to.be.reverted;

      const { eventResult: onlyPayeeEvent } = await createPayeeEscrow(false);

      const onlyPayeeEscrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", onlyPayeeEvent?.escrow);
      await expect(onlyPayeeEscrow.funders(0)).to.be.reverted;
    });

    it("Should set correct roles when cloning escrow (w/ payee preset)", async function () {
      const { eventResult, arbitrableEscrowFactoryUpgradeable, funderAccount, payeeAccount } = await createPayeeEscrow(true);

      const escrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", eventResult?.escrow);

      const adminRole = await escrow.DEFAULT_ADMIN_ROLE();
      expect(await escrow.hasRole(adminRole, arbitrableEscrowFactoryUpgradeable.address)).to.be.true;

      const factoryRole = await escrow.FACTORY_ROLE();
      expect(await escrow.hasRole(factoryRole, arbitrableEscrowFactoryUpgradeable.address)).to.be.true;

      const funderRole = await escrow.FUNDER_ROLE();
      expect(await escrow.hasRole(funderRole, funderAccount.address)).to.be.true;

      const payeeRole = await escrow.PAYEE_ROLE();
      expect(await escrow.hasRole(payeeRole, payeeAccount.address)).to.be.true;
    });

    it("Should set correct roles when cloning escrow (w/ funder preset)", async function () {
      const { eventResult, arbitrableEscrowFactoryUpgradeable, funderAccount, payeeAccount } = await createFunderEscrow(true);

      const escrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", eventResult?.escrow);

      const adminRole = await escrow.DEFAULT_ADMIN_ROLE();
      expect(await escrow.hasRole(adminRole, arbitrableEscrowFactoryUpgradeable.address)).to.be.true;

      const factoryRole = await escrow.FACTORY_ROLE();
      expect(await escrow.hasRole(factoryRole, arbitrableEscrowFactoryUpgradeable.address)).to.be.true;

      const funderRole = await escrow.FUNDER_ROLE();
      expect(await escrow.hasRole(funderRole, funderAccount.address)).to.be.true;

      const payeeRole = await escrow.PAYEE_ROLE();
      expect(await escrow.hasRole(payeeRole, payeeAccount.address)).to.be.true;
    });
  });

  describe("Registeration", function () {
    it("Should set correct roles when registering as funder/payee", async function () {
      // Funder creates.
      const { eventResult: funderWithoutPayeeEventResult, otherAccount1, otherAccount2 } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", funderWithoutPayeeEventResult?.escrow);

      // then another funder registers.
      await escrow.connect(otherAccount1).registerAsFunder();
      const funderRole = await escrow.FUNDER_ROLE();
      expect(await escrow.hasRole(funderRole, otherAccount1.address)).to.be.true;

      // then another payee registers.
      await escrow.connect(otherAccount2).registerAsPayee();
      const payeeRole = await escrow.PAYEE_ROLE();
      expect(await escrow.hasRole(payeeRole, otherAccount2.address)).to.be.true;
    });

    it("Should not be able to register both funder and payee (as funder)", async function () {
      // Funder creates.
      const { eventResult, funderAccount } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", eventResult?.escrow);

      // then trying to be a payee.
      await expect(escrow.connect(funderAccount).registerAsPayee()).to.be.revertedWith("RoleBasedEscrow: funder cannot be a payee");
    });

    it("Should not be able to register both funder and payee (as payee)", async function () {
      // Payee creates.
      const { eventResult, payeeAccount } = await createPayeeEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", eventResult?.escrow);

      // then trying to be a funder.
      await expect(escrow.connect(payeeAccount).registerAsFunder()).to.be.revertedWith("RoleBasedEscrow: payee cannot be a funder");
    });

    it("Should not be able to register twice for the funder role", async function () {
      // Funder creates.
      const { eventResult, funderAccount } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", eventResult?.escrow);

      // then trying to be a funder again.
      await expect(escrow.connect(funderAccount).registerAsFunder()).to.be.revertedWith("RoleBasedEscrow: cannot register twice as funder");
    });

    it("Should not be able to register twice for the payee role", async function () {
      // Payee creates.
      const { eventResult, payeeAccount } = await createPayeeEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", eventResult?.escrow);

      // then trying to be a payee again.
      await expect(escrow.connect(payeeAccount).registerAsPayee()).to.be.revertedWith("RoleBasedEscrow: cannot register twice as payee");
    });

    it("Should emit FunderRegistered event when registering as funder", async function () {
      const { eventResult, funderAccount } = await createPayeeEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", eventResult?.escrow);

      await expect(escrow.connect(funderAccount).registerAsFunder()).to.emit(escrow, "FunderRegistered").withArgs(funderAccount.address);
    });

    it("Should emit events when registering as payee", async function () {
      const { eventResult, payeeAccount } = await createFunderEscrow(false);

      const escrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", eventResult?.escrow);

      await expect(escrow.connect(payeeAccount).registerAsPayee()).to.emit(escrow, "PayeeRegistered").withArgs(payeeAccount.address);
    });
  });
  //   describe("Withdrawals", function () {
  //     describe("Validations", function () {
  //       it("Should revert with the right error if called too soon", async function () {
  //         const { lock } = await loadFixture(deployOneYearLockFixture);

  //         await expect(lock.withdraw()).to.be.revertedWith("You can't withdraw yet");
  //       });

  //       it("Should revert with the right error if called from another account", async function () {
  //         const { lock, unlockTime, otherAccount } = await loadFixture(deployOneYearLockFixture);

  //         // We can increase the time in Hardhat Network
  //         await time.increaseTo(unlockTime);

  //         // We use lock.connect() to send a transaction from another account
  //         await expect(lock.connect(otherAccount).withdraw()).to.be.revertedWith("You aren't the owner");
  //       });

  //       it("Shouldn't fail if the unlockTime has arrived and the owner calls it", async function () {
  //         const { lock, unlockTime } = await loadFixture(deployOneYearLockFixture);

  //         // Transactions are sent using the first signer by default
  //         await time.increaseTo(unlockTime);

  //         await expect(lock.withdraw()).not.to.be.reverted;
  //       });
  //     });

  //     describe("Events", function () {
  //       it("Should emit an event on withdrawals", async function () {
  //         const { lock, unlockTime, lockedAmount } = await loadFixture(deployOneYearLockFixture);

  //         await time.increaseTo(unlockTime);

  //         await expect(lock.withdraw()).to.emit(lock, "Withdrawal").withArgs(lockedAmount, anyValue); // We accept any value as `when` arg
  //       });
  //     });

  //     describe("Transfers", function () {
  //       it("Should transfer the funds to the owner", async function () {
  //         const { lock, unlockTime, lockedAmount, owner } = await loadFixture(deployOneYearLockFixture);

  //         await time.increaseTo(unlockTime);

  //         await expect(lock.withdraw()).to.changeEtherBalances([owner, lock], [lockedAmount, -lockedAmount]);
  //       });
  //     });
  //   });
});
