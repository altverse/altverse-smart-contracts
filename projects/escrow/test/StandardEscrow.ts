import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers as eth } from "ethers";
import { ethers } from "hardhat";
import { ERC20FakeUSDToken, ERC20FakeUSDToken2, StandardEscrow__factory } from "../typechain-types";

type EscrowCreationParam = {
  title?: string;
  amount?: number;
  approve?: number;
  mint?: number;
}

type EscrowActivationParam = EscrowCreationParam;

type EscrowFinalizationParam = EscrowActivationParam & {
  auto: boolean;
}

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

  async function prepareEscrowCreation({ title = 'TestTitle', amount = 1000, approve, mint }: EscrowCreationParam) {
    const { standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 } = await loadFixture(deployEscrowFixture);
    const escrow = await ethers.getContractAt("StandardEscrow", standardEscrow.address);
    await fakeUSDToken.connect(funderAccount).approve(escrow.address, approve ?? amount);
    await fakeUSDToken.transfer(funderAccount.address, mint ?? amount);

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

  async function prepareEscrowActivation(params: EscrowActivationParam) {
    const { escrow, contractId, standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 } = await prepareEscrowCreation(params);
    const tx = await escrow.connect(payeeAccount).activateContract(contractId);
    await tx.wait();
    return { escrow, contractId, standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 };
  }

  async function prepareEscrowSettle(params: EscrowFinalizationParam) {
    const { escrow, contractId, standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 } = await prepareEscrowActivation(params);
    const tx = await escrow.connect(funderAccount).settle(contractId, params.auto);
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
      const { standardEscrow, funderAccount, payeeAccount, fakeUSDToken } = await loadFixture(deployEscrowFixture);
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
      expect(+target.initial).to.equal(targetAmount);
      expect(+target.determined).to.equal(0); // Note casting by +target.amount since it's a BigNumber, same for below lines
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

    it("should not allow a funder to assign the payee as the same address", async function () {
      const { funderAccount, fakeUSDToken, standardEscrow } = await loadFixture(deployEscrowFixture);
      const escrow = await ethers.getContractAt("StandardEscrow", standardEscrow.address);
      await fakeUSDToken.connect(funderAccount).approve(escrow.address, 1000);
      await fakeUSDToken.transfer(funderAccount.address, 1000);
      
      const amount = 1000;
      await expect(escrow.connect(funderAccount).createEscrow("StandardEscrow", funderAccount.address, fakeUSDToken.address, amount)).be.reverted;
    });
  });

  describe('activateContract', async function () {
    it('should not be reverted', async function () {
      const { escrow, contractId, payeeAccount } = await prepareEscrowCreation({});
      await expect(escrow.connect(payeeAccount).activateContract(contractId)).not.to.be.reverted;
    });

    it('should be activated', async function () {
      const { escrow, contractId } = await prepareEscrowActivation({});
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
      await expect(escrow.connect(funderAccount).withdraw(contractId, 1000), "withdrawal must be possible before activation").not.to.be.reverted;
      await expect(escrow.connect(payeeAccount).activateContract(contractId)).to.be.reverted;
    });

    it('should set determined as the value of balance just before activation', async function () {
      const { escrow, contractId, payeeAccount } = await prepareEscrowCreation({ amount: 1000 });

      const before = await escrow.getEscrow(contractId);
      const balanceBefore = before.balance;
      expect(before.determined).to.be.equal(0);
      expect(balanceBefore).to.be.equal(1000);
      await expect(escrow.connect(payeeAccount).activateContract(contractId)).not.to.be.reverted;

      const after = await escrow.getEscrow(contractId);
      expect(after.determined).to.be.equal(balanceBefore);
    })

    it("should not be activated if the balance of a contract is less than initial amount", async function () {
      const initial = 1000;
      const { escrow, contractId, funderAccount, payeeAccount, fakeUSDToken } = await prepareEscrowCreation({ amount: initial, approve: 2000, mint: 2000 }); 
      await expect(escrow.connect(funderAccount).withdraw(contractId, initial)).not.to.be.reverted;

      const amountLesserThanInitial = 500;
      await expect(escrow.connect(funderAccount).deposit(contractId, fakeUSDToken.address, amountLesserThanInitial)).not.to.be.reverted;
      const targetEscrow = await escrow.getEscrow(contractId);
      expect(targetEscrow.balance).to.be.equal(500);
      expect(targetEscrow.initial).to.be.equal(initial);

      await expect(escrow.connect(payeeAccount).activateContract(contractId)).to.be.reverted;
    });
  });

  describe('settle', async function () {
    describe('autowithdrawal=false', async function () {
      it('should not be reverted', async function () {
        const { escrow, funderAccount, contractId } = await prepareEscrowActivation({});
        await expect(escrow.connect(funderAccount).settle(contractId, false)).not.to.be.reverted;
      });

      it('should be finalized', async function () {
        const { escrow, contractId } = await prepareEscrowSettle({ auto: false });
        const targetEscrow = await escrow.getEscrow(contractId);
        expect(targetEscrow.state).to.be.equal(FINALIZED);
      });

      it('should not be finalized other than the funder of the escrow', async function () {
        const { escrow, funderAccount2: maliciousActor, contractId } = await prepareEscrowActivation({});
        await expect(escrow.connect(maliciousActor).settle(contractId, false)).to.be.reverted;
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
    });
    
    describe('autowithdrawal=true', async function () {
      it('should not be reverted', async function () {
        const { escrow, funderAccount, contractId } = await prepareEscrowActivation({});
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

  describe('deposit', function () {
    it("should deposit more balance after creation", async function () {
      const initial = 1000;
      const { escrow, contractId, funderAccount, fakeUSDToken } = await prepareEscrowCreation({ approve: 2000, mint: 2000, amount: initial });
      const before = await escrow.getEscrow(contractId);
      expect(before.balance).to.be.equal(initial);

      const more = 1000;
      await expect(escrow.connect(funderAccount).deposit(contractId, fakeUSDToken.address, more)).not.be.reverted;
      const after = await escrow.getEscrow(contractId);
      expect(after.balance).to.be.equal(initial + more);
    });

    it("should deposit more balance after activation", async function () {
      const initial = 1000;
      const { escrow, contractId, funderAccount, fakeUSDToken } = await prepareEscrowActivation({ approve: 2000, mint: 2000, amount: initial });
      const before = await escrow.getEscrow(contractId);
      expect(before.balance).to.be.equal(initial);
      expect(before.determined).to.be.equal(initial);

      const more = 1000;
      await expect(escrow.connect(funderAccount).deposit(contractId, fakeUSDToken.address, more)).not.be.reverted;
      const after = await escrow.getEscrow(contractId);
      expect(after.balance).to.be.equal(initial + more);
      expect(after.determined).to.be.equal(initial + more);
    });

    it("should be reverted if the funder does not match", async function () {
      const initial = 1000;
      const { escrow, contractId, funderAccount2, fakeUSDToken } = await prepareEscrowCreation({ approve: 2000, mint: 2000, amount: initial });
      const more = 1000;
      await expect(escrow.connect(funderAccount2).deposit(contractId, fakeUSDToken.address, more)).to.be.reverted;
    });

    it("should be reverted if the state is 'Finalized'", async function () {
      const { escrow, contractId, funderAccount, fakeUSDToken } = await prepareEscrowSettle({ auto: false });
      const more = 1000;
      await expect(escrow.connect(funderAccount).deposit(contractId, fakeUSDToken.address, more)).to.be.reverted;
    });

    it("should be reverted if the token does not match", async function () {
      const initial = 1000;
      const { escrow, contractId, funderAccount, fakeUSDToken2 } = await prepareEscrowCreation({ approve: 2000, mint: 2000, amount: initial });
      const more = 1000;
      await expect(escrow.connect(funderAccount).deposit(contractId, fakeUSDToken2.address, more)).to.be.reverted;
    });
  });

  describe('withdraw', function () {
    describe('full withdrawal', function () {
      it("should be possible for a funder to withdraw the deposit before activation", async function () {
        const amount = 1000;
        const { escrow, contractId, funderAccount, fakeUSDToken } = await prepareEscrowCreation({ amount });
        
        const balanceOfFunderAfterCreation = await fakeUSDToken.balanceOf(funderAccount.address);
        const balanceOfEscrowAfterCreation = await fakeUSDToken.balanceOf(escrow.address);
        const targetEscrowBeforeCreation = await escrow.getEscrow(contractId);
        expect(+balanceOfFunderAfterCreation).to.be.equal(0);
        expect(+balanceOfEscrowAfterCreation).to.be.equal(amount);
        expect(+targetEscrowBeforeCreation.balance).to.be.equal(amount);
  
        await expect(escrow.connect(funderAccount).withdraw(contractId, amount), "withdrawal must be possible before activation").not.to.be.reverted;
  
        const balanceOfFunderAfterWithdrawal = await fakeUSDToken.balanceOf(funderAccount.address);
        const balanceOfEscrowAfterWithdrawal = await fakeUSDToken.balanceOf(escrow.address);
        const targetEscrowBeforeWithdrawal = await escrow.getEscrow(contractId);
        expect(+balanceOfFunderAfterWithdrawal).to.be.equal(amount);
        expect(+balanceOfEscrowAfterWithdrawal).to.be.equal(0);
        expect(+targetEscrowBeforeWithdrawal.balance).to.be.equal(0);
      });

      it('should be possible for a payee to withdraw the deposit after finalization', async function () {
        const { escrow, contractId, fakeUSDToken, payeeAccount } = await prepareEscrowSettle({ auto: false });
        const targetEscrowBeforeWithdrawal = await escrow.getEscrow(contractId);
        const balanceOfEscrowBeforeWithdrawal = await fakeUSDToken.balanceOf(escrow.address);
        const balanceOfPayeeBeforeWithdrawal = await fakeUSDToken.balanceOf(payeeAccount.address);
        
        expect(+targetEscrowBeforeWithdrawal.balance, 'balance of the escrow should be still the same as the first place').to.be.equal(1000);
        expect(+balanceOfEscrowBeforeWithdrawal).to.be.equal(1000);
        expect(+targetEscrowBeforeWithdrawal.balance, `balance of the payee should be 0 since it is not transferred yet`).to.be.equal(1000);
        expect(+balanceOfPayeeBeforeWithdrawal).to.be.equal(0);

        await expect(escrow.connect(payeeAccount).withdraw(contractId, 1000)).not.be.reverted;
        const targetEscrowAfterWithdrawal = await escrow.getEscrow(contractId);
        const balanceOfEscrowAfterWithdrawal = await fakeUSDToken.balanceOf(escrow.address);
        const balanceOfPayeeAfterWithdrawal = await fakeUSDToken.balanceOf(payeeAccount.address);
        
        expect(+balanceOfEscrowAfterWithdrawal, 'balance of the escrow should be still the same as the first place').to.be.equal(0);
        expect(+balanceOfPayeeAfterWithdrawal, `balance of the payee should be 0 since it is not transferred yet`).to.be.equal(1000);
        expect(+targetEscrowAfterWithdrawal.balance).to.be.equal(0);
      });
    });

    describe('partial withdrawal', function () {
      it("should be possible for a funder to withdraw partially before activation", async function () {
        const amount = 1000;
        const { escrow, contractId, funderAccount, fakeUSDToken } = await prepareEscrowCreation({ amount });
        
        const balanceOfFunderAfterCreation = await fakeUSDToken.balanceOf(funderAccount.address);
        const balanceOfEscrowAfterCreation = await fakeUSDToken.balanceOf(escrow.address);
        const targetEscrowBeforeCreation = await escrow.getEscrow(contractId);
        expect(+balanceOfFunderAfterCreation).to.be.equal(0);
        expect(+balanceOfEscrowAfterCreation).to.be.equal(amount);
        expect(+targetEscrowBeforeCreation.balance).to.be.equal(amount);

        const paritalAmount = 1;
  
        await expect(escrow.connect(funderAccount).withdraw(contractId, paritalAmount), "partial withdrawal must be possible before activation").not.to.be.reverted;
  
        const balanceOfFunderAfterWithdrawal = await fakeUSDToken.balanceOf(funderAccount.address);
        const balanceOfEscrowAfterWithdrawal = await fakeUSDToken.balanceOf(escrow.address);
        const targetEscrowBeforeWithdrawal = await escrow.getEscrow(contractId);
        expect(+balanceOfFunderAfterWithdrawal).to.be.equal(paritalAmount);
        expect(+balanceOfEscrowAfterWithdrawal).to.be.equal(amount - paritalAmount);
        expect(+targetEscrowBeforeWithdrawal.balance).to.be.equal(amount - paritalAmount);
      });
      
      it('should be possible for a payee to withdraw partially the deposit after finalization', async function () {
        const amount = 1000;
        const { escrow, contractId, fakeUSDToken, payeeAccount } = await prepareEscrowSettle({ auto: false, amount });
        const targetEscrowBeforeWithdrawal = await escrow.getEscrow(contractId);
        const balanceOfEscrowBeforeWithdrawal = await fakeUSDToken.balanceOf(escrow.address);
        const balanceOfPayeeBeforeWithdrawal = await fakeUSDToken.balanceOf(payeeAccount.address);
        
        expect(+targetEscrowBeforeWithdrawal.balance, 'balance of the escrow should be still the same as the first place').to.be.equal(amount);
        expect(+balanceOfEscrowBeforeWithdrawal).to.be.equal(amount);
        expect(+targetEscrowBeforeWithdrawal.balance, `balance of the payee should be 0 since it is not transferred yet`).to.be.equal(amount);
        expect(+balanceOfPayeeBeforeWithdrawal).to.be.equal(0);

        const paritalAmount = 1;
        await expect(escrow.connect(payeeAccount).withdraw(contractId, paritalAmount)).not.be.reverted;
        const targetEscrowAfterWithdrawal = await escrow.getEscrow(contractId);
        const balanceOfEscrowAfterWithdrawal = await fakeUSDToken.balanceOf(escrow.address);
        const balanceOfPayeeAfterWithdrawal = await fakeUSDToken.balanceOf(payeeAccount.address);
        
        expect(+balanceOfEscrowAfterWithdrawal, 'balance of the escrow should be still the same as the first place').to.be.equal(amount - paritalAmount);
        expect(+balanceOfPayeeAfterWithdrawal, `balance of the payee should be 0 since it is not transferred yet`).to.be.equal(paritalAmount);
        expect(+targetEscrowAfterWithdrawal.balance).to.be.equal(amount - paritalAmount);
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

      const [escrowsOfPayee, t1] = await escrow.findEscrowsAsFunderByCursor(funderAccount.address, cursor, size);
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
      const [escrowsOfPayee2, t2] = await escrow.findEscrowsAsFunderByCursor(funderAccount.address, cursor, size);
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
      const [escrowsOfPayee3, t3] = await escrow.findEscrowsAsFunderByCursor(funderAccount.address, cursor, size);
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
      const [escrowsOfPayee4, t4] = await escrow.findEscrowsAsFunderByCursor(funderAccount.address, cursor, size);

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
      await expect(escrow.findEscrowsAsFunderByCursor(funderAccount.address, 1, 0)).to.be.reverted;
      // too big size
      await expect(escrow.findEscrowsAsFunderByCursor(funderAccount.address, 1, 101)).to.be.reverted;
      // wrong cursor
      // CHECK: it seems like minus value cannot be passed over
      // await expect(escrow.connect(funderAccount).findEscrowsAsFunderByCursor(-1, 101)).to.be.reverted;
    });

    it("should return an empty array when the cursor is out of range", async function () {
      const numberOfEscrows = 10;
      const { escrow, funderAccount } = await prepareMultipleEscrowCreation({ size: numberOfEscrows });
      // out of range
      const [result, total] = await escrow.findEscrowsAsFunderByCursor(funderAccount.address, 11, 10);
      expect(result.length).to.equal(0);
      expect(+total).to.be.equal(numberOfEscrows);
    });

    it("should return an empty array with size zero when a corresponding array does not exist for an account", async function () {
      const { escrow, funderAccount2: noInfoAccount } = await prepareMultipleEscrowCreation({ size: 1 });
      const [result, total] = await escrow.findEscrowsAsFunderByCursor(noInfoAccount.address, 0, 1);
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

      const [escrowsOfPayee, t1] = await escrow.findEscrowsAsPayeeByCursor(payeeAccount.address, cursor, size);
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
      const [escrowsOfPayee2, t2] = await escrow.findEscrowsAsPayeeByCursor(payeeAccount.address, cursor, size);
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
      const [escrowsOfPayee3, t3] = await escrow.findEscrowsAsPayeeByCursor(payeeAccount.address, cursor, size);
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
      const [escrowsOfPayee4, t4] = await escrow.findEscrowsAsPayeeByCursor(payeeAccount.address, cursor, size);

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
      await expect(escrow.findEscrowsAsPayeeByCursor(payeeAccount.address, 1, 0)).to.be.reverted;
      // too big size
      await expect(escrow.findEscrowsAsPayeeByCursor(payeeAccount.address, 1, 101)).to.be.reverted;
      // wrong cursor
      // CHECK: it seems like minus value cannot be passed over
      // await expect(escrow.connect(payeeAccount).findEscrowsAsPayeeByCursor(-1, 101)).to.be.reverted;
    });

    it("should return an empty array when the cursor is out of range", async function () {
      const numberOfEscrows = 10;
      const { escrow, payeeAccount } = await prepareMultipleEscrowCreation({ size: numberOfEscrows });
      // out of range
      const [result, total] = await escrow.findEscrowsAsPayeeByCursor(payeeAccount.address, 11, 10);
      expect(result.length).to.equal(0);
      expect(+total).to.be.equal(numberOfEscrows);
    });

    it("should return an empty array with size zero when a corresponding array does not exist for an account", async function () {
      const { escrow, payeeAccount2: noInfoAccount } = await prepareMultipleEscrowCreation({ size: 1 });
      const [result, total] = await escrow.findEscrowsAsPayeeByCursor(noInfoAccount.address, 0, 1);
      expect(result.length).to.equal(0);
      expect(+total).to.be.equal(0);
    });
  });

  describe('Event Emission', function () {
    describe('Deposited', function () {
      it("should emit when a contract is created", async function () {
        const { standardEscrow, factoryAccount, funderAccount, payeeAccount, funderAccount2, payeeAccount2, fakeUSDToken, fakeUSDToken2 } = await loadFixture(deployEscrowFixture);
        const escrow = await ethers.getContractAt("StandardEscrow", standardEscrow.address);
        await fakeUSDToken.connect(funderAccount).approve(escrow.address, 1000);
        await fakeUSDToken.transfer(funderAccount.address, 1000);
        await expect(escrow.connect(funderAccount).createEscrow("TEST_TITLE", payeeAccount.address, fakeUSDToken.address, 1000))
          .to.emit(escrow, "Deposited")
          .withArgs(1, funderAccount.address, fakeUSDToken.address, 1000);
      });

      it("should emit whenever a new deposit is made after creation", async function () {
        const { escrow, contractId, funderAccount, fakeUSDToken } = await prepareEscrowCreation({ approve: 2000, mint: 2000, amount: 1000 });
        await expect(escrow.connect(funderAccount).deposit(contractId, fakeUSDToken.address, 100))
          .to.emit(escrow, "Deposited")
          .withArgs(1, funderAccount.address, fakeUSDToken.address, 100);

        await expect(escrow.connect(funderAccount).deposit(contractId, fakeUSDToken.address, 200))
          .to.emit(escrow, "Deposited")
          .withArgs(1, funderAccount.address, fakeUSDToken.address, 200);

        await expect(escrow.connect(funderAccount).deposit(contractId, fakeUSDToken.address, 300))
          .to.emit(escrow, "Deposited")
          .withArgs(1, funderAccount.address, fakeUSDToken.address, 300)
      });

      it("should emit whenever a new deposit is made after activation", async function () {
        const { escrow, contractId, funderAccount, fakeUSDToken } = await prepareEscrowActivation({ approve: 2000, mint: 2000, amount: 1000 });
        await expect(escrow.connect(funderAccount).deposit(contractId, fakeUSDToken.address, 100))
          .to.emit(escrow, "Deposited")
          .withArgs(1, funderAccount.address, fakeUSDToken.address, 100);

        await expect(escrow.connect(funderAccount).deposit(contractId, fakeUSDToken.address, 200))
          .to.emit(escrow, "Deposited")
          .withArgs(1, funderAccount.address, fakeUSDToken.address, 200);

        await expect(escrow.connect(funderAccount).deposit(contractId, fakeUSDToken.address, 300))
          .to.emit(escrow, "Deposited")
          .withArgs(1, funderAccount.address, fakeUSDToken.address, 300)
      });
    });
    describe('Withdrawn', function () {
      it('should emit when a withdrawal by the funder is made after creation', async function () {
        const { escrow, contractId, funderAccount, fakeUSDToken } = await prepareEscrowCreation({ approve: 2000, mint: 2000, amount: 1000 });
        await expect(escrow.connect(funderAccount).withdraw(contractId, 1000))
          .to.emit(escrow, "Withdrawn")
          .withArgs(contractId, funderAccount.address, funderAccount.address, fakeUSDToken.address, 1000);
      });

      it('should emit when a withdrawal by the payee is made after finalized', async function () {
        const { escrow, contractId, payeeAccount, fakeUSDToken } = await prepareEscrowSettle({ approve: 2000, mint: 2000, amount: 1000, auto: false });
        await expect(escrow.connect(payeeAccount).withdraw(contractId, 1000))
          .to.emit(escrow, "Withdrawn")
          .withArgs(contractId, payeeAccount.address, payeeAccount.address, fakeUSDToken.address, 1000);
      });

      it('should emit when the contract is settled with autowithdraw=true by the funder', async function () {
        const { escrow, contractId, funderAccount, payeeAccount, fakeUSDToken } = await prepareEscrowActivation({});
        await expect(escrow.connect(funderAccount).settle(contractId, true))
          .to.emit(escrow, "Withdrawn")
          .withArgs(contractId, funderAccount.address, payeeAccount.address, fakeUSDToken.address, 1000);
      });
    });
    describe('ContractActivated', function () {
      it('should emit when the contract is activated', async function () {
        const { escrow, contractId, funderAccount, payeeAccount, fakeUSDToken } = await prepareEscrowCreation({});
        await expect(escrow.connect(payeeAccount).activateContract(contractId))
          .to.emit(escrow, "ContractActivated")
          .withArgs(contractId, payeeAccount.address);
      });
    });
    describe('ContractFinalized', function () {
      it('should emit when the contract is finalized', async function () {
        const { escrow, contractId, funderAccount } = await prepareEscrowActivation({});
        await expect(escrow.connect(funderAccount).settle(contractId, false))
          .to.emit(escrow, "ContractFinalized")
          .withArgs(contractId, funderAccount.address);
      });
    });
  });
});

function checkBlockTimestamp(timeToTest: number, begin: number, end: number, tolerance: number) {
  const mid = (begin + end) / 2;
  return mid - tolerance <= timeToTest && timeToTest <= mid + tolerance;
}