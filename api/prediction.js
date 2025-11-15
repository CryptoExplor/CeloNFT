// Price Prediction Game API with Vercel KV (Redis) support
// ✅ FIXED: Proper KV import and configuration

import { kv } from '@vercel/kv';

let useKV = false;

// ✅ FIX: Static import with runtime env check
try {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    useKV = true;
    console.log('✅ Vercel KV enabled');
  } else {
    console.log('⚠️ KV env vars missing (KV_REST_API_URL, KV_REST_API_TOKEN)');
    console.log('⚠️ Using in-memory storage - predictions will be lost on restart');
    console.log('⚠️ Configure Vercel KV: https://vercel.com/docs/storage/vercel-kv');
  }
} catch (e) {
  console.log('⚠️ Vercel KV module error:', e.message);
  useKV = false;
}

// Fallback in-memory storage
const predictions = new Map();
const predictionHistory = new Map();
const userStats = new Map();

const PREDICTION_WINDOW = 60000; // 1 minute
const MAX_PREDICTIONS_PER_HOUR = 10;

// Helper functions for KV storage
async function storePrediction(key, data) {
  if (useKV) {
    try {
      await kv.set(key, data, { ex: 120 }); // 2 minutes TTL
      console.log(`✅ Stored prediction in KV: ${key}`);
      
      // Verify write
      const verify = await kv.get(key);
      if (verify) {
        console.log(`✅ Verified: ${key}`);
      } else {
        console.error(`❌ Verification failed for: ${key}`);
      }
    } catch (error) {
      console.error(`❌ KV store error:`, error);
      // Fallback to in-memory
      predictions.set(key, data);
      console.log(`⚠️ Fallback: Stored in memory`);
    }
  } else {
    predictions.set(key, data);
    console.log(`📝 Stored in memory: ${key}`);
  }
}

async function getPrediction(key) {
  if (useKV) {
    try {
      const data = await kv.get(key);
      console.log(`🔍 KV lookup: ${key} →`, data ? 'FOUND' : 'NOT FOUND');
      return data || null;
    } catch (error) {
      console.error(`❌ KV get error:`, error);
      return predictions.get(key) || null;
    }
  } else {
    const data = predictions.get(key) || null;
    console.log(`🔍 Memory lookup: ${key} →`, data ? 'FOUND' : 'NOT FOUND');
    return data;
  }
}

async function deletePrediction(key) {
  if (useKV) {
    try {
      await kv.del(key);
      console.log(`🗑️ Deleted from KV: ${key}`);
    } catch (error) {
      console.error(`❌ KV delete error:`, error);
    }
  } else {
    predictions.delete(key);
    console.log(`🗑️ Deleted from memory: ${key}`);
  }
}

async function getUserStats(address) {
  const statsKey = `stats:${address.toLowerCase()}`;
  if (useKV) {
    const data = await kv.get(statsKey);
    return data || {
      totalPredictions: 0,
      correctPredictions: 0,
      currentStreak: 0,
      bestStreak: 0,
      lastPredictionCorrect: false
    };
  } else {
    return userStats.get(address.toLowerCase()) || {
      totalPredictions: 0,
      correctPredictions: 0,
      currentStreak: 0,
      bestStreak: 0,
      lastPredictionCorrect: false
    };
  }
}

async function setUserStats(address, stats) {
  const statsKey = `stats:${address.toLowerCase()}`;
  if (useKV) {
    await kv.set(statsKey, stats, { ex: 2592000 }); // 30 days
  } else {
    userStats.set(address.toLowerCase(), stats);
  }
}

async function getUserHistory(address) {
  const historyKey = `history:${address.toLowerCase()}`;
  if (useKV) {
    const data = await kv.get(historyKey);
    return data || [];
  } else {
    return predictionHistory.get(address.toLowerCase()) || [];
  }
}

async function setUserHistory(address, history) {
  const historyKey = `history:${address.toLowerCase()}`;
  if (useKV) {
    await kv.set(historyKey, history, { ex: 3600 }); // 1 hour
  } else {
    predictionHistory.set(address.toLowerCase(), history);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Store prediction
    if (req.method === 'POST' && req.body.action === 'predict') {
      const { userAddress, currentPrice, prediction, timestamp } = req.body;
      
      if (!userAddress || !currentPrice || !prediction || !timestamp) {
        return res.status(400).json({
          error: 'Missing required fields'
        });
      }
      
      // Rate limiting check
      const userHistory = await getUserHistory(userAddress);
      const recentPredictions = userHistory.filter(
        t => Date.now() - t < 3600000
      );
      
      if (recentPredictions.length >= MAX_PREDICTIONS_PER_HOUR) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Max ${MAX_PREDICTIONS_PER_HOUR} predictions per hour`
        });
      }
      
      // Store prediction
      const predictionKey = `${userAddress.toLowerCase()}-${timestamp}`;
      const predictionData = {
        userAddress: userAddress.toLowerCase(),
        currentPrice,
        prediction,
        timestamp,
        expiresAt: timestamp + PREDICTION_WINDOW,
        storedAt: Date.now()
      };
      
      await storePrediction(predictionKey, predictionData);
      
      // Update history
      userHistory.push(timestamp);
      await setUserHistory(userAddress, userHistory);
      
      console.log(`📊 Prediction recorded:
        User: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}
        Price: $${currentPrice}
        Prediction: ${prediction.toUpperCase()}
        TTL: 120s
        Expires: ${new Date(timestamp + PREDICTION_WINDOW).toLocaleTimeString()}
      `);
      
      return res.status(200).json({
        success: true,
        message: 'Prediction recorded',
        expiresAt: timestamp + PREDICTION_WINDOW
      });
    }
    
    // Verify prediction
    if (req.method === 'POST' && req.body.action === 'verify') {
      const { userAddress, timestamp, newPrice } = req.body;
      
      const timeElapsed = Date.now() - timestamp;
      console.log(`⏱️ Verifying prediction:
        User: ${userAddress.slice(0,6)}...${userAddress.slice(-4)}
        Timestamp: ${timestamp}
        Elapsed: ${Math.floor(timeElapsed / 1000)}s
      `);
      
      const predictionKey = `${userAddress.toLowerCase()}-${timestamp}`;
      const prediction = await getPrediction(predictionKey);
      
      if (!prediction) {
        console.log(`❌ Prediction not found: ${predictionKey}`);
        return res.status(404).json({
          error: 'Prediction not found',
          correct: false,
          multiplier: 0
        });
      }
      
      // Check if expired (5s grace period)
      if (Date.now() > prediction.expiresAt + 5000) {
        await deletePrediction(predictionKey);
        return res.status(400).json({
          error: 'Prediction expired',
          correct: false,
          multiplier: 0
        });
      }
      
      // Verify prediction
      const priceChange = newPrice - prediction.currentPrice;
      const predictedUp = prediction.prediction === 'up';
      const actuallyWentUp = priceChange > 0;
      const correct = predictedUp === actuallyWentUp;
      const multiplier = correct ? 2 : 0.5;
      
      // Update stats
      const stats = await getUserStats(userAddress);
      stats.totalPredictions++;
      if (correct) {
        stats.correctPredictions++;
        stats.currentStreak = stats.lastPredictionCorrect ? stats.currentStreak + 1 : 1;
        stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
      } else {
        stats.currentStreak = 0;
      }
      stats.lastPredictionCorrect = correct;
      await setUserStats(userAddress, stats);
      
      // Cleanup
      await deletePrediction(predictionKey);
      
      console.log(`${correct ? '✅' : '❌'} Result:
        Start: $${prediction.currentPrice.toFixed(4)}
        End: $${newPrice.toFixed(4)}
        Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(4)}
        Predicted: ${prediction.prediction.toUpperCase()}
        Result: ${correct ? 'CORRECT' : 'WRONG'}
        Multiplier: ${multiplier}x
        Win Rate: ${((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)}%
      `);
      
      return res.status(200).json({
        success: true,
        correct,
        prediction: prediction.prediction,
        startPrice: prediction.currentPrice,
        endPrice: newPrice,
        priceChange: priceChange.toFixed(4),
        priceChangePercent: ((priceChange / prediction.currentPrice) * 100).toFixed(2),
        multiplier,
        stats: {
          totalPredictions: stats.totalPredictions,
          correctPredictions: stats.correctPredictions,
          currentStreak: stats.currentStreak,
          bestStreak: stats.bestStreak,
          winRate: ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        }
      });
    }
    
    // Get user stats
    if (req.method === 'GET') {
      const { userAddress } = req.query;
      
      if (!userAddress) {
        return res.status(400).json({ error: 'Missing userAddress' });
      }
      
      const stats = await getUserStats(userAddress);
      stats.winRate = stats.totalPredictions > 0 
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : 0;
      
      return res.status(200).json(stats);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Prediction API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// Cleanup expired predictions (in-memory only)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, pred] of predictions.entries()) {
    if (now > pred.expiresAt + 60000) {
      predictions.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired predictions`);
  }
}, 60000);

// Cleanup old history (in-memory only)
setInterval(() => {
  const oneDayAgo = Date.now() - 86400000;
  
  for (const [address, history] of predictionHistory.entries()) {
    const recent = history.filter(t => t > oneDayAgo);
    if (recent.length === 0) {
      predictionHistory.delete(address);
    } else {
      predictionHistory.set(address, recent);
    }
  }
  
  console.log('🧹 Cleaned old history');
}, 86400000);
