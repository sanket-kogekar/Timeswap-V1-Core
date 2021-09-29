import { ethers } from 'hardhat'
import { advanceTimeAndBlock, getBlock } from './Helper'
import { Pair, pairInit } from './Pair'
import { PairSim } from './PairSim'
import { testTokenNew } from './TestToken'
import { LendParams, BorrowParams, MintParams, BurnParams, WithdrawParams, PayParams } from '../testCases'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import LendMath from '../libraries/LendMath'
import BorrowMath from '../libraries/BorrowMath'
import MintMath from '../libraries/MintMath'
import { FEE, PROTOCOL_FEE } from './Constants'
import { now } from '../shared/Helper'
import type { TimeswapFactory as Factory } from '../../typechain/TimeswapFactory'

import type { TestToken } from '../../typechain/TestToken'
import { BigNumber } from '@ethersproject/bignumber'


export async function constructorFixture(
  assetValue: bigint,
  collateralValue: bigint,
  maturity: bigint
): Promise<Fixture> {
  const signers = await ethers.getSigners();
  let av = BigNumber.from(assetValue);
  let cv = BigNumber.from(collateralValue);
  av = av.mul(4);
  cv = cv.mul(4);
  const assetToken = await testTokenNew('Ether', 'WETH', BigInt(av.toString()))
  const collateralToken = await testTokenNew('Matic', 'MATIC', BigInt(cv.toString()))

  const pair = await pairInit(assetToken, collateralToken, maturity)
  const factory = pair.factoryContract
  const factoryAddress =  factory.address
  
  const owner = await factory.owner()

  // call the approve function in the test Tokens
  // for (let i=1;i<6;i++) {
  //   await assetToken.transfer(signers[i].address,5000n);
  //   await collateralToken.transfer(signers[i].address,10000n);
    
  //   await assetToken.connect(signers[i]).approve(pair.pairContractCallee.address, 5000n);
  //   await collateralToken.connect(signers[i]).approve(pair.pairContractCallee.address, 10000n);
  // }

  await assetToken.approve(pair.pairContractCallee.address, assetValue);
  await collateralToken.approve(pair.pairContractCallee.address, collateralValue);
  
  const pairSim = new PairSim(assetToken.address,collateralToken.address,FEE,PROTOCOL_FEE,pair.pairContract.address,factoryAddress,owner)
  
  return { pair, pairSim, assetToken, collateralToken }
}

export async function mintFixture(
  fixture: Fixture,
  signer: SignerWithAddress,
  mintParams: MintParams
): Promise<Fixture> {
  const { pair, pairSim, assetToken, collateralToken } = fixture
  //TODO: to remove the console logs
  // console.log("signer.address", signer.address);
  // console.log("pair.pairContract.address", pair.pairContract.address);
  // console.log("pair.pairContractCallee.address", pair.pairContractCallee.address);
  console.log("MINTPARAMS", mintParams);
  
  // console.log("1: Initial balance of signer of assetToken", (await assetToken.balanceOf(signer.address)).toString());
  // console.log("2: Initial balance of signer of collateralToken", (await collateralToken.balanceOf(signer.address)).toString());

  // console.log("3: Initial balance of CalleeContract of assetToken", (await assetToken.balanceOf(pair.pairContractCallee.address)).toString());
  // console.log("4: Initial balance of CalleeContract of collateralToken", (await collateralToken.balanceOf(pair.pairContractCallee.address)).toString());

  await assetToken.connect(signer).transfer(pair.pairContractCallee.address, mintParams.assetIn)
  await collateralToken.connect(signer).transfer(pair.pairContractCallee.address, mintParams.collateralIn)

  // console.log("5: AfterTransfer balance of CalleeContract of assetToken", (await assetToken.balanceOf(pair.pairContractCallee.address)).toString());
  // console.log("6: AfterTransfer balance of CalleeContract of collateralToken", (await collateralToken.balanceOf(pair.pairContractCallee.address)).toString());
  
  const txn = await pair.upgrade(signer).mint(mintParams.assetIn, mintParams.interestIncrease, mintParams.cdpIncrease)

  // console.log("7: After Tx balance of signer for assetToken", (await assetToken.balanceOf(signer.address)).toString());
  // console.log("8: After Tx balance of signer for collateral", (await collateralToken.balanceOf(signer.address)).toString());

  // console.log("9: After Tx balance of CalleeContract for assetToken", (await assetToken.balanceOf(pair.pairContractCallee.address)).toString());
  // console.log("10: After Tx balance of CalleeContract for collateralToken", (await collateralToken.balanceOf(pair.pairContractCallee.address)).toString());

  console.log("11: After Tx balance of PairContract for assetToken", (await assetToken.balanceOf(pair.pairContract.address)).toString());
  console.log("12: After Tx balance of PairContract for collateralToken", (await collateralToken.balanceOf(pair.pairContract.address)).toString());
  
  const block = await getBlock(txn.blockHash!)
  pairSim.mint(pair.maturity,signer.address,signer.address,BigInt(mintParams.assetIn), mintParams.interestIncrease, mintParams.cdpIncrease, block)

  return { pair, pairSim, assetToken, collateralToken }
}

