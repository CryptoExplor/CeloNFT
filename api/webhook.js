/**
 * Alternative Event-Based Airdrop System
 * 
 * This webhook can be called by:
 * 1. Blockchain indexers (Goldsky, The Graph)
 * 2. Alchemy/Infura webhooks
 * 3. Cron job that polls for new mint events
 * 
 * More reliable than user-triggered claims as it monitors blockchain directly
 */

import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const NFT_CONTRACT_ADDRESS = '0xe90EC6F3f5C15cC76861CA5d41CD879548208Eff';
const MIN_AIRDROP_AMOUNT = '0.005'; // Minimum CELO
const MAX_AIRDROP_AMOUNT = '0.015'; // Maximum CELO

// Track processed mints (use database in production)
const processedMints = new Set();

const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org')
});

// Mint event ABI
const MINT_EVENT_ABI = {
  anonymous: false,
  inputs: [
    { indexed: true, name: 'owner', type: 'address' },
    { indexed: true, name: 'tokenId', type: 'uint256' },
    { indexed: false, name: 'rarity', type: 'uint8' },
    { indexed: false, name: 'priceSnapshot', type: 'uint128' }
  ],
  name: 'Minted',
  type: 'event'
};

// Generate random airdrop amount between MIN and MAX
function getRandomAirdropAmount() {
  const min = parseFloat(MIN_AIRDROP_AMOUNT);
  const max = parseFloat(MAX_AIRDROP_AMOUNT);
  
  // Generate random number between min and max with 4 decimal precision
  const random = Math.random() * (max - min) + min;
  const rounded = Math.round(random * 10000) / 10000; // Round to 4 decimals
  
  return rounded.toFixed(4); // Return as string with 4 decimals
}

async function sendAirdrop(recipientAddress, tokenId) {
  try {
    const privateKey = process.env.AIRDROP_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('Airdrop wallet not configured');
    }
    
    const account = privateKeyToAccount(privateKey);
    
    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org')
    });
    
    // Generate random airdrop amount
    const randomAmount = getRandomAirdropAmount();
    const airdropAmount = parseEther(randomAmount);
    
    console.log(`🎲 Random airdrop amount for Token #${tokenId}: ${randomAmount} CELO`);
    
    // Check balance
    const balance = await publicClient.getBalance({
      address: account.address
    });
    
    if (balance < airdropAmount) {
      console.error('Insufficient balance in airdrop wallet');
      return { success: false, error: 'Insufficient balance' };
    }
    
    // Send transaction
    const hash = await walletClient.sendTransaction({
      to: recipientAddress,
      value: airdropAmount,
      gas: 21000n
    });
    
    console.log(`Airdrop sent to ${recipientAddress} for token #${tokenId}: ${randomAmount} CELO - ${hash}`);
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    return {
      success: receipt.status === 'success',
      txHash: hash,
      amount: randomAmount,
      recipient: recipientAddress,
      tokenId
    };
  } catch (error) {
    console.error('Airdrop send failed:', error);
    return { success: false, error: error.message };
  }
}

// Webhook handler - receives mint events
export default async function handler(req, res) {
  // Security: Verify webhook signature (if using service like Alchemy)
  const signature = req.headers['x-webhook-signature'];
  if (process.env.WEBHOOK_SECRET && signature) {
    // Verify signature here
    // const isValid = verifySignature(req.body, signature, process.env.WEBHOOK_SECRET);
    // if (!isValid) return res.status(401).json({ error: 'Invalid signature' });
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { event, log, transaction } = req.body;
    
    // Parse mint event data
    let minterAddress, tokenId;
    
    if (event && event.args) {
      // Standardized format
      minterAddress = event.args.owner;
      tokenId = event.args.tokenId;
    } else if (log && log.topics) {
      // Raw log format
      minterAddress = '0x' + log.topics[1].slice(-40);
      tokenId = BigInt(log.topics[2]).toString();
    } else {
      return res.status(400).json({ error: 'Invalid event format' });
    }
    
    // Prevent duplicate processing
    const mintKey = `${tokenId}-${minterAddress}`;
    if (processedMints.has(mintKey)) {
      return res.status(200).json({ 
        message: 'Already processed',
        duplicate: true 
      });
    }
    
    // Send airdrop with random amount
    const result = await sendAirdrop(minterAddress, tokenId);
    
    if (result.success) {
      processedMints.add(mintKey);
      
      return res.status(200).json({
        success: true,
        message: 'Airdrop sent successfully',
        txHash: result.txHash,
        recipient: minterAddress,
        tokenId,
        amount: result.amount,
        randomAmount: true
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error,
        recipient: minterAddress,
        tokenId
      });
    }
    
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

/**
 * CRON JOB VERSION
 * 
 * Alternative: Run this as a scheduled job (every 1 minute)
 * Add to vercel.json:
 * 
 * {
 *   "crons": [{
 *     "path": "/api/poll-mints",
 *     "schedule": "* * * * *"
 *   }]
 * }
 */

let lastProcessedBlock = null;

export async function pollForMints(req, res) {
  try {
    const latestBlock = await publicClient.getBlockNumber();
    const fromBlock = lastProcessedBlock || latestBlock - 100n;
    
    // Get mint events from contract
    const logs = await publicClient.getLogs({
      address: NFT_CONTRACT_ADDRESS,
      event: MINT_EVENT_ABI,
      fromBlock,
      toBlock: latestBlock
    });
    
    const results = [];
    
    for (const log of logs) {
      const { owner, tokenId } = log.args;
      const mintKey = `${tokenId}-${owner}`;
      
      if (!processedMints.has(mintKey)) {
        const result = await sendAirdrop(owner, tokenId.toString());
        
        if (result.success) {
          processedMints.add(mintKey);
          results.push({
            tokenId: tokenId.toString(),
            recipient: owner,
            txHash: result.txHash,
            amount: result.amount,
            status: 'sent'
          });
        } else {
          results.push({
            tokenId: tokenId.toString(),
            recipient: owner,
            error: result.error,
            status: 'failed'
          });
        }
        
        // Rate limit: wait 100ms between sends
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    lastProcessedBlock = latestBlock;
    
    return res.status(200).json({
      success: true,
      processed: results.length,
      fromBlock: fromBlock.toString(),
      toBlock: latestBlock.toString(),
      results
    });
    
  } catch (error) {
    console.error('Poll mints error:', error);
    return res.status(500).json({
      error: 'Failed to poll for mints',
      message: error.message
    });
  }
}
