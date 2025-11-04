import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Configuration
const NFT_CONTRACT_ADDRESS = '0xe90EC6F3f5C15cC76861CA5d41CD879548208Eff';
const AIRDROP_AMOUNT = '0.01'; // CELO
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in ms
const MAX_CLAIMS_PER_HOUR = 3;
const LOW_BALANCE_THRESHOLD = '1.0'; // Alert when below 1 CELO

// In-memory storage (use Redis/Database in production)
const claimHistory = new Map();
const processedTxs = new Set();

// Initialize clients
const publicClient = createPublicClient({
  chain: celo,
  transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org')
});

// NFT Contract ABI (minimal for verification)
const NFT_ABI = [
  {
    name: 'ownerOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }]
  },
  {
    name: 'tokenTraits',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'priceSnapshot', type: 'uint128' },
      { name: 'rarity', type: 'uint8' },
      { name: 'mintedAt', type: 'uint40' }
    ]
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'owner', type: 'address' },
      { indexed: true, name: 'tokenId', type: 'uint256' },
      { indexed: false, name: 'rarity', type: 'uint8' },
      { indexed: false, name: 'priceSnapshot', type: 'uint128' }
    ],
    name: 'Minted',
    type: 'event'
  }
];

// Security: Verify user owns the NFT
async function verifyNFTOwnership(tokenId, userAddress) {
  try {
    const owner = await publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)]
    });
    
    return owner.toLowerCase() === userAddress.toLowerCase();
  } catch (error) {
    console.error('Ownership verification failed:', error);
    return false;
  }
}

// Security: Verify NFT was recently minted (within last 10 minutes)
async function verifyRecentMint(tokenId) {
  try {
    const traits = await publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'tokenTraits',
      args: [BigInt(tokenId)]
    });
    
    const mintedAt = Number(traits[2]); // mintedAt timestamp
    const now = Math.floor(Date.now() / 1000);
    const tenMinutes = 600;
    
    return (now - mintedAt) <= tenMinutes;
  } catch (error) {
    console.error('Mint time verification failed:', error);
    return false;
  }
}

// Security: Rate limiting
function checkRateLimit(address) {
  const now = Date.now();
  const userClaims = claimHistory.get(address) || [];
  
  // Remove old claims outside the time window
  const recentClaims = userClaims.filter(
    timestamp => now - timestamp < RATE_LIMIT_WINDOW
  );
  
  if (recentClaims.length >= MAX_CLAIMS_PER_HOUR) {
    return {
      allowed: false,
      remainingTime: Math.ceil((recentClaims[0] + RATE_LIMIT_WINDOW - now) / 60000)
    };
  }
  
  return { allowed: true };
}

// Security: Prevent duplicate claims for same transaction
function isDuplicateClaim(txHash) {
  return processedTxs.has(txHash);
}

// Mark transaction as processed
function markAsProcessed(txHash, address) {
  processedTxs.add(txHash);
  const userClaims = claimHistory.get(address) || [];
  userClaims.push(Date.now());
  claimHistory.set(address, userClaims);
  
  // Cleanup old data (keep last 24 hours only)
  if (processedTxs.size > 10000) {
    processedTxs.clear();
  }
}

