// Price Prediction Game API - FINAL PRODUCTION VERSION
// Fixes: UUID generation, cold starts, KV reliability, streak tracking

import { randomBytes } from 'crypto';

// CRITICAL: Force Node.js runtime (prevents UUID/crypto issues)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Safe ID generator (works in all Vercel environments)
function generateId() {
  return randomBytes(8).toString('hex'); // 16-char hex string
}

let kv;
let useKV = false;

// Initialize Vercel KV with fallback
try {
  const kvModule = await import('@vercel/kv');
  kv = kvModule.kv;
  useKV = true;
  console.log('✅ Vercel KV loaded successfully');
} catch (e) {
  console.warn('⚠️ KV not available, using memory fallback');
  useKV = false;
}

// In-memory fallbacks
const memoryStore = new Map();

// TTL constants
const PREDICTION_TTL = 300; // 5 minutes (enough time to verify)
const STATS_TTL = 2592000; // 30 days
const MAX_PREDICTIONS_PER_HOUR = 20;

// === RELIABLE STORAGE HELPERS ===

async function set(key, value, ttl = null) {
  const data = JSON.stringify(value);
  
  if (useKV) {
    try {
      const options = ttl ? { ex: ttl } : undefined;
      await kv.set(key, data, options);
      console.log(`✅ KV write: ${key}`);
      return true;
    } catch (e) {
      console.error(`❌ KV write failed (${key}):`, e.message);
      // Immediate fallback to memory
      memoryStore.set(key, {
        value,
        expires: ttl ? Date.now() + (ttl * 1000) : null
      });
      return false;
    }
  } else {
    // Memory-only mode
    memoryStore.set(key, {
      value,
      expires: ttl ? Date.now() + (ttl * 1000) : null
    });
    console.log(`📝 Memory write: ${key}`);
    return true;
  }
}

