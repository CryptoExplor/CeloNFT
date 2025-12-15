// api/prediction.js - FIXED VERSION WITH PROPER KV STORAGE
// Complete rewrite with robust error handling and fallbacks

export const runtime = 'nodejs';

import { randomBytes } from 'crypto';

// ===== KV STORAGE INITIALIZATION =====
let kv = null;
let useKV = false;

// Try to load Vercel KV
async function initializeKV() {
  if (kv !== null) return useKV; // Already initialized
  
  try {
    // Dynamic import to avoid issues
    const vercelKV = await import('@vercel/kv');
    kv = vercelKV.kv;
    
    // Test KV connection
    await kv.ping();
    
    useKV = true;
    console.log('✅ Vercel KV initialized successfully');
    return true;
  } catch (e) {
    console.warn('⚠️ Vercel KV not available:', e.message);
    console.log('📝 Using in-memory storage fallback');
    useKV = false;
    return false;
  }
}

// In-memory fallback storage
const memoryStore = new Map();

// ===== STORAGE WRAPPER WITH AUTOMATIC FALLBACK =====
class Storage {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (!this.initialized) {
      await initializeKV();
      this.initialized = true;
    }
  }

  async set(key, value, ttl = null) {
    await this.init();
    
    const data = JSON.stringify(value);
    console.log(`📝 SET ${key}:`, value);
    
    // Try KV first
    if (useKV && kv) {
      try {
        if (ttl) {
          await kv.set(key, data, { ex: ttl });
        } else {
          await kv.set(key, data);
        }
        console.log(`✅ KV SET success: ${key}`);
      } catch (e) {
        console.error(`❌ KV SET failed for ${key}:`, e.message);
        // Don't throw, fall through to memory
      }
    }
    
    // Always save to memory as backup
    const expires = ttl ? Date.now() + (ttl * 1000) : null;
    memoryStore.set(key, { value, expires });
    console.log(`✅ Memory SET success: ${key}`);
    
    return true;
  }

  async get(key) {
    await this.init();
    
    console.log(`🔍 GET ${key}`);
    
    // Try KV first
    if (useKV && kv) {
      try {
        const raw = await kv.get(key);
        if (raw !== null) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          console.log(`✅ KV GET success: ${key}`, parsed);
          return parsed;
        }
        console.log(`⚠️ KV GET returned null: ${key}`);
      } catch (e) {
        console.error(`❌ KV GET failed for ${key}:`, e.message);
        // Fall through to memory
      }
    }
    
    // Fallback to memory
    const item = memoryStore.get(key);
    if (item) {
      // Check expiration
      if (item.expires && Date.now() >= item.expires) {
        console.log(`⏰ Memory key expired: ${key}`);
        memoryStore.delete(key);
        return null;
      }
      console.log(`✅ Memory GET success: ${key}`, item.value);
      return item.value;
    }
    
    console.log(`❌ Key not found: ${key}`);
    return null;
  }

  async delete(key) {
    await this.init();
    
    console.log(`🗑️ DELETE ${key}`);
    
    // Try KV first
    if (useKV && kv) {
      try {
        await kv.del(key);
        console.log(`✅ KV DELETE success: ${key}`);
      } catch (e) {
        console.error(`❌ KV DELETE failed for ${key}:`, e.message);
      }
    }
    
    // Always delete from memory
    memoryStore.delete(key);
    console.log(`✅ Memory DELETE success: ${key}`);
    
    return true;
  }

  async has(key) {
    await this.init();
    
    // Check KV first
    if (useKV && kv) {
      try {
        const exists = await kv.exists(key);
        if (exists) return true;
      } catch (e) {
        console.error(`❌ KV EXISTS failed for ${key}:`, e.message);
      }
    }
    
    // Check memory
    return memoryStore.has(key);
  }
}

// Create singleton instance
const storage = new Storage();

// ===== CONSTANTS =====
const STATS_TTL = 2592000; // 30 days
const PREDICTION_TTL = 600; // 10 minutes

function generateId() {
  return randomBytes(8).toString('hex');
}

// ===== API HANDLER =====
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Initialize storage
    await storage.init();

    // ===== HEALTH CHECK =====
    if (req.method === 'GET' && req.query.health === 'true') {
      return res.json({
        status: 'ok',
        storage: useKV ? 'kv' : 'memory',
        timestamp: Date.now()
      });
    }

    // ===== MAKE PREDICTION =====
    if (req.method === 'POST' && req.body.action === 'predict') {
      const { userAddress, currentPrice, prediction, timestamp } = req.body;
      
      console.log('📊 PREDICT REQUEST:', { userAddress, currentPrice, prediction, timestamp });
      
      // Validation
      if (!userAddress || !currentPrice || !prediction || !timestamp) {
        console.error('❌ Missing required fields');
        return res.status(400).json({ 
          error: 'Missing fields: userAddress, currentPrice, prediction, timestamp' 
        });
      }

      const addr = userAddress.toLowerCase();
      const predictionId = generateId();
      const ts = parseInt(timestamp);
      
      // Create prediction data
      const data = {
        userAddress: addr,
        currentPrice: parseFloat(currentPrice),
        prediction: prediction.toLowerCase(),
        timestamp: ts,
        predictionId,
        expiresAt: ts + 60000,
        createdAt: Date.now()
      };

      console.log('💾 Storing prediction:', data);

      // Store with BOTH keys for backward compatibility
      const timestampKey = `pred_${addr}_${ts}`;
      const idKey = `pred_${addr}_${predictionId}`;

      try {
        await storage.set(timestampKey, data, PREDICTION_TTL);
        await storage.set(idKey, data, PREDICTION_TTL);
        
        console.log(`✅ Prediction stored with keys: ${timestampKey}, ${idKey}`);

        return res.json({
          success: true,
          predictionId,
          timestamp: ts,
          expiresAt: data.expiresAt,
          message: 'Prediction stored successfully',
          storage: useKV ? 'kv' : 'memory'
        });
      } catch (error) {
        console.error('❌ Storage failed:', error);
        return res.status(500).json({
          error: 'Failed to store prediction',
          message: error.message
        });
      }
    }

    // ===== VERIFY PREDICTION =====
    if (req.method === 'POST' && req.body.action === 'verify') {
      const { userAddress, timestamp, predictionId, newPrice } = req.body;

      console.log('🔍 VERIFY REQUEST:', { userAddress, timestamp, predictionId, newPrice });

      // Validation
      if (!userAddress || !newPrice || (!timestamp && !predictionId)) {
        console.error('❌ Missing required fields for verification');
        return res.status(400).json({ 
          error: 'Missing required fields',
          required: ['userAddress', 'newPrice', 'timestamp OR predictionId']
        });
      }

      const addr = userAddress.toLowerCase();
      let prediction = null;
      let usedKey = null;

      // Try both keys to find the prediction
      if (predictionId) {
        const key = `pred_${addr}_${predictionId}`;
        console.log(`🔑 Trying predictionId key: ${key}`);
        prediction = await storage.get(key);
        if (prediction) usedKey = key;
      }
      
      if (!prediction && timestamp) {
        const key = `pred_${addr}_${timestamp}`;
        console.log(`🔑 Trying timestamp key: ${key}`);
        prediction = await storage.get(key);
        if (prediction) usedKey = key;
      }

      if (!prediction) {
        console.error('❌ Prediction not found');
        
        // Debug info
        const debugInfo = {
          triedKeys: [
            predictionId ? `pred_${addr}_${predictionId}` : null,
            timestamp ? `pred_${addr}_${timestamp}` : null
          ].filter(Boolean),
          memoryKeyCount: memoryStore.size,
          memoryKeys: Array.from(memoryStore.keys()).filter(k => k.includes(addr)),
          timestamp: Date.now()
        };
        
        console.log('🔍 Debug info:', debugInfo);
        
        return res.status(404).json({
          error: 'Prediction not found or expired',
          correct: false,
          multiplier: 0,
          debug: debugInfo
        });
      }

      console.log('✅ Prediction found:', prediction);

      // Calculate result
      const priceChange = parseFloat(newPrice) - prediction.currentPrice;
      const actuallyUp = priceChange > 0;
      const predictedUp = prediction.prediction === 'up';
      const correct = predictedUp === actuallyUp;
      const multiplier = correct ? 2 : 0.5;

      console.log('📊 Verification result:', {
        priceChange,
        actuallyUp,
        predictedUp,
        correct,
        multiplier
      });

      // Clean up both keys
      if (predictionId) await storage.delete(`pred_${addr}_${predictionId}`);
      if (timestamp) await storage.delete(`pred_${addr}_${timestamp}`);

      // Update user stats
      const statsKey = `stats_${addr}`;
      let stats = await storage.get(statsKey) || {
        totalPredictions: 0,
        correctPredictions: 0,
        currentStreak: 0,
        bestStreak: 0,
        lastPredictionCorrect: false,
      };

      stats.totalPredictions++;
      if (correct) {
        stats.correctPredictions++;
        stats.currentStreak = stats.lastPredictionCorrect ? stats.currentStreak + 1 : 1;
        stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
        stats.lastPredictionCorrect = true;
      } else {
        stats.currentStreak = 0;
        stats.lastPredictionCorrect = false;
      }

      await storage.set(statsKey, stats, STATS_TTL);

      const winRate = stats.totalPredictions > 0
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : '0.0';

      console.log('✅ Verification complete');

      return res.json({
        success: true,
        correct,
        multiplier,
        prediction: prediction.prediction,
        startPrice: prediction.currentPrice,
        endPrice: parseFloat(newPrice),
        priceChange: priceChange.toFixed(6),
        priceChangePercent: ((priceChange / prediction.currentPrice) * 100).toFixed(2),
        stats: {
          totalPredictions: stats.totalPredictions,
          correctPredictions: stats.correctPredictions,
          currentStreak: stats.currentStreak,
          bestStreak: stats.bestStreak,
          winRate,
        },
        storage: useKV ? 'kv' : 'memory'
      });
    }

    // ===== GET STATS =====
    if (req.method === 'GET' && req.query.userAddress) {
      const { userAddress } = req.query;
      
      console.log('📊 STATS REQUEST:', userAddress);

      const stats = await storage.get(`stats_${userAddress.toLowerCase()}`) || {
        totalPredictions: 0,
        correctPredictions: 0,
        currentStreak: 0,
        bestStreak: 0,
      };

      stats.winRate = stats.totalPredictions > 0
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : '0.0';

      console.log('✅ Stats retrieved:', stats);

      return res.json({
        ...stats,
        storage: useKV ? 'kv' : 'memory'
      });
    }

    // Unknown request
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (err) {
    console.error('💥 Prediction API error:', err);
    return res.status(500).json({ 
      error: 'Server error',
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}

// ===== CLEANUP FUNCTION (Optional - for scheduled cleanup) =====
export async function cleanup() {
  console.log('🧹 Running cleanup...');
  
  const now = Date.now();
  let cleanedCount = 0;
  
  // Clean expired items from memory
  for (const [key, item] of memoryStore.entries()) {
    if (item.expires && now >= item.expires) {
      memoryStore.delete(key);
      cleanedCount++;
    }
  }
  
  console.log(`✅ Cleaned ${cleanedCount} expired items from memory`);
  
  // If using KV, you could also clean up old stats here
  // (though KV handles TTL automatically)
  
  return { cleanedCount, timestamp: now };
}
