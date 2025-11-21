// api/prediction.js
// FULLY BACKWARD + FORWARD COMPATIBLE (Nov 22, 2025)
// Fixed version with better error handling and debugging

export const runtime = 'nodejs';

import { randomBytes } from 'crypto';

let kv;
let useKV = false;

try {
  const { kv: vercelKv } = require('@vercel/kv');
  kv = vercelKv;
  useKV = true;
  console.log('✅ KV storage loaded');
} catch (e) {
  console.warn('⚠️ KV not available → using memory fallback');
  useKV = false;
}

const memory = new Map();
const STATS_TTL = 2592000; // 30 days
const PREDICTION_TTL = 600; // 10 minutes (increased from 5 for safety)

// Safe storage with better error handling
async function set(key, value, ttl = null) {
  const data = JSON.stringify(value);
  console.log(`📝 Setting key: ${key}`);
  
  if (useKV) {
    try {
      await kv.set(key, data, ttl ? { ex: ttl } : undefined);
      console.log(`✅ KV write successful: ${key}`);
    } catch (e) {
      console.error('❌ KV write failed:', e.message);
    }
  }
  
  // Always save to memory as backup
  memory.set(key, { value, expires: ttl ? Date.now() + ttl * 1000 : null });
  console.log(`✅ Memory write successful: ${key}`);
}

async function get(key) {
  console.log(`🔍 Getting key: ${key}`);
  let val = null;
  
  if (useKV) {
    try {
      const raw = await kv.get(key);
      if (raw !== null) {
        val = typeof raw === 'string' ? JSON.parse(raw) : raw;
        console.log(`✅ KV read successful: ${key}`, val);
      } else {
        console.log(`⚠️ KV read returned null: ${key}`);
      }
    } catch (e) {
      console.error(`❌ KV read failed for ${key}:`, e.message);
    }
  }
  
  // Fallback to memory if KV failed
  if (!val) {
    const item = memory.get(key);
    if (item && (!item.expires || Date.now() < item.expires)) {
      val = item.value;
      console.log(`✅ Memory read successful: ${key}`, val);
    } else if (item && item.expires && Date.now() >= item.expires) {
      console.log(`⏰ Memory key expired: ${key}`);
      memory.delete(key);
    } else {
      console.log(`❌ Key not found in memory: ${key}`);
    }
  }
  
  return val;
}

async function del(key) {
  console.log(`🗑️ Deleting key: ${key}`);
  if (useKV) {
    try {
      await kv.del(key);
      console.log(`✅ KV delete successful: ${key}`);
    } catch (e) {
      console.error(`❌ KV delete failed for ${key}:`, e.message);
    }
  }
  memory.delete(key);
}

function generateId() {
  return randomBytes(8).toString('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ===== MAKE PREDICTION =====
    if (req.method === 'POST' && req.body.action === 'predict') {
      const { userAddress, currentPrice, prediction, timestamp } = req.body;
      
      console.log('📊 PREDICT REQUEST:', { userAddress, currentPrice, prediction, timestamp });
      
      if (!userAddress || !currentPrice || !prediction || !timestamp) {
        console.error('❌ Missing required fields');
        return res.status(400).json({ error: 'Missing fields: userAddress, currentPrice, prediction, timestamp' });
      }

      const addr = userAddress.toLowerCase();
      const predictionId = generateId();
      
      // Store with BOTH keys for backward compatibility
      const timestampKey = `pred_${addr}_${timestamp}`;
      const idKey = `pred_${addr}_${predictionId}`;

      const data = {
        userAddress: addr,
        currentPrice: parseFloat(currentPrice),
        prediction: prediction.toLowerCase(),
        timestamp: parseInt(timestamp),
        predictionId,
        expiresAt: parseInt(timestamp) + 60000,
        createdAt: Date.now()
      };

      console.log('💾 Storing prediction data:', data);

      // Save with both keys
      await set(timestampKey, data, PREDICTION_TTL);
      await set(idKey, data, PREDICTION_TTL);

      console.log(`✅ Prediction saved with keys: ${timestampKey}, ${idKey}`);

      return res.json({
        success: true,
        predictionId,
        timestamp: parseInt(timestamp),
        expiresAt: data.expiresAt,
        message: 'Prediction stored successfully'
      });
    }

    // ===== VERIFY PREDICTION (supports BOTH old timestamp & new predictionId) =====
    if (req.method === 'POST' && req.body.action === 'verify') {
      const { userAddress, timestamp, predictionId, newPrice } = req.body;

      console.log('🔍 VERIFY REQUEST:', { userAddress, timestamp, predictionId, newPrice });

      if (!userAddress || !newPrice || (!timestamp && !predictionId)) {
        console.error('❌ Missing required fields for verification');
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const addr = userAddress.toLowerCase();
      let key;
      let prediction = null;

      // Try both keys to find the prediction
      if (predictionId) {
        key = `pred_${addr}_${predictionId}`;
        console.log(`🔑 Trying predictionId key: ${key}`);
        prediction = await get(key);
      }
      
      if (!prediction && timestamp) {
        key = `pred_${addr}_${timestamp}`;
        console.log(`🔑 Trying timestamp key: ${key}`);
        prediction = await get(key);
      }

      if (!prediction) {
        console.error('❌ Prediction not found');
        console.log('📋 Available memory keys:', Array.from(memory.keys()));
        
        return res.status(404).json({
          error: 'Prediction not found or expired',
          correct: false,
          multiplier: 0,
          debug: {
            triedKeys: [
              predictionId ? `pred_${addr}_${predictionId}` : null,
              timestamp ? `pred_${addr}_${timestamp}` : null
            ].filter(Boolean),
            memoryKeyCount: memory.size,
            timestamp: Date.now()
          }
        });
      }

      console.log('✅ Prediction found:', prediction);

      // Clean up both keys
      if (predictionId) await del(`pred_${addr}_${predictionId}`);
      if (timestamp) await del(`pred_${addr}_${timestamp}`);

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

      // Stats + streak
      const statsKey = `stats_${addr}`;
      let stats = (await get(statsKey)) || {
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

      await set(statsKey, stats, STATS_TTL);

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
      });
    }

    // ===== GET STATS =====
    if (req.method === 'GET') {
      const { userAddress } = req.query;
      if (!userAddress) return res.status(400).json({ error: 'userAddress required' });

      console.log('📊 STATS REQUEST:', userAddress);

      const stats = (await get(`stats_${userAddress.toLowerCase()}`)) || {
        totalPredictions: 0,
        correctPredictions: 0,
        currentStreak: 0,
        bestStreak: 0,
      };

      stats.winRate = stats.totalPredictions > 0
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : '0.0';

      console.log('✅ Stats retrieved:', stats);

      return res.json(stats);
    }

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
