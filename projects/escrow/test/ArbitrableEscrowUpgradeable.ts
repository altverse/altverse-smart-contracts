import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("ArbitrableEscrowUpgradeable", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function deployEscrowFixture() {
    // Contracts are deployed using the first signer/account by default
    const [founderAccount, payeeAccount] = await ethers.getSigners();

    const ArbitrableEscrowUpgradeable = await ethers.getContractFactory("ArbitrableEscrowUpgradeable");
    const arbitrableEscrowUpgradeable = await ArbitrableEscrowUpgradeable.deploy();

    await arbitrableEscrowUpgradeable.deployed();

    return { arbitrableEscrowUpgradeable, founderAccount, payeeAccount };
  }

  async function deployEscrowFactoryFixture(address: string) {
    // Contracts are deployed using the first signer/account by default
    const [founderAccount, payeeAccount] = await ethers.getSigners();

    const ArbitrableEscrowFactoryUpgradeable = await ethers.getContractFactory("ArbitrableEscrowFactoryUpgradeable");
    const arbitrableEscrowFactoryUpgradeable = await ArbitrableEscrowFactoryUpgradeable.deploy(address);

    await arbitrableEscrowFactoryUpgradeable.deployed();

    return { arbitrableEscrowFactoryUpgradeable, founderAccount, payeeAccount };
  }

  async function deployClonedEscrowFixture() {
    // Contracts are deployed using the first signer/account by default
    const { arbitrableEscrowUpgradeable } = await loadFixture(deployEscrowFixture);
    const { arbitrableEscrowFactoryUpgradeable, founderAccount, payeeAccount } = await loadFixture(() => deployEscrowFactoryFixture(arbitrableEscrowUpgradeable.address));

    const tx = await arbitrableEscrowFactoryUpgradeable.createEscrow(payeeAccount.address);
    const txReceipt = await tx.wait();
    const event = txReceipt.events?.find((x) => {
      return x.event == "EscrowCreated";
    });

    const eventResult = event?.args;

    return { arbitrableEscrowFactoryUpgradeable, tx, eventResult, founderAccount, payeeAccount };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { arbitrableEscrowUpgradeable, founderAccount } = await loadFixture(deployEscrowFixture);

      const adminRole = await arbitrableEscrowUpgradeable.DEFAULT_ADMIN_ROLE();
      expect(await arbitrableEscrowUpgradeable.hasRole(adminRole, founderAccount.address)).to.true;
    });

    it("Base contract should not be initialized", async function () {
      const { arbitrableEscrowUpgradeable, founderAccount, payeeAccount } = await loadFixture(deployEscrowFixture);

      expect(arbitrableEscrowUpgradeable.initialize(payeeAccount.address, founderAccount.address)).to.be.reverted;
    });

    it("Should be able to clone escrow via factory", async function () {
      const { tx } = await loadFixture(deployClonedEscrowFixture);

      expect(tx).not.to.be.reverted;
    });

    it("Should set correct roles when cloning escrow", async function () {
      const { arbitrableEscrowFactoryUpgradeable: factory, eventResult, founderAccount, payeeAccount } = await loadFixture(deployClonedEscrowFixture);

      const escrow = await ethers.getContractAt("ArbitrableEscrowUpgradeable", eventResult?.escrow);

      const adminRole = await escrow.DEFAULT_ADMIN_ROLE();
      expect(await escrow.hasRole(adminRole, factory.address)).to.be.true;

      const factoryRole = await escrow.FACTORY_ROLE();
      expect(await escrow.hasRole(factoryRole, factory.address)).to.be.true;

      const founderRole = await escrow.FOUNDER_ROLE();
      expect(await escrow.hasRole(founderRole, founderAccount.address)).to.be.true;

      const payeeRole = await escrow.PAYEE_ROLE();
      expect(await escrow.hasRole(payeeRole, payeeAccount.address)).to.be.true;
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
