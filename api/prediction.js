// api/prediction.js
// FULLY BACKWARD + FORWARD COMPATIBLE (Nov 22, 2025)
// Works with your existing main.js (no changes needed!)
// Also supports new predictionId format for future-proofing

export const runtime = 'nodejs'; // Critical: forces Vercel to use Node.js runtime

import { randomBytes } from 'crypto';

let kv;
let useKV = false;

try {
  const { kv: vercelKv } = require('@vercel/kv');
  kv = vercelKv;
  useKV = true;
  console.log('KV loaded');
} catch (e) {
  console.warn('KV not available → using memory fallback');
  useKV = false;
}

const memory = new Map();
const STATS_TTL = 2592000; // 30 days
const PREDICTION_TTL = 300; // 5 min

// Safe storage
async function set(key, value, ttl = null) {
  const data = JSON.stringify(value);
  if (useKV) {
    try {
      await kv.set(key, data, ttl ? { ex: ttl } : undefined);
    } catch (e) {
      console.error('KV write failed:', e.message);
    }
  }
  memory.set(key, { value, expires: ttl ? Date.now() + ttl * 1000 : null });
}

async function get(key) {
  let val = null;
  if (useKV) {
    try {
      const raw = await kv.get(key);
      if (raw !== null) val = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {}
  }
  if (!val) {
    const item = memory.get(key);
    if (item && (!item.expires || Date.now() < item.expires)) val = item.value;
  }
  return val;
}

async function del(key) {
  if (useKV) await kv.del(key).catch(() => {});
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
      if (!userAddress || !currentPrice || !prediction || !timestamp) {
        return res.status(400).json({ error: 'Missing fields' });
      }

      const addr = userAddress.toLowerCase();
      const predictionId = generateId();
      const key = `pred_${addr}_${predictionId}`;

      const data = {
        userAddress: addr,
        currentPrice: parseFloat(currentPrice),
        prediction: prediction.toLowerCase(),
        timestamp: parseInt(timestamp),
        predictionId,
        expiresAt: parseInt(timestamp) + 60000,
      };

      await set(key, data, PREDICTION_TTL);

      return res.json({
        success: true,
        predictionId,           // new format
        timestamp: parseInt(timestamp), // kept for backward compat
        expiresAt: data.expiresAt,
      });
    }

    // ===== VERIFY PREDICTION (supports BOTH old timestamp & new predictionId) =====
    if (req.method === 'POST' && req.body.action === 'verify') {
      const { userAddress, timestamp, predictionId, newPrice } = req.body;

      if (!userAddress || !newPrice || (!timestamp && !predictionId)) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const addr = userAddress.toLowerCase();
      let key;

      if (predictionId) {
        // New format
        key = `pred_${addr}_${predictionId}`;
      } else {
        // Old format fallback (your current main.js uses this)
        key = `pred_${addr}_${timestamp}`;
      }

      const prediction = await get(key);
      if (!prediction) {
        return res.status(404).json({
          error: 'Prediction not found or expired',
          correct: false,
          multiplier: 0,
        });
      }

      await del(key); // cleanup

      const priceChange = parseFloat(newPrice) - prediction.currentPrice;
      const actuallyUp = priceChange > 0;
      const predictedUp = prediction.prediction === 'up';
      const correct = predictedUp === actuallyUp;
      const multiplier = correct ? 2 : 0.5;

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

      const stats = (await get(`stats_${userAddress.toLowerCase()}`)) || {
        totalPredictions: 0,
        correctPredictions: 0,
        currentStreak: 0,
        bestStreak: 0,
      };

      stats.winRate = stats.totalPredictions > 0
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : '0.0';

      return res.json(stats);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Prediction API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
