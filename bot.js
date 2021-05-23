const ethers = require('ethers');
const fetch = require('node-fetch'); 

const config = require('./config.js'); 
const ABI = require('./ABI.js'); 

const provider = new ethers.providers.WebSocketProvider(config.RPC); 
const wallet = new ethers.Wallet(config.privateKey); 
const account = wallet.connect(provider);
const factory = new ethers.Contract(config.factory, ABI.factory, account);
const router = new ethers.Contract(config.router, ABI.router, account);
const locker = new ethers.Contract(config.locker, ABI.locker, account); 
const myContract = new ethers.Contract(config.myContract, ABI.myContract, account); 

const addBurned = ethers.utils.parseUnits('0', 'ether');
const addAge = ethers.utils.parseUnits('0', 'ether');
const ageThreshold = 1; 
const addTxAmount = ethers.utils.parseUnits('0.1', 'ether');
const addHoneypot = ethers.utils.parseUnits('0', 'ether');

const addLPLocked = ethers.utils.parseUnits('0', 'ether');
const txWaitMultiplier = ethers.BigNumber.from('2');

const shouldSell = true; 
const sellTimeInMs = 60000 * 5; 

// async function test() {
  
//   const token = '0x326960089C48437791F92c8f5967b8365b41A270'; 
//   // const token = '0x70c7a0e5e0d3f21c3ffac6c172d365603a11985d';
//   // const token = '0xa3cF06801ed05Dbd09267C38Ac58de590635e1F6'; 
//   const blacklistOrNonVerified = await isBlacklistedOrNonVerified(token); 

//   console.log(blacklistOrNonVerified);

//   // const burned = await isBurned(token); 
//   // const contractAge = await getContractAge(token); 
//   // const maxTxAmount = await getMaxTxAmount(token); 
//   // const honeyPot = await isHoneypot(token); 

//   // let tradeAmount = ethers.BigNumber.from('0'); 

//   // console.log(`token: ${token}
//   // burned: ${burned} contractAge: ${contractAge}  maxTxAmount: ${maxTxAmount} honeyPot: ${honeyPot}
//   // `);

// }

// test(); 

let intervals = {}; 

locker.on('onDeposit', async (lpToken, user, amount, lockDate, unlockDate) => {
  const pair = new ethers.Contract(lpToken, ABI.pair, account); 
  const token0 = await pair.token0(); 
  const token1 = await pair.token1(); 

  const token = getTargetToken(token0, token1); 
  
  if (token == null) {
    return; 
  }

  console.log('lp tokens locked: ' + token); 

  if (addLPLocked.lte(ethers.BigNumber.from('0')))
    return;

  makeTrade(token, addLPLocked);
});

factory.on('PairCreated', async (token0, token1, pairAddress) => {

  let tradeAmount = ethers.BigNumber.from('0'); 

  const token = getTargetToken(token0, token1); 
  
  if (token == null) {
    console.log('not a weth pool'); 
    return; 
  }

  const burned = await isBurned(token); 
  const contractAge = await getContractAge(token); 
  const maxTxAmount = await getMaxTxAmount(token); 
  const honeyPot = await isHoneypot(token); 
  const blacklistOrNonVerified = await isBlacklistedOrNonVerified(token); 

  console.log(`token: ${token} pairAddress: ${pairAddress} 
  burned: ${burned} contractAge: ${contractAge}  maxTxAmount: ${maxTxAmount} honeyPot: ${honeyPot} blacklist: ${blacklistOrNonVerified}
  `);

  if (burned) {
    tradeAmount = tradeAmount.add(addBurned); 
  }
  if (contractAge > ageThreshold) {
    tradeAmount = tradeAmount.add(addAge);
  }
  if (!honeyPot) {
    tradeAmount = tradeAmount.add(addHoneypot); 
  }
  if (maxTxAmount != null) {
    tradeAmount = tradeAmount.add(addTxAmount); 
  }

  if (blacklistOrNonVerified)
    return; 

  if (maxTxAmount == null && honeyPot)
    return; 

  if (tradeAmount.lte(ethers.BigNumber.from('0')))
    return; 

  console.log('amountIn: ' + tradeAmount.toString()); 

  if (maxTxAmount != null && maxTxAmount.lte(ethers.BigNumber.from('0'))) {
    console.log('maxTxAmount is set to 0. New amountIn ' + tradeAmount.mul(txWaitMultiplier));
    intervals[token] = setInterval(waitForTxAmount, 5000, token, tradeAmount.mul(txWaitMultiplier)); 
    return; 
  }

  makeTrade(token, tradeAmount); 
  
});

async function isBlacklistedOrNonVerified(token) {
  try {
    const contractData =  await fetch('https://api.etherscan.io/api?module=contract&action=getabi&address=' + token + '&apikey=' + config.apiKey, {method: 'get'})
    .then(res => res.json()); 
    return contractData.result.includes('blacklist'); 
  }
  catch (err) {
    console.log("There was an issue with getting contract data " + err); 
    return true; 
  }
}

async function waitForTxAmount(token, tradeAmount) {
  const maxTxAmount = await getMaxTxAmount(token); 
  if (maxTxAmount.lte(ethers.BigNumber.from('0')))
    return; 
  clearInterval(intervals[token]); 
  makeTrade(token, tradeAmount); 
}

async function makeTrade(token, tradeAmount) {

  const canTrade = enoughWeth(tradeAmount); 
  if (!canTrade) {
    console.log('not enough weth');
    return;
  }

  try {
    console.log('making purchase');
    await trade(config.WETH, token, tradeAmount);
    const amountInWei = await approve(token);
    if (shouldSell) {
      setTimeout(trade, sellTimeInMs, token, config.WETH, amountInWei)
    }  
    console.log('done');
  }
  catch {
    console.log("Something went wrong"); 
  }
}

async function enoughWeth(amount) {
  try {
    const erc20 = new ethers.Contract(config.WETH, ABI.WETH, account); 
    const myBalance = await erc20.balanceOf(config.userAddress);
    if (myBalance.lt(amount))
      return false; 
    return true; 
  }
  catch {
    return false; 
  }
}

async function isHoneypot(token) {
  try {
    const tx = await myContract.populateTransaction.check(token);
    await provider.estimateGas(tx);
    return false; 
  }
  catch {
    return true; 
  }
}

async function getMaxTxAmount(token) {
  const erc20 = new ethers.Contract(token, ABI.erc20, account);
  try {
    const maxTxAmount = await erc20.callStatic._maxTxAmount(); 
    return maxTxAmount; 
  }
  catch {
    return null; 
  }
}

async function getContractAge(token) {
  try {
    const txData =  await fetch('https://api.etherscan.io/api?module=account&action=txlist&address=' + token + '&startblock=0&endblock=99999999&sort=asc&apikey=' + config.apiKey, {method: 'get'})
    .then(res => res.json()); 
    if (txData.status != '1')
      throw new Error;
    const timeStamp = parseInt(txData.result[0].timeStamp); 
    return (Date.now()/1000 - timeStamp) / (60*60*24)
  }
  catch (err) {
    console.log("There was an issue with getting contract creation time " + err); 
    return 0; 
  }
}

async function trade(tokenIn, tokenOut, amount) {
  try {
    const amounts = await router.getAmountsOut(amount, [tokenIn, tokenOut]);
    const amountOutMin = amounts[1].sub(amounts[1].div(5));

    const price = parseInt(await getGasPrice('fastest')) + 30; 
    const gasPrice = ethers.utils.parseUnits(price.toString(), 'gwei'); 

    const tx = await router.swapExactTokensForTokens(
      amount,
      amountOutMin,
      [tokenIn, tokenOut],
      config.userAddress,
      Date.now() + 1000 * 60 * 10,
      {gasPrice , gasLimit: 400000}
    );
    await tx.wait();
    console.log("trade successful"); 
  }
  catch (err) {
    console.log("there was some error in the trade function " + err);
    throw new Error; 
  }
}

async function approve(token) {
  try {
    const erc20 = new ethers.Contract(token,ABI.erc20,account);
    const amount = await erc20.balanceOf(config.userAddress);
    const gasPrice = ethers.utils.parseUnits(await getGasPrice('fast'), 'gwei'); 
    const tx = await erc20.approve(config.router, amount, {gasPrice, gasLimit: 200000}); 
    await tx.wait(); 
    console.log("approval successful");
    return amount; 
  }
  catch (err) {
    console.log("there was some error in the approval function " + err);
    throw new Error; 
  }
}

async function isBurned(token) {
  try {
    const erc20 = new ethers.Contract(token, ABI.erc20, account); 
    const balance = await erc20.balanceOf('0x000000000000000000000000000000000000dead');
    if (balance.gt(ethers.BigNumber.from('0'))) 
      return true;  
  }
  catch (err) {
    console.log("there was an error in getting balance of burned address " + err);
  }
  return false; 
}

async function getGasPrice(speed) {
  if (speed != 'standard' && speed != 'fast' && speed != 'fastest')
      throw new Error("InvalidArgumentException"); 
  return await fetch('https://www.etherchain.org/api/gasPriceOracle', {method: 'get'})
  .then(res => res.json())
  .then(json => json[speed].toString());
}

function getTargetToken(token0, token1) {
  if(token0 == config.WETH) {
    return token1; 
  }
  if(token1 == config.WETH) {
    return token0; 
  }
}