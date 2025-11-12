// Price Prediction Game API with Vercel KV (Redis) support
// Falls back to in-memory storage if KV is not available

let kv = null;
let useKV = false;

// Try to import Vercel KV
try {
  const kvModule = await import('@vercel/kv');
  kv = kvModule.kv;
  useKV = true;
  console.log('✅ Vercel KV enabled');
} catch (e) {
  console.log('⚠️ Vercel KV not available, using in-memory storage (predictions will be lost on restart)');
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
    // Store in Vercel KV with 2-minute expiration (prediction window + buffer)
    await kv.set(key, JSON.stringify(data), { ex: 120 }); // 120 seconds = 2 minutes
  } else {
    predictions.set(key, data);
  }
}

async function getPrediction(key) {
  if (useKV) {
    const data = await kv.get(key);
    return data ? JSON.parse(data) : null;
  } else {
    return predictions.get(key) || null;
  }
}

async function deletePrediction(key) {
  if (useKV) {
    await kv.del(key);
  } else {
    predictions.delete(key);
  }
}

async function getUserStats(address) {
  if (useKV) {
    const statsKey = `stats:${address.toLowerCase()}`;
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
  if (useKV) {
    const statsKey = `stats:${address.toLowerCase()}`;
    // Store stats for 30 days (will persist across sessions)
    await kv.set(statsKey, stats, { ex: 2592000 }); // 30 days in seconds
  } else {
    userStats.set(address.toLowerCase(), stats);
  }
}

async function getUserHistory(address) {
  if (useKV) {
    const historyKey = `history:${address.toLowerCase()}`;
    const data = await kv.get(historyKey);
    return data || [];
  } else {
    return predictionHistory.get(address.toLowerCase()) || [];
  }
}

async function setUserHistory(address, history) {
  if (useKV) {
    const historyKey = `history:${address.toLowerCase()}`;
    // Store history for 1 hour (rate limiting window)
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
      
      // Validate inputs
      if (!userAddress || !currentPrice || !prediction || !timestamp) {
        return res.status(400).json({
          error: 'Missing required fields'
        });
      }
      
      // Rate limiting check
      const userHistory = await getUserHistory(userAddress);
      const recentPredictions = userHistory.filter(
        t => Date.now() - t < 3600000 // Last hour
      );
      
      if (recentPredictions.length >= MAX_PREDICTIONS_PER_HOUR) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Max ${MAX_PREDICTIONS_PER_HOUR} predictions per hour`
        });
      }
      
      // Store prediction
      const predictionKey = `${userAddress.toLowerCase()}-${timestamp}`;
      await storePrediction(predictionKey, {
        userAddress: userAddress.toLowerCase(),
        currentPrice,
        prediction, // 'up' or 'down'
        timestamp,
        expiresAt: timestamp + PREDICTION_WINDOW
      });
      
      // Update history
      userHistory.push(timestamp);
      await setUserHistory(userAddress, userHistory);
      
      console.log(`📊 Prediction recorded:
        User: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}
        Price: $${currentPrice}
        Prediction: ${prediction.toUpperCase()}
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
      
      const predictionKey = `${userAddress.toLowerCase()}-${timestamp}`;
      const prediction = await getPrediction(predictionKey);
      
      if (!prediction) {
        return res.status(404).json({
          error: 'Prediction not found',
          correct: false,
          multiplier: 0
        });
      }
      
      // Check if expired (allow 5 extra seconds grace period)
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
      const multiplier = correct ? 2 : 0.5; // 2x for correct, 0.5x consolation prize for wrong
      
      // Update user stats
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
      
      // Clean up
      await deletePrediction(predictionKey);
      
      console.log(`${correct ? '✅' : '❌'} Prediction result:
        User: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}
        Start: $${prediction.currentPrice.toFixed(4)}
        End: $${newPrice.toFixed(4)}
        Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(4)} (${((priceChange / prediction.currentPrice) * 100).toFixed(2)}%)
        Predicted: ${prediction.prediction.toUpperCase()}
        Result: ${correct ? 'CORRECT' : 'WRONG'}
        Multiplier: ${multiplier}x
        Win Rate: ${((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)}%
        Streak: ${stats.currentStreak}
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

// Cleanup expired predictions periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, pred] of predictions.entries()) {
    if (now > pred.expiresAt + 60000) { // Extra minute buffer
      predictions.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired predictions`);
  }
}, 60000); // Clean every minute

// Cleanup old history (daily)
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
  
  console.log('🧹 Cleaned old prediction history');
}, 86400000); // Clean once per day