// Send CELO airdrop
async function sendAirdrop(recipientAddress) {
  try {
    // Initialize wallet from private key (stored in env)
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
    
    // Check wallet balance
    const balance = await publicClient.getBalance({
      address: account.address
    });
    
    const airdropAmount = parseEther(AIRDROP_AMOUNT);
    const lowBalanceThreshold = parseEther(LOW_BALANCE_THRESHOLD);
    
    // ⭐ LOW BALANCE ALERT
    if (balance < lowBalanceThreshold) {
      const balanceInCelo = Number(balance) / 1e18;
      console.error(`
⚠️⚠️⚠️ CRITICAL: AIRDROP WALLET LOW BALANCE ⚠️⚠️⚠️
Current Balance: ${balanceInCelo.toFixed(4)} CELO
Threshold: ${LOW_BALANCE_THRESHOLD} CELO
Wallet Address: ${account.address}
⚠️⚠️⚠️ PLEASE REFILL IMMEDIATELY ⚠️⚠️⚠️
      `);
      
      // TODO: Add your preferred alert method here:
      // - Send Discord webhook
      // - Send email via SendGrid/Resend
      // - Send Telegram message
      // - Trigger PagerDuty alert
      
      // Example Discord webhook (uncomment and add your webhook URL):
      /*
      try {
        await fetch(process.env.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: `🚨 **AIRDROP WALLET LOW BALANCE** 🚨\n\nCurrent: ${balanceInCelo.toFixed(4)} CELO\nWallet: ${account.address}\n\n**ACTION REQUIRED: Refill wallet immediately!**`
          })
        });
      } catch (e) {
        console.error('Failed to send Discord alert:', e);
      }
      */
    }
    
    if (balance < airdropAmount) {
      throw new Error('Insufficient airdrop wallet balance');
    }
    
    // Send transaction
    const hash = await walletClient.sendTransaction({
      to: recipientAddress,
      value: airdropAmount,
      gas: 21000n
    });
    
    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    
    return {
      success: receipt.status === 'success',
      txHash: hash,
      amount: AIRDROP_AMOUNT,
      walletBalance: Number(balance) / 1e18 // Return balance for logging
    };
  } catch (error) {
    console.error('Airdrop send failed:', error);
    throw error;
  }
}

// Main handler
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { tokenId, userAddress, mintTxHash } = req.body;
    
    // Validation
    if (!tokenId || !userAddress || !mintTxHash) {
      return res.status(400).json({
        error: 'Missing required fields: tokenId, userAddress, mintTxHash'
      });
    }
    
    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }
    
    // Check for duplicate claim
    if (isDuplicateClaim(mintTxHash)) {
      return res.status(400).json({
        error: 'Airdrop already claimed for this transaction'
      });
    }
    
    // Rate limiting
    const rateLimitCheck = checkRateLimit(userAddress);
    if (!rateLimitCheck.allowed) {
      return res.status(429).json({
        error: `Rate limit exceeded. Try again in ${rateLimitCheck.remainingTime} minutes`,
        retryAfter: rateLimitCheck.remainingTime * 60
      });
    }
    
    // Verify NFT ownership
    const ownsNFT = await verifyNFTOwnership(tokenId, userAddress);
    if (!ownsNFT) {
      return res.status(403).json({
        error: 'NFT ownership verification failed'
      });
    }
    
    // Verify recent mint (prevents claiming for old NFTs)
    const isRecentMint = await verifyRecentMint(tokenId);
    if (!isRecentMint) {
      return res.status(403).json({
        error: 'Airdrop only available for recent mints (within 10 minutes)'
      });
    }
    
    // Verify the mint transaction exists and is successful
    const mintReceipt = await publicClient.getTransactionReceipt({
      hash: mintTxHash
    });
    
    if (!mintReceipt || mintReceipt.status !== 'success') {
      return res.status(400).json({
        error: 'Invalid or failed mint transaction'
      });
    }
    
    // Send airdrop
    const result = await sendAirdrop(userAddress);
    
    // Mark as processed
    markAsProcessed(mintTxHash, userAddress);
    
    // Log success with balance info
    console.log(`✅ Airdrop sent successfully:
      Token ID: ${tokenId}
      Recipient: ${userAddress}
      Amount: ${result.amount} CELO
      Tx Hash: ${result.txHash}
      Wallet Balance Remaining: ${result.walletBalance.toFixed(4)} CELO
    `);
    
    return res.status(200).json({
      success: true,
      message: `Airdrop of ${result.amount} CELO sent successfully!`,
      txHash: result.txHash,
      explorerUrl: `https://celoscan.io/tx/${result.txHash}`
    });
    
  } catch (error) {
    console.error('Airdrop handler error:', error);
    
    return res.status(500).json({
      error: 'Airdrop failed',
      message: error.message
    });
  }
}

// Cleanup function (run periodically)
export function cleanup() {
  const now = Date.now();
  const oneDayAgo = now - 86400000;
  
  // Clean old claim history
  for (const [address, claims] of claimHistory.entries()) {
    const recentClaims = claims.filter(timestamp => timestamp > oneDayAgo);
    if (recentClaims.length === 0) {
      claimHistory.delete(address);
    } else {
      claimHistory.set(address, recentClaims);
    }
  }
}