export async function lendFixture(
  fixture: Fixture,
  signer: SignerWithAddress,
  lendParams: LendParams
): Promise<Fixture> {
  const { pair, pairSim, assetToken, collateralToken } = fixture

  await assetToken.connect(signer).transfer(pair.pairContractCallee.address, lendParams.assetIn)

  const pairContractState = await pair.state();
  const k_pairContract = (pairContractState.asset * pairContractState.interest * pairContractState.cdp) << 32n;
  const pairSimPool = pairSim.getPool(pair.maturity);
  const pairSimContractState = pairSimPool.state
  const k_pairSimContract = (pairSimContractState.asset * pairSimContractState.interest * pairSimContractState.cdp) << 32n
  if (k_pairContract == k_pairSimContract) {

    const feeBase = 0x10000n + FEE
    const interestAdjust = LendMath.adjust(lendParams.interestDecrease, pairSimContractState.interest, feeBase)
    const cdpAdjust = k_pairSimContract / ((pairSimContractState.asset + lendParams.assetIn) * interestAdjust)
    const cdpDecrease = LendMath.readjust(cdpAdjust, pairSimContractState.cdp, feeBase);
    const txn = await pair.upgrade(signer).lend(lendParams.assetIn, lendParams.interestDecrease, cdpDecrease);
    const block = await getBlock(txn.blockHash!)
    pairSim.lend(pair.maturity,signer.address,signer.address,lendParams.assetIn, lendParams.interestDecrease, cdpDecrease, block)
    //FIXME: the constant product after the lendtx is not matching;
    
    
    return { pair, pairSim, assetToken, collateralToken }
    
  } else {
    throw Error;
  }
  
}

export async function borrowFixture(
  fixture: Fixture,
  signer: SignerWithAddress,
  borrowParams: BorrowParams,
  owner= false
): Promise<Fixture> {
  const { pair, pairSim, assetToken, collateralToken } = fixture
  const pairContractState = await pair.state();
  let k_pairContract = (pairContractState.asset * pairContractState.interest * pairContractState.cdp) << 32n;
  const pairSimPool = pairSim.getPool(pair.maturity);
  const pairSimContractState = pairSimPool.state
  
  
  let k_pairSimContract = (pairSimContractState.asset * pairSimContractState.interest * pairSimContractState.cdp) << 32n
  if (k_pairContract == k_pairSimContract) {
    
    const feeBase = 0x10000n - FEE
    const interestAdjust = BorrowMath.adjust(borrowParams.interestIncrease, pairSimContractState.interest, feeBase)
    const cdpAdjust = k_pairSimContract / ((pairSimContractState.asset - borrowParams.assetOut) * interestAdjust)
    const cdpIncrease = BorrowMath.readjust(cdpAdjust, pairSimContractState.cdp, feeBase)
    const txn = await pair.upgrade(signer).borrow(borrowParams.assetOut, borrowParams.interestIncrease, cdpIncrease, owner)
    const block = await getBlock(txn.blockHash!)
    pairSim.borrow(pair.maturity,signer.address,signer.address,borrowParams.assetOut, borrowParams.interestIncrease, cdpIncrease, block)
    return { pair, pairSim, assetToken, collateralToken }
  } else {
    throw Error ("There is an error in the borrow fixture");
  }

}

export async function burnFixture(
  fixture: Fixture,
  signer: SignerWithAddress,
  burnParams: BurnParams
): Promise<Fixture> {
  const { pair, pairSim, assetToken, collateralToken } = fixture

  const txnBurn = await pair.upgrade(signer).burn(burnParams.liquidityIn)
  const block = await getBlock(txnBurn.blockHash!)
  pairSim.burn(pair.maturity,signer.address,signer.address,burnParams.liquidityIn,signer.address, block)

  return { pair, pairSim, assetToken, collateralToken }
}

export async function payFixture(
  fixture: Fixture,
  signer: SignerWithAddress,
  payParams: PayParams
): Promise<Fixture> {
  const { pair, pairSim, assetToken, collateralToken } = fixture
  const txn = await pair.upgrade(signer).pay(payParams.ids, payParams.debtIn, payParams.collateralOut);

  const block = await getBlock(txn.blockHash!)
  pairSim.pay(pair.maturity,signer.address,signer.address,payParams.ids, payParams.debtIn, payParams.collateralOut,signer.address, block)

  return { pair, pairSim, assetToken, collateralToken }
}

export async function withdrawFixture(
  fixture: Fixture,
  signer: SignerWithAddress,
  withdrawParams: WithdrawParams
): Promise<Fixture> {
  const { pair, pairSim, assetToken, collateralToken } = fixture

  const txnWithdraw = await pair
    .upgrade(signer)
    .withdraw(withdrawParams.claimsIn.bond, withdrawParams.claimsIn.insurance);

  const blockWithdraw = await getBlock(txnWithdraw.blockHash!)

  pairSim.withdraw(pair.maturity,signer.address,signer.address,withdrawParams.claimsIn,signer.address, blockWithdraw);

  return { pair, pairSim, assetToken, collateralToken }
}



export interface Fixture {
  pair: Pair
  pairSim: PairSim
  assetToken: TestToken
  collateralToken: TestToken
}

export default { constructorFixture, mintFixture}
