import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers as eth } from "ethers";
import { ethers } from "hardhat";
import { ERC20FakeUSDToken, ERC20FakeUSDToken2, StandardEscrow__factory } from "../typechain-types";

describe("StandardEscrow", function () {
  const INITIALIZED = 0;
  const ACTIVATED = 1;
  const FINALIZED = 2;

  async function deployEscrowFixture() {
    // Contracts are deployed using the first signer/account by default
    const [factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2] = await ethers.getSigners();

    const StandardEscrow = await ethers.getContractFactory("StandardEscrow");
    const standardEscrow = await StandardEscrow.deploy();
    await standardEscrow.deployed();

    const FakeUSDToken = await ethers.getContractFactory("ERC20FakeUSDToken");
    const fakeUSDToken = await FakeUSDToken.deploy();

    await fakeUSDToken.deployed();

    const FakeUSDToken2 = await ethers.getContractFactory("ERC20FakeUSDToken2");
    const fakeUSDToken2 = await FakeUSDToken2.deploy();

    await fakeUSDToken2.deployed();

    return { standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 };
  }

  async function prepareEscrowCreation({ title = 'TestTitle', amount = 1000 }: { title?: string, amount?: number }) {
    const { standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 } = await loadFixture(deployEscrowFixture);
    const escrow = await ethers.getContractAt("StandardEscrow", standardEscrow.address);
    await fakeUSDToken.connect(funderAccount).approve(escrow.address, amount);
    await fakeUSDToken.transfer(funderAccount.address, amount);

    const tx = await escrow.connect(funderAccount).createEscrow(title, payeeAccount.address, fakeUSDToken.address, amount);
    const txReceipt = await tx.wait();

    const event = txReceipt.events?.find((x) => {
      return x.event == "Deposited";
    });
    const contractId = event?.args?.contractId;

    return { escrow, contractId, standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 };
  }

  async function prepareMultipleEscrowCreation({ title = 'TestTitle', amount = 1000, size = 5 }: { title?: string, amount?: number, size?: number }) {
    const { standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 } = await loadFixture(deployEscrowFixture);
    const escrow = await ethers.getContractAt("StandardEscrow", standardEscrow.address);
    
    await fakeUSDToken.connect(funderAccount).approve(escrow.address, amount * size);
    await fakeUSDToken.transfer(funderAccount.address, amount * size);

    let i = 0;
    const iterCount = Array(size).fill(size);
    const contractIds = [];
    for await (const _ of iterCount) {
      const tx = await escrow.connect(funderAccount).createEscrow(`${title}-${i++}`, payeeAccount.address, fakeUSDToken.address, amount);
      const txReceipt = await tx.wait();
  
      const event = txReceipt.events?.find((x) => {
        return x.event == "Deposited";
      });
      const contractId = event?.args?.contractId;
      contractIds.push(contractId);
    }

    return { escrow, contractIds, standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 };
  }

  async function prepareEscrowActivation() {
    const { escrow, contractId, standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 } = await prepareEscrowCreation({});
    const tx = await escrow.connect(payeeAccount).activateContract(contractId);
    await tx.wait();
    return { escrow, contractId, standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 };
  }

  async function prepareEscrowSettle({ auto }: { auto: boolean }) {
    const { escrow, contractId, standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 } = await prepareEscrowActivation();
    const tx = await escrow.connect(funderAccount).settle(contractId, auto);
    await tx.wait();
    return { escrow, contractId, standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 };
  }

  it("Deployed", async function () {
    const { standardEscrow } = await loadFixture(deployEscrowFixture);
    
    const escrow = await ethers.getContractAt("StandardEscrow", standardEscrow.address);
    expect(escrow).be;
  });

  describe('createEscrow', async function () {
    it("should create a escrow properly", async function () {
      const { standardEscrow, factoryAccount, funderAccount, payeeAccount, fakeUSDToken, fakeUSDToken2 } = await loadFixture(deployEscrowFixture);
      const escrow = await ethers.getContractAt("StandardEscrow", standardEscrow.address);
      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 1000);
      await fakeUSDToken.transfer(funderAccount.address, 1000);
      
      expect(escrow.connect(funderAccount).createEscrow("StandardEscrow", payeeAccount.address, fakeUSDToken.address, 1000)).not.to.be.reverted;
    });

    it('should create a escrow properly with proper data populated in it', async function () {
      const { standardEscrow, funderAccount, payeeAccount, fakeUSDToken } = await loadFixture(deployEscrowFixture);
      const escrow = await ethers.getContractAt("StandardEscrow", standardEscrow.address);

      const targetAmount = 1000;
      await fakeUSDToken.connect(funderAccount).approve(escrow.address, targetAmount);
      await fakeUSDToken.transfer(funderAccount.address, targetAmount);
      
      const title = "Millionaire"
      // Don't know why but block.timestamp indicate the time in the future.
      // const timedJustBeforeCreation = Date.now();

      const tx = await escrow.connect(funderAccount).createEscrow(title, payeeAccount.address, fakeUSDToken.address, targetAmount);
      const txReceipt = await tx.wait();

      const event = txReceipt.events?.find((x) => {
        return x.event == "Deposited";
      });
      const contractId = event?.args?.contractId;
      
      expect(contractId).be;
      const target = await escrow.getEscrow(contractId);
      
      expect(target).be;
      expect(target.state).to.equal(INITIALIZED);
      expect(target.title).to.equal(title);
      expect(target.token).to.equal(fakeUSDToken.address);
      expect(target.funder).to.equal(funderAccount.address);
      expect(target.payee).to.equal(payeeAccount.address);
      expect(+target.amount).to.equal(targetAmount); // Note casting by +target.amount since it's a BigNumber, same for below lines
      // Don't know why but block.timestamp indicate the time in the future.
      // expect(checkBlockTimestamp(+target.createdAt * 1000, timedJustBeforeCreation, Date.now(), 10000)).be.true; 
      expect(+target.balance).to.equal(targetAmount);
    });

    it("should not be created if the amount is equal to zero", async function () {
      const { funderAccount, payeeAccount, fakeUSDToken, standardEscrow } = await loadFixture(deployEscrowFixture);
      const escrow = await ethers.getContractAt("StandardEscrow", standardEscrow.address);
      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 1000);
      await fakeUSDToken.transfer(funderAccount.address, 1000);
      
      const amount = 0; // NOTE HERE!
      await expect(escrow.connect(funderAccount).createEscrow("StandardEscrow", payeeAccount.address, fakeUSDToken.address, amount)).be.reverted;
    });

    it("should be possible for a funder to withdraw the deposit before activation", async function () {
      const amount = 1000;
      const { escrow, contractId, funderAccount, fakeUSDToken } = await prepareEscrowCreation({ amount });
      
      const balanceOfFunderAfterCreation = await fakeUSDToken.balanceOf(funderAccount.address);
      const balanceOfEscrowAfterCreation = await fakeUSDToken.balanceOf(escrow.address);
      const targetEscrowBeforeCreation = await escrow.getEscrow(contractId);
      expect(+balanceOfFunderAfterCreation).to.be.equal(0);
      expect(+balanceOfEscrowAfterCreation).to.be.equal(amount);
      expect(+targetEscrowBeforeCreation.balance).to.be.equal(amount);

      await expect(escrow.connect(funderAccount).withdraw(contractId), "withdrawl must be possible before activation").not.to.be.reverted;

      const balanceOfFunderAfterWithdrawl = await fakeUSDToken.balanceOf(funderAccount.address);
      const balanceOfEscrowAfterWithdrawl = await fakeUSDToken.balanceOf(escrow.address);
      const targetEscrowBeforeWithdrawl = await escrow.getEscrow(contractId);
      expect(+balanceOfFunderAfterWithdrawl).to.be.equal(amount);
      expect(+balanceOfEscrowAfterWithdrawl).to.be.equal(0);
      expect(+targetEscrowBeforeWithdrawl.balance).to.be.equal(0);
    });
  });

  describe('activateContract', async function () {
    it('should not be reverted', async function () {
      const { escrow, contractId, payeeAccount } = await prepareEscrowCreation({});
      await expect(escrow.connect(payeeAccount).activateContract(contractId)).not.to.be.reverted;
    });

    it('should be activated', async function () {
      const { escrow, contractId } = await prepareEscrowActivation();
      const targetContract = await escrow.getEscrow(contractId);
      expect(targetContract.state).to.be.equal(ACTIVATED);
    })

    it('must not be activated by any other account except for the payee', async function () {
      // Note that the `prepareEscrowActivation` assumes the escrow is for payeeAccount not payeeAccount2
      const { escrow, contractId, payeeAccount2 } = await prepareEscrowCreation({});
      await expect(escrow.connect(payeeAccount2).activateContract(contractId)).to.be.reverted;
    });

    it("should not be activated if the balance of a contract is equal to zero", async function () {
      const { escrow, contractId, funderAccount, payeeAccount } = await prepareEscrowCreation({ amount: 1000 });
      await expect(escrow.connect(funderAccount).withdraw(contractId), "withdrawl must be possible before activation").not.to.be.reverted;
      await expect(escrow.connect(payeeAccount).activateContract(contractId)).to.be.reverted;
    });
  });

  describe('settle', async function () {
    describe('autowithdrawl=false', async function () {
      it('should not be reverted', async function () {
        const { escrow, funderAccount, contractId } = await prepareEscrowActivation();
        await expect(escrow.connect(funderAccount).settle(contractId, false)).not.to.be.reverted;
      });

      it('should be finalized', async function () {
        const { escrow, contractId } = await prepareEscrowSettle({ auto: false });
        const targetEscrow = await escrow.getEscrow(contractId);
        expect(targetEscrow.state).to.be.equal(FINALIZED);
      });

      it('should not transfer the funded tokens to payee yet', async function () {
        const { escrow, contractId, fakeUSDToken, payeeAccount } = await prepareEscrowSettle({ auto: false });
        const targetEscrow = await escrow.getEscrow(contractId);
        const balanceOfEscrow = await fakeUSDToken.balanceOf(escrow.address);
        
        expect(+balanceOfEscrow, 'balance of the escrow should be the same as the first place').to.be.equal(1000);
        const balanceOfPayee = await fakeUSDToken.balanceOf(payeeAccount.address);
        expect(+balanceOfPayee, `balance of the payee should be 0 since it is not transferred yet`).to.be.equal(0);
        expect(targetEscrow.balance).to.be.equal(1000);
      });

      it('should be possible for a payee to withdraw the deposit after finalization', async function () {
        const { escrow, contractId, fakeUSDToken, payeeAccount } = await prepareEscrowSettle({ auto: false });
        const targetEscrowBeforeWithdrawl = await escrow.getEscrow(contractId);
        const balanceOfEscrowBeforeWithdrawl = await fakeUSDToken.balanceOf(escrow.address);
        const balanceOfPayeeBeforeWithdrawl = await fakeUSDToken.balanceOf(payeeAccount.address);
        
        expect(+balanceOfEscrowBeforeWithdrawl, 'balance of the escrow should be still the same as the first place').to.be.equal(1000);
        expect(+balanceOfPayeeBeforeWithdrawl, `balance of the payee should be 0 since it is not transferred yet`).to.be.equal(0);
        expect(+targetEscrowBeforeWithdrawl.balance).to.be.equal(1000);

        await expect(escrow.connect(payeeAccount).withdraw(contractId)).not.be.reverted;
        const targetEscrowAfterWithdrawl = await escrow.getEscrow(contractId);
        const balanceOfEscrowAfterWithdrawl = await fakeUSDToken.balanceOf(escrow.address);
        const balanceOfPayeeAfterWithdrawl = await fakeUSDToken.balanceOf(payeeAccount.address);
        
        expect(+balanceOfEscrowAfterWithdrawl, 'balance of the escrow should be still the same as the first place').to.be.equal(0);
        expect(+balanceOfPayeeAfterWithdrawl, `balance of the payee should be 0 since it is not transferred yet`).to.be.equal(1000);
        expect(+targetEscrowAfterWithdrawl.balance).to.be.equal(0);
      });
    });
    
    describe('autowithdrawl=true', async function () {
      it('should not be reverted', async function () {
        const { escrow, funderAccount, contractId } = await prepareEscrowActivation();
        await expect(escrow.connect(funderAccount).settle(contractId, true)).not.to.be.reverted;
      });

      it('should be finalized', async function () {
        const { escrow, contractId } = await prepareEscrowSettle({ auto: true });
        const targetEscrow = await escrow.getEscrow(contractId);
        expect(targetEscrow.state).to.be.equal(FINALIZED);
      });

      it('should transfer the funded tokens to the payee', async function () {
        const { escrow, contractId, fakeUSDToken, payeeAccount } = await prepareEscrowSettle({ auto: true });
        const targetEscrow = await escrow.getEscrow(contractId);
        const balanceOfEscrow = await fakeUSDToken.balanceOf(escrow.address);
        expect(+balanceOfEscrow, 'the balance of the escrow should be 0 since it is transferred to the payee').to.be.equal(0);

        const balanceOfPayee = await fakeUSDToken.balanceOf(payeeAccount.address);
        expect(+balanceOfPayee, `the balance of the payee should be the 1000 since it is transferred`).to.be.equal(1000);

        expect(+targetEscrow.balance).to.be.equal(0);
      });
    });
  });


  describe('findEscrowsAsFunder', async function () {
    it("should find escrows of a payee with given pagination", async function () {
      const numOfEscrows = 10;
      
      const titlePrefix = "Paginated"
      const { escrow, funderAccount } = await prepareMultipleEscrowCreation({ title: titlePrefix, size: numOfEscrows });

      // first page
      let page = 1;
      let size = 3;
      let cursor = (page - 1) * size;

      const [escrowsOfPayee, t1] = await escrow.connect(funderAccount).findEscrowsAsFunderByCursor(cursor, size);
      expect(escrowsOfPayee).to.be.lengthOf(size);
      expect(+t1).to.be.equal(numOfEscrows); // Note that coercion by +t1, since `t1` is ethers.BigNumber. below are same.

      for (let i = 0; i < size; i++) {
        const targetEscrow = escrowsOfPayee[i];
        expect(targetEscrow).be;
        expect(targetEscrow.title).to.equal(`${titlePrefix}-${numOfEscrows - 1 - cursor - i}`);
      }

      // second page
      page = 2;
      size = 3;
      cursor = (page - 1) * size;
      const [escrowsOfPayee2, t2] = await escrow.connect(funderAccount).findEscrowsAsFunderByCursor(cursor, size);
      expect(escrowsOfPayee2).to.be.lengthOf(size);
      expect(+t2).to.be.equal(numOfEscrows);

      for (let i = 0; i < size; i++) {
        const targetEscrow = escrowsOfPayee2[i];
        expect(targetEscrow).be;
        expect(targetEscrow.title).to.equal(`${titlePrefix}-${numOfEscrows - 1 - cursor - i}`);
      }

      // third page
      page = 3;
      size = 3;
      cursor = (page - 1) * size;
      const [escrowsOfPayee3, t3] = await escrow.connect(funderAccount).findEscrowsAsFunderByCursor(cursor, size);
      expect(escrowsOfPayee3).to.be.lengthOf(size);
      expect(+t3).to.be.equal(numOfEscrows);

      for (let i = 0; i < size; i++) {
        const targetEscrow = escrowsOfPayee3[i];
        expect(targetEscrow).be;
        expect(targetEscrow.title).to.equal(`${titlePrefix}-${numOfEscrows - 1 - cursor - i}`);
      }

      // last page
      page = 4;
      size = 3;
      cursor = (page - 1) * size;
      const [escrowsOfPayee4, t4] = await escrow.connect(funderAccount).findEscrowsAsFunderByCursor(cursor, size);

      expect(escrowsOfPayee4).to.be.lengthOf(numOfEscrows % size); // NOTE that last item should be equal to modulo by 3
      expect(+t4).to.be.equal(numOfEscrows);

      for (let i = 0; i < numOfEscrows % size; i++) {
        const targetEscrow = escrowsOfPayee4[i];
        expect(targetEscrow).be;
        expect(targetEscrow.title).to.equal(`${titlePrefix}-${numOfEscrows - 1 - cursor - i}`);
      }
    });

    it("should be reverted when the arguments are not properly configured", async function () {
      const { escrow, funderAccount } = await prepareMultipleEscrowCreation({ size: 10 });
      // wrong size
      await expect(escrow.connect(funderAccount).findEscrowsAsFunderByCursor(1, 0)).to.be.reverted;
      // too big size
      await expect(escrow.connect(funderAccount).findEscrowsAsFunderByCursor(1, 101)).to.be.reverted;
      // wrong cursor
      // CHECK: it seems like minus value cannot be passed over
      // await expect(escrow.connect(funderAccount).findEscrowsAsFunderByCursor(-1, 101)).to.be.reverted;
    });

    it("should return an empty array when the cursor is out of range", async function () {
      const numberOfEscrows = 10;
      const { escrow, funderAccount } = await prepareMultipleEscrowCreation({ size: numberOfEscrows });
      // out of range
      const [result, total] = await escrow.connect(funderAccount).findEscrowsAsFunderByCursor(11, 10);
      expect(result.length).to.equal(0);
      expect(+total).to.be.equal(numberOfEscrows);
    });

    it("should return an empty array with size zero when a corresponding array does not exist for an account", async function () {
      const { escrow, funderAccount2: noInfoAccount } = await prepareMultipleEscrowCreation({ size: 1 });
      const [result, total] = await escrow.connect(noInfoAccount).findEscrowsAsFunderByCursor(0, 1);
      expect(result.length).to.equal(0);
      expect(+total).to.be.equal(0);
    });
  });

  describe('findEscrowsAsPayee', function () {
    it("should find escrows of a payee with given pagination", async function () {
      const numOfEscrows = 10;
      
      const titlePrefix = "Paginated"
      const { escrow, payeeAccount } = await prepareMultipleEscrowCreation({ title: titlePrefix, size: numOfEscrows });

      // first page
      let page = 1;
      let size = 3;
      let cursor = (page - 1) * size;

      const [escrowsOfPayee, t1] = await escrow.connect(payeeAccount).findEscrowsAsPayeeByCursor(cursor, size);
      expect(escrowsOfPayee).to.be.lengthOf(size);
      expect(+t1).to.be.equal(numOfEscrows);
      
      for (let i = 0; i < size; i++) {
        const targetEscrow = escrowsOfPayee[i];
        expect(targetEscrow).be;
        expect(targetEscrow.title).to.equal(`${titlePrefix}-${numOfEscrows - 1 - cursor - i}`);
      }

      // second page
      page = 2;
      size = 3;
      cursor = (page - 1) * size;
      const [escrowsOfPayee2, t2] = await escrow.connect(payeeAccount).findEscrowsAsPayeeByCursor(cursor, size);
      expect(escrowsOfPayee2).to.be.lengthOf(size);
      expect(+t2).to.be.equal(numOfEscrows);
      
      for (let i = 0; i < size; i++) {
        const targetEscrow = escrowsOfPayee2[i];
        expect(targetEscrow).be;
        expect(targetEscrow.title).to.equal(`${titlePrefix}-${numOfEscrows - 1 - cursor - i}`);
      }

      // third page
      page = 3;
      size = 3;
      cursor = (page - 1) * size;
      const [escrowsOfPayee3, t3] = await escrow.connect(payeeAccount).findEscrowsAsPayeeByCursor(cursor, size);
      expect(escrowsOfPayee3).to.be.lengthOf(size);
      expect(+t3).to.be.equal(numOfEscrows);
      
      for (let i = 0; i < size; i++) {
        const targetEscrow = escrowsOfPayee3[i];
        expect(targetEscrow).be;
        expect(targetEscrow.title).to.equal(`${titlePrefix}-${numOfEscrows - 1 - cursor - i}`);
      }

      // last page
      page = 4;
      size = 3;
      cursor = (page - 1) * size;
      const [escrowsOfPayee4, t4] = await escrow.connect(payeeAccount).findEscrowsAsPayeeByCursor(cursor, size);

      expect(escrowsOfPayee4).to.be.lengthOf(numOfEscrows % size); // NOTE that last item should be equal to modulo by 3
      expect(+t4).to.be.equal(numOfEscrows);

      for (let i = 0; i < numOfEscrows % size; i++) {
        const targetEscrow = escrowsOfPayee4[i];
        expect(targetEscrow).be;
        expect(targetEscrow.title).to.equal(`${titlePrefix}-${numOfEscrows - 1 - cursor - i}`);
      }
    });

    it("should be reverted when the arguments are not properly configured", async function () {
      const { escrow, payeeAccount } = await prepareMultipleEscrowCreation({ size: 10 });
      // wrong size
      await expect(escrow.connect(payeeAccount).findEscrowsAsPayeeByCursor(1, 0)).to.be.reverted;
      // too big size
      await expect(escrow.connect(payeeAccount).findEscrowsAsPayeeByCursor(1, 101)).to.be.reverted;
      // wrong cursor
      // CHECK: it seems like minus value cannot be passed over
      // await expect(escrow.connect(payeeAccount).findEscrowsAsPayeeByCursor(-1, 101)).to.be.reverted;
    });

    it("should return an empty array when the cursor is out of range", async function () {
      const numberOfEscrows = 10;
      const { escrow, payeeAccount } = await prepareMultipleEscrowCreation({ size: numberOfEscrows });
      // out of range
      const [result, total] = await escrow.connect(payeeAccount).findEscrowsAsPayeeByCursor(11, 10);
      expect(result.length).to.equal(0);
      expect(+total).to.be.equal(numberOfEscrows);
    });

    it("should return an empty array with size zero when a corresponding array does not exist for an account", async function () {
      const { escrow, payeeAccount2: noInfoAccount } = await prepareMultipleEscrowCreation({ size: 1 });
      const [result, total] = await escrow.connect(noInfoAccount).findEscrowsAsPayeeByCursor(0, 1);
      expect(result.length).to.equal(0);
      expect(+total).to.be.equal(0);
    });
  });
});

function checkBlockTimestamp(timeToTest: number, begin: number, end: number, tolerance: number) {
  const mid = (begin + end) / 2;
  return mid - tolerance <= timeToTest && timeToTest <= mid + tolerance;
}