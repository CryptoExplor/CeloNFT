import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Configuration
const NFT_CONTRACT_ADDRESS = '0xe90EC6F3f5C15cC76861CA5d41CD879548208Eff';
const MIN_AIRDROP_AMOUNT = '0.005'; // Minimum CELO
const MAX_AIRDROP_AMOUNT = '0.015'; // Maximum CELO
const ABSOLUTE_MAX_AIRDROP = '0.033'; // Hard cap - no one can get more than this
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in ms
const MAX_CLAIMS_PER_HOUR = 3;
const LOW_BALANCE_THRESHOLD = '1.0'; // Alert when below 1 CELO

// ===== LUCKY TOKEN BONUSES =====
const LUCKY_NUMBERS = [
  77, 111, 222, 333, 444, 555, 666, 777, 888, 999,
  1111, 2222, 3333, 4444, 5555, 6666, 7777, 8888, 9999
];

const MILESTONE_TOKENS = [
  100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000
];

function isPalindrome(num) {
  const str = num.toString();
  return str.length > 1 && str === str.split('').reverse().join('');
}

function isSequential(num) {
  const str = num.toString();
  if (str.length < 3) return false;
  
  // Check ascending (123, 234, etc)
  let isAscending = true;
  for (let i = 1; i < str.length; i++) {
    if (parseInt(str[i]) !== parseInt(str[i-1]) + 1) {
      isAscending = false;
      break;
    }
  }
  
  // Check descending (321, 543, etc)
  let isDescending = true;
  for (let i = 1; i < str.length; i++) {
    if (parseInt(str[i]) !== parseInt(str[i-1]) - 1) {
      isDescending = false;
      break;
    }
  }
  
  return isAscending || isDescending;
}

function isRepeatingDigits(num) {
  const str = num.toString();
  if (str.length < 2) return false;
  
  const firstDigit = str[0];
  return str.split('').every(d => d === firstDigit);
}

function calculateLuckyBonus(tokenId) {
  let multiplier = 1;
  let bonusReasons = [];
  
  // Milestone tokens get massive bonus
  if (MILESTONE_TOKENS.includes(tokenId)) {
    multiplier = 1.4;
    bonusReasons.push(`🎯 MILESTONE #${tokenId}`);
    return { multiplier, bonusReasons };
  }
  
  // Lucky numbers get 3x
  if (LUCKY_NUMBERS.includes(tokenId)) {
    multiplier = 1.2;
    bonusReasons.push(`🍀 Lucky Number #${tokenId}`);
  }
  
  // Palindromes get 2x (e.g., 121, 1331, 45654)
  if (isPalindrome(tokenId)) {
    multiplier = Math.max(multiplier, 2);
    bonusReasons.push(`🔄 Palindrome #${tokenId}`);
  }
  
  // Sequential numbers get 2x (e.g., 123, 4567, 987)
  if (isSequential(tokenId)) {
    multiplier = Math.max(multiplier, 1.2);
    bonusReasons.push(`🔢 Sequential #${tokenId}`);
  }
  
  // All same digits get 4x (e.g., 1111, 5555)
  if (isRepeatingDigits(tokenId)) {
    multiplier = Math.max(multiplier, 1.5);
    bonusReasons.push(`🎰 All ${tokenId.toString()[0]}s!`);
  }
  
  return { multiplier, bonusReasons };
}

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

// Get rarity multiplier from NFT traits
async function getRarityMultiplier(tokenId) {
  try {
    const traits = await publicClient.readContract({
      address: NFT_CONTRACT_ADDRESS,
      abi: NFT_ABI,
      functionName: 'tokenTraits',
      args: [BigInt(tokenId)]
    });
    
    const rarity = Number(traits[1]);
    const rarityLabels = ['Common', 'Rare', 'Legendary', 'Mythic'];
    const multipliers = [1, 1.1, 1.25, 2]; // Based on rarity
    
    return {
      multiplier: multipliers[rarity] || 1,
      rarity: rarityLabels[rarity] || 'Unknown'
    };
  } catch (error) {
    console.error('Failed to get rarity:', error);
    return { multiplier: 1, rarity: 'Unknown' };
  }
}

// Generate random airdrop amount with lucky and rarity bonuses
function getRandomAirdropAmount(tokenId) {
  const min = parseFloat(MIN_AIRDROP_AMOUNT);
  const max = parseFloat(MAX_AIRDROP_AMOUNT);
  
  // Generate base random amount
  const random = Math.random() * (max - min) + min;
  const baseAmount = Math.round(random * 10000) / 10000;
  
  // Apply lucky bonus
  const { multiplier, bonusReasons } = calculateLuckyBonus(tokenId);
  const amountWithLucky = baseAmount * multiplier;
  
  return {
    baseAmount: baseAmount.toFixed(4),
    amountWithLucky,
    luckyMultiplier: multiplier,
    bonusReasons,
    isLucky: multiplier > 1
  };
}

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

// Send CELO airdrop with random amount, lucky bonuses, and rarity multiplier
async function sendAirdrop(recipientAddress, tokenId) {
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
    
    // Get lucky bonus
    const luckyBonus = getRandomAirdropAmount(tokenId);
    
    // Get rarity bonus
    const rarityBonus = await getRarityMultiplier(tokenId);
    
    // Calculate final amount with both bonuses
    const baseWithLucky = luckyBonus.amountWithLucky;
    let finalAmount = baseWithLucky * rarityBonus.multiplier;
    
    // HARD CAP: Ensure no one gets more than ABSOLUTE_MAX_AIRDROP
    const absoluteMax = parseFloat(ABSOLUTE_MAX_AIRDROP);
    if (finalAmount > absoluteMax) {
      console.log(`⚠️ Capping airdrop from ${finalAmount.toFixed(4)} to ${absoluteMax} CELO`);
      finalAmount = absoluteMax;
    }
    
    const finalAmountString = finalAmount.toFixed(4);
    const airdropAmount = parseEther(finalAmountString);
    
    // Build bonus message
    const bonusMessages = [];
    if (luckyBonus.isLucky) {
      bonusMessages.push(...luckyBonus.bonusReasons);
      bonusMessages.push(`${luckyBonus.luckyMultiplier}x Lucky Bonus`);
    }
    if (rarityBonus.multiplier > 1) {
      bonusMessages.push(`${rarityBonus.rarity} (${rarityBonus.multiplier}x Rarity)`);
    }
    
    console.log(`🎲 Airdrop calculation for Token #${tokenId}:
      Base Random: ${luckyBonus.baseAmount} CELO
      Lucky Bonus: ${luckyBonus.luckyMultiplier}x → ${luckyBonus.amountWithLucky.toFixed(4)} CELO
      Rarity: ${rarityBonus.rarity} (${rarityBonus.multiplier}x)
      Before Cap: ${(baseWithLucky * rarityBonus.multiplier).toFixed(4)} CELO
      Final Amount: ${finalAmountString} CELO (Max: ${ABSOLUTE_MAX_AIRDROP})
      Bonuses: ${bonusMessages.join(', ') || 'None'}
    `);
    
    // Check wallet balance
    const balance = await publicClient.getBalance({
      address: account.address
    });
    
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
      amount: finalAmountString,
      baseAmount: luckyBonus.baseAmount,
      luckyMultiplier: luckyBonus.luckyMultiplier,
      rarityMultiplier: rarityBonus.multiplier,
      rarity: rarityBonus.rarity,
      bonusMessages,
      walletBalance: Number(balance) / 1e18
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
    
    // Send airdrop with random amount, lucky bonuses, and rarity multiplier
    const result = await sendAirdrop(userAddress, tokenId);
    
    // Mark as processed
    markAsProcessed(mintTxHash, userAddress);
    
    // Log success with balance info
    console.log(`✅ Airdrop sent successfully:
      Token ID: ${tokenId}
      Recipient: ${userAddress}
      Base Amount: ${result.baseAmount} CELO
      Lucky Multiplier: ${result.luckyMultiplier}x
      Rarity Multiplier: ${result.rarityMultiplier}x (${result.rarity})
      Final Amount: ${result.amount} CELO
      Bonuses: ${result.bonusMessages.join(', ') || 'None'}
      Tx Hash: ${result.txHash}
      Wallet Balance Remaining: ${result.walletBalance.toFixed(4)} CELO
    `);
    
    return res.status(200).json({
      success: true,
      message: result.bonusMessages.length > 0 
        ? `💎 BONUS AIRDROP! ${result.amount} CELO sent! 🎉\n${result.bonusMessages.join(' • ')}`
        : `Airdrop of ${result.amount} CELO sent successfully! 🎁`,
      amount: result.amount,
      baseAmount: result.baseAmount,
      luckyMultiplier: result.luckyMultiplier,
      rarityMultiplier: result.rarityMultiplier,
      rarity: result.rarity,
      bonusMessages: result.bonusMessages,
      txHash: result.txHash,
      explorerUrl: `https://celoscan.io/tx/${result.txHash}`,
      isBonus: result.bonusMessages.length > 0
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