async function get(key) {
  if (useKV) {
    try {
      const raw = await kv.get(key);
      if (raw !== null) {
        console.log(`✅ KV read: ${key}`);
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
      console.log(`🔍 KV miss: ${key}`);
    } catch (e) {
      console.error(`❌ KV read failed (${key}):`, e.message);
    }
  }
  
  // Check memory fallback
  const item = memoryStore.get(key);
  if (item) {
    if (!item.expires || Date.now() < item.expires) {
      console.log(`📖 Memory hit: ${key}`);
      return item.value;
    } else {
      memoryStore.delete(key);
      console.log(`🗑️ Expired: ${key}`);
    }
  }
  
  return null;
}

async function del(key) {
  if (useKV) {
    try {
      await kv.del(key);
      console.log(`🗑️ KV delete: ${key}`);
    } catch (e) {
      console.error(`❌ KV delete failed:`, e.message);
    }
  }
  memoryStore.delete(key);
}

// === RATE LIMITING ===

async function checkRateLimit(userAddress) {
  const rateLimitKey = `ratelimit_${userAddress.toLowerCase()}`;
  const timestamps = await get(rateLimitKey) || [];
  
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  
  // Filter to last hour
  const recentPredictions = timestamps.filter(t => t > oneHourAgo);
  
  if (recentPredictions.length >= MAX_PREDICTIONS_PER_HOUR) {
    return false;
  }
  
  // Add current timestamp
  recentPredictions.push(now);
  await set(rateLimitKey, recentPredictions, 3600); // 1 hour TTL
  
  return true;
}

// === MAIN HANDLER ===

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // ===== STORE PREDICTION =====
    if (req.method === 'POST' && req.body.action === 'predict') {
      const { userAddress, currentPrice, prediction, timestamp } = req.body;
      
      // Validation
      if (!userAddress || !currentPrice || !prediction || !timestamp) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['userAddress', 'currentPrice', 'prediction', 'timestamp']
        });
      }
      
      const safeAddr = userAddress.toLowerCase();
      
      // Rate limiting
      const allowed = await checkRateLimit(safeAddr);
      if (!allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Maximum ${MAX_PREDICTIONS_PER_HOUR} predictions per hour`
        });
      }
      
      // Generate stable prediction ID
      const predictionId = generateId();
      const key = `pred_${safeAddr}_${predictionId}`;
      
      const data = {
        userAddress: safeAddr,
        currentPrice: parseFloat(currentPrice),
        prediction: prediction.toLowerCase(),
        timestamp: parseInt(timestamp),
        predictionId,
        expiresAt: parseInt(timestamp) + 60000, // 60 seconds from prediction time
        createdAt: Date.now()
      };
      
      console.log('\n📊 NEW PREDICTION');
      console.log(`User: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);
      console.log(`Price: $${currentPrice}`);
      console.log(`Direction: ${prediction.toUpperCase()}`);
      console.log(`ID: ${predictionId}`);
      console.log(`Key: ${key}`);
      
      // Store prediction
      const stored = await set(key, data, PREDICTION_TTL);
      
      return res.status(200).json({
        success: true,
        message: 'Prediction recorded',
        predictionId,
        expiresAt: data.expiresAt,
        storage: stored && useKV ? 'kv' : 'memory',
        debug: {
          key,
          ttl: PREDICTION_TTL
        }
      });
    }
    
    // ===== VERIFY PREDICTION =====
    if (req.method === 'POST' && req.body.action === 'verify') {
      const { userAddress, predictionId, newPrice } = req.body;
      
      // Validation
      if (!userAddress || !predictionId || !newPrice) {
        return res.status(400).json({
          error: 'Missing required fields',
          required: ['userAddress', 'predictionId', 'newPrice'],
          correct: false,
          multiplier: 0
        });
      }
      
      const key = `pred_${userAddress.toLowerCase()}_${predictionId}`;
      
      console.log('\n🔍 VERIFYING PREDICTION');
      console.log(`User: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);
      console.log(`ID: ${predictionId}`);
      console.log(`Key: ${key}`);
      
      // Retrieve prediction
      const prediction = await get(key);
      
      if (!prediction) {
        console.error(`❌ PREDICTION NOT FOUND: ${key}`);
        return res.status(404).json({
          error: 'Prediction not found or expired',
          correct: false,
          multiplier: 0,
          debug: {
            key,
            storage: useKV ? 'kv' : 'memory',
            ttl: PREDICTION_TTL
          }
        });
      }
      
      // Check expiration with grace period
      const gracePeriod = 10000; // 10 seconds grace
      if (Date.now() > prediction.expiresAt + gracePeriod) {
        console.warn(`⚠️ Prediction expired`);
        await del(key);
        return res.status(400).json({
          error: 'Prediction window expired',
          correct: false,
          multiplier: 0
        });
      }
      
      // Calculate result
      const priceChange = parseFloat(newPrice) - prediction.currentPrice;
      const actuallyUp = priceChange > 0;
      const predictedUp = prediction.prediction === 'up';
      const correct = predictedUp === actuallyUp;
      const multiplier = correct ? 2 : 0.5;
      
      console.log(`📊 ANALYSIS:`);
      console.log(`Start: $${prediction.currentPrice.toFixed(4)}`);
      console.log(`End: $${parseFloat(newPrice).toFixed(4)}`);
      console.log(`Change: ${priceChange > 0 ? '+' : ''}$${priceChange.toFixed(6)}`);
      console.log(`Predicted: ${prediction.prediction.toUpperCase()}`);
      console.log(`Result: ${correct ? '✅ CORRECT' : '❌ WRONG'}`);
      console.log(`Multiplier: ${multiplier}x`);
      
      // Update user stats with streak tracking
      const statsKey = `stats_${userAddress.toLowerCase()}`;
      let stats = await get(statsKey) || {
        totalPredictions: 0,
        correctPredictions: 0,
        currentStreak: 0,
        bestStreak: 0,
        lastPredictionCorrect: false
      };
      
      console.log(`📊 STATS BEFORE:`, stats);
      
      stats.totalPredictions++;
      
      if (correct) {
        stats.correctPredictions++;
        
        // Update streak
        if (stats.lastPredictionCorrect) {
          stats.currentStreak++;
          console.log(`🔥 STREAK CONTINUES: ${stats.currentStreak}`);
        } else {
          stats.currentStreak = 1;
          console.log(`🆕 NEW STREAK: 1`);
        }
        
        stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
        stats.lastPredictionCorrect = true;
      } else {
        console.log(`💔 STREAK BROKEN (was ${stats.currentStreak})`);
        stats.currentStreak = 0;
        stats.lastPredictionCorrect = false;
      }
      
      console.log(`📊 STATS AFTER:`, stats);
      
      // Save updated stats
      await set(statsKey, stats, STATS_TTL);
      
      // Clean up prediction
      await del(key);
      
      // Calculate win rate
      const winRate = stats.totalPredictions > 0
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : '0';
      
      console.log(`✅ VERIFICATION COMPLETE`);
      console.log(`Win Rate: ${winRate}%`);
      console.log(`Current Streak: ${stats.currentStreak} 🔥`);
      console.log(`Best Streak: ${stats.bestStreak} 🏆\n`);
      
      return res.status(200).json({
        success: true,
        correct,
        prediction: prediction.prediction,
        startPrice: prediction.currentPrice,
        endPrice: parseFloat(newPrice),
        priceChange: priceChange.toFixed(4),
        priceChangePercent: ((priceChange / prediction.currentPrice) * 100).toFixed(2),
        multiplier,
        stats: {
          totalPredictions: stats.totalPredictions,
          correctPredictions: stats.correctPredictions,
          currentStreak: stats.currentStreak,
          bestStreak: stats.bestStreak,
          winRate,
          lastPredictionCorrect: stats.lastPredictionCorrect
        }
      });
    }
    
    // ===== GET USER STATS =====
    if (req.method === 'GET') {
      const { userAddress } = req.query;
      
      if (!userAddress) {
        return res.status(400).json({ error: 'Missing userAddress parameter' });
      }
      
      const statsKey = `stats_${userAddress.toLowerCase()}`;
      const stats = await get(statsKey) || {
        totalPredictions: 0,
        correctPredictions: 0,
        currentStreak: 0,
        bestStreak: 0,
        winRate: '0'
      };
      
      stats.winRate = stats.totalPredictions > 0
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : '0';
      
      return res.status(200).json(stats);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('❌ API ERROR:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// Memory cleanup (only for non-KV fallback)
if (!useKV) {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, item] of memoryStore.entries()) {
      if (item.expires && now > item.expires) {
        memoryStore.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired items from memory`);
    }
  }, 60000); // Every minute
}
