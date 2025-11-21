// prediction.js — FINAL FIXED VERSION (Nov 2025)
import { randomBytes } from 'crypto';

// FORCE Node.js runtime (critical!)
export const runtime = 'nodejs';

// Simple safe ID generator (works everywhere)
function generateId() {
  return randomBytes(8).toString('hex'); // 16 chars, safe, no dependency issues
}

let kv;
let useKV = false;

// Load KV safely
try {
  const { kv: vercelKv } = await import('@vercel/kv');
  kv = vercelKv;
  useKV = true;
  console.log('✅ Vercel KV loaded');
} catch (e) {
  console.warn('⚠️ KV not available, using memory fallback');
  useKV = false;
}

// In-memory fallbacks
const memoryStore = new Map();
const userStats = new Map();

const PREDICTION_TTL = 300; // 5 min
const STATS_TTL = 2592000; // 30 days

// === STORAGE HELPERS (100% reliable now) ===
async function set(key, value, ttl = null) {
  const data = JSON.stringify(value);
  if (useKV) {
    try {
      await kv.set(key, data, ttl ? { ex: ttl } : undefined);
      return true;
    } catch (e) {
      console.error('KV write failed:', e.message);
      memoryStore.set(key, { value, expires: ttl ? Date.now() + ttl*1000 : null });
      return false;
    }
  } else {
    memoryStore.set(key, { value, expires: ttl ? Date.now() + ttl*1000 : null });
    return true;
  }
}

async function get(key) {
  if (useKV) {
    try {
      const raw = await kv.get(key);
      if (raw !== null) {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (e) {
      console.error('KV read failed:', e.message);
    }
  }
  const item = memoryStore.get(key);
  if (item && (!item.expires || Date.now() < item.expires)) {
    return item.value;
  }
  return null;
}

async function del(key) {
  if (useKV) await kv.del(key).catch(() => {});
  memoryStore.delete(key);
}

// === MAIN HANDLER ===
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // POST /predict
    if (req.method === 'POST' && req.body.action === 'predict') {
      const { userAddress, currentPrice, prediction, timestamp } = req.body;
      if (!userAddress || !currentPrice || !prediction || !timestamp) {
        return res.status(400).json({ error: 'Missing fields' });
      }

      const safeAddr = userAddress.toLowerCase();
      const predictionId = generateId(); // ← stable, always works
      const key = `pred_${safeAddr}_${predictionId}`;

      const data = {
        userAddress: safeAddr,
        currentPrice: parseFloat(currentPrice),
        prediction: prediction.toLowerCase(),
        timestamp: parseInt(timestamp),
        predictionId,
        expiresAt: parseInt(timestamp) + 60000,
      };

      await set(key, data, PREDICTION_TTL);

      return res.json({
        success: true,
        predictionId,
        expiresAt: data.expiresAt,
      });
    }

    // POST /verify
    if (req.method === 'POST' && req.body.action === 'verify') {
      const { userAddress, predictionId, newPrice } = req.body;
      if (!userAddress || !predictionId || !newPrice) {
        return res.status(400).json({ error: 'Missing userAddress, predictionId or newPrice' });
      }

      const key = `pred_${userAddress.toLowerCase()}_${predictionId}`;
      const prediction = await get(key);

      if (!prediction) {
        return res.status(404).json({
          error: 'Prediction not found or expired',
          correct: false,
          multiplier: 0
        });
      }

      // Clean up immediately
      await del(key);

      const priceChange = parseFloat(newPrice) - prediction.currentPrice;
      const actuallyUp = priceChange > 0;
      const predictedUp = prediction.prediction === 'up';
      const correct = predictedUp === actuallyUp;
      const multiplier = correct ? 2 : 0.5;

      // === STATS WITH STREAK ===
      const statsKey = `stats_${userAddress.toLowerCase()}`;
      let stats = await get(statsKey) || {
        totalPredictions: 0,
        correctPredictions: 0,
        currentStreak: 0,
        bestStreak: 0,
        lastPredictionCorrect: false
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
        : '0';

      return res.json({
        success: true,
        correct,
        multiplier,
        startPrice: prediction.currentPrice,
        endPrice: parseFloat(newPrice),
        priceChange: priceChange.toFixed(4),
        priceChangePercent: ((priceChange / prediction.currentPrice) * 100).toFixed(2),
        stats: {
          totalPredictions: stats.totalPredictions,
          correctPredictions: stats.correctPredictions,
          currentStreak: stats.currentStreak,
          bestStreak: stats.bestStreak,
          winRate,
        }
      });
    }

    // GET stats
    if (req.method === 'GET') {
      const { userAddress } = req.query;
      if (!userAddress) return res.status(400).json({ error: 'Missing userAddress' });

      const stats = await get(`stats_${userAddress.toLowerCase()}`) || {
        totalPredictions: 0, correctPredictions: 0, currentStreak: 0, bestStreak: 0, winRate: '0'
      };
      stats.winRate = stats.totalPredictions > 0
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : '0';

      return res.json(stats);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
