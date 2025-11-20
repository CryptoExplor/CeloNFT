// api/prediction.js
// Production-ready Price Prediction Game with Vercel KV (Nov 2025 best practices)
// Static KV import → guaranteed persistence across all serverless instances

import { kv } from '@vercel/kv';

// Constants
const PREDICTION_WINDOW = 60_000;    // 1 minute
const MAX_PREDICTIONS_PER_HOUR = 10;
const PREDICTION_TTL = 300;          // 5 minutes
const STATS_TTL = 2_592_000;         // 30 days
const HISTORY_TTL = 3_600;           // 1 hour

// =============================
// KV STORAGE HELPERS (Simplified & Bulletproof)
// =============================

const storePrediction = async (key, data) => {
  await kv.set(key, JSON.stringify(data), { ex: PREDICTION_TTL });
};

const getPrediction = async (key) => {
  const raw = await kv.get(key);
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
};

const deletePrediction = async (key) => {
  await kv.del(key);
};

const getUserStats = async (address) => {
  const key = `stats_${address.toLowerCase()}`;
  const raw = await kv.get(key);

  if (raw) {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed;
  }

  // Default stats
  return {
    totalPredictions: 0,
    correctPredictions: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastPredictionCorrect: false,
  };
};

const setUserStats = async (address, stats) => {
  const key = `stats_${address.toLowerCase()}`;
  const cleanStats = {
    totalPredictions: Number(stats.totalPredictions) || 0,
    correctPredictions: Number(stats.correctPredictions) || 0,
    currentStreak: Number(stats.currentStreak) || 0,
    bestStreak: Number(stats.bestStreak) || 0,
    lastPredictionCorrect: !!stats.lastPredictionCorrect,
  };
  await kv.set(key, JSON.stringify(cleanStats), { ex: STATS_TTL });
};

const getUserHistory = async (address) => {
  const key = `history_${address.toLowerCase()}`;
  const raw = await kv.get(key);
  if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw;
  return [];
};

const setUserHistory = async (address, history) => {
  const key = `history_${address.toLowerCase()}`;
  await kv.set(key, JSON.stringify(history.slice(-100)), { ex: HISTORY_TTL }); // keep last 100
};

// =============================
// MAIN HANDLER
// =============================

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ===== MAKE PREDICTION =====
    if (req.method === 'POST' && req.body.action === 'predict') {
      const { userAddress, currentPrice, prediction, timestamp } = req.body;

      if (!userAddress || !currentPrice || !prediction || !timestamp) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Rate limiting (last hour)
      const history = await getUserHistory(userAddress);
      const oneHourAgo = Date.now() - 3_600_000;
      const recent = history.filter(t => t > oneHourAgo);
      if (recent.length >= MAX_PREDICTIONS_PER_HOUR) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Max ${MAX_PRED_PREDICTIONS_PER_HOUR} predictions per hour`,
        });
      }

      const key = `pred_${userAddress.toLowerCase()}_${timestamp}`;
      const data = {
        userAddress: userAddress.toLowerCase(),
        currentPrice: parseFloat(currentPrice),
        prediction: prediction.toLowerCase(),
        timestamp: Number(timestamp),
        expiresAt: Number(timestamp) + PREDICTION_WINDOW,
      };

      await storePrediction(key, data);
      history.push(Date.now());
      await setUserHistory(userAddress, history);

      return res.status(200).json({
        success: true,
        message: 'Prediction recorded',
        expiresAt: data.expiresAt,
        key, // optional debug
      });
    }

    // ===== VERIFY PREDICTION =====
    if (req.method === 'POST' && req.body.action === 'verify') {
      const { userAddress, timestamp, newPrice } = req.body;

      if (!userAddress || !timestamp || newPrice === undefined) {
        return res.status(400).json({ error: 'Missing fields' });
      }

      const key = `pred_${userAddress.toLowerCase()}_${timestamp}`;
      const prediction = await getPrediction(key);

      if (!prediction) {
        return res.status(404).json({
          error: 'Prediction not found or expired',
          correct: false,
          multiplier: 0,
        });
      }

      // Expiration check (+10s grace)
      if (Date.now() > prediction.expiresAt + 10_000) {
        await deletePrediction(key);
        return res.status(400).json({ error: 'Prediction expired', correct: false });
      }

      const priceChange = parseFloat(newPrice) - prediction.currentPrice;
      const actuallyUp = priceChange > 0;
      const predictedUp = prediction.prediction === 'up';
      const correct = predictedUp === actuallyUp;
      const multiplier = correct ? 2 : 0.5;

      // Update stats with streak logic
      const stats = await getUserStats(userAddress);
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

      await setUserStats(userAddress, stats);
      await deletePrediction(key);

      const winRate = stats.totalPredictions > 0
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : '0';

      return res.status(200).json({
        success: true,
        correct,
        multiplier,
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

    // ===== GET USER STATS =====
    if (req.method === 'GET') {
      const { userAddress } = req.query;
      if (!userAddress) return res.status(400).json({ error: 'userAddress required' });

      const stats = await getUserStats(userAddress);
      const winRate = stats.totalPredictions > 0
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : '0.0';

      return res.status(200).json({ ...stats, winRate });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Optional: Vercel config (add to vercel.json if you want Edge runtime explicitly)
export const config = {
  runtime: 'edge', // or 'nodejs20.x' — both work fine with static KV import
};
