// Price Prediction Game API with Vercel KV (Redis) support
// Fixed: Proper TTL, better error handling, and win streak tracking

let kv = null;
let useKV = false;

// Try to import Vercel KV
try {
  const kvModule = await import('@vercel/kv');
  kv = kvModule.kv;
  useKV = true;
  console.log('✅ Vercel KV enabled');
} catch (e) {
  console.log('⚠️ Vercel KV not available, using in-memory storage');
  console.log('⚠️ For production use, configure Vercel KV environment variables');
  useKV = false;
}

// Fallback in-memory storage
const predictions = new Map();
const predictionHistory = new Map();
const userStats = new Map();

const PREDICTION_WINDOW = 60000; // 1 minute
const MAX_PREDICTIONS_PER_HOUR = 10;
const PREDICTION_TTL = 300; // 5 minutes in seconds (enough time for verification)
const STATS_TTL = 2592000; // 30 days in seconds
const HISTORY_TTL = 3600; // 1 hour in seconds

// Helper functions for KV storage
async function storePrediction(key, data) {
  if (useKV) {
    try {
      // Store with 5-minute expiration (enough time for 60s prediction + buffer)
      await kv.set(key, JSON.stringify(data), { ex: PREDICTION_TTL });
      console.log(`✅ Stored prediction in KV: ${key} (TTL: ${PREDICTION_TTL}s)`);
      
      // Verify write immediately
      const verify = await kv.get(key);
      if (verify) {
        console.log(`✅ Verified prediction stored:`, JSON.parse(verify));
        return true;
      } else {
        console.error(`❌ Failed to verify prediction write for key: ${key}`);
        throw new Error('KV write verification failed');
      }
    } catch (error) {
      console.error(`❌ Error storing prediction in KV:`, error);
      // Fallback to in-memory
      predictions.set(key, data);
      console.log(`⚠️ Fallback: Stored in memory instead`);
      return false;
    }
  } else {
    predictions.set(key, data);
    console.log(`📝 Stored prediction in memory: ${key}`);
    return true;
  }
}

async function getPrediction(key) {
  if (useKV) {
    try {
      const data = await kv.get(key);
      console.log(`🔍 KV lookup for ${key}:`, data ? 'FOUND' : 'NOT FOUND');
      
      if (data) {
        // Parse if it's a string
        if (typeof data === 'string') {
          return JSON.parse(data);
        }
        return data;
      }
      return null;
    } catch (error) {
      console.error(`❌ Error reading from KV:`, error);
      return predictions.get(key) || null;
    }
  } else {
    const data = predictions.get(key) || null;
    console.log(`🔍 Memory lookup for ${key}:`, data ? 'FOUND' : 'NOT FOUND');
    return data;
  }
}

async function deletePrediction(key) {
  if (useKV) {
    try {
      await kv.del(key);
      console.log(`🗑️ Deleted prediction from KV: ${key}`);
    } catch (error) {
      console.error(`❌ Error deleting from KV:`, error);
    }
  } else {
    predictions.delete(key);
    console.log(`🗑️ Deleted prediction from memory: ${key}`);
  }
}

async function getUserStats(address) {
  const statsKey = `stats:${address.toLowerCase()}`;
  
  if (useKV) {
    try {
      const data = await kv.get(statsKey);
      if (data) {
        // Parse if it's a string
        if (typeof data === 'string') {
          return JSON.parse(data);
        }
        return data;
      }
    } catch (error) {
      console.error(`❌ Error reading stats from KV:`, error);
    }
  } else {
    const data = userStats.get(address.toLowerCase());
    if (data) return data;
  }
  
  // Return default stats
  return {
    totalPredictions: 0,
    correctPredictions: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastPredictionCorrect: false
  };
}

async function setUserStats(address, stats) {
  const statsKey = `stats:${address.toLowerCase()}`;
  
  // Ensure all fields are present and valid
  const validStats = {
    totalPredictions: parseInt(stats.totalPredictions) || 0,
    correctPredictions: parseInt(stats.correctPredictions) || 0,
    currentStreak: parseInt(stats.currentStreak) || 0,
    bestStreak: parseInt(stats.bestStreak) || 0,
    lastPredictionCorrect: Boolean(stats.lastPredictionCorrect)
  };
  
  if (useKV) {
    try {
      // Store stats for 30 days
      await kv.set(statsKey, JSON.stringify(validStats), { ex: STATS_TTL });
      console.log(`✅ Stored user stats in KV: ${statsKey}`, validStats);
      
      // Verify write immediately
      const verify = await kv.get(statsKey);
      if (verify) {
        console.log(`✅ Verified stats write successful`);
      } else {
        console.error(`❌ Failed to verify stats write`);
        throw new Error('KV write verification failed for stats');
      }
    } catch (error) {
      console.error(`❌ Error storing stats in KV:`, error);
      // Fallback to in-memory
      userStats.set(address.toLowerCase(), validStats);
      console.log(`⚠️ Fallback: Stored stats in memory instead`);
    }
  } else {
    userStats.set(address.toLowerCase(), validStats);
    console.log(`📝 Stored user stats in memory: ${statsKey}`, validStats);
  }
}

async function getUserHistory(address) {
  const historyKey = `history:${address.toLowerCase()}`;
  
  if (useKV) {
    try {
      const data = await kv.get(historyKey);
      if (data) {
        if (typeof data === 'string') {
          return JSON.parse(data);
        }
        return data;
      }
    } catch (error) {
      console.error(`❌ Error reading history from KV:`, error);
    }
  } else {
    const data = predictionHistory.get(address.toLowerCase());
    if (data) return data;
  }
  
  return [];
}

async function setUserHistory(address, history) {
  const historyKey = `history:${address.toLowerCase()}`;
  
  if (useKV) {
    try {
      // Store history for 1 hour (rate limiting window)
      await kv.set(historyKey, JSON.stringify(history), { ex: HISTORY_TTL });
    } catch (error) {
      console.error(`❌ Error storing history in KV:`, error);
      predictionHistory.set(address.toLowerCase(), history);
    }
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
      
      // Store prediction with extended TTL
      const predictionKey = `pred:${userAddress.toLowerCase()}:${timestamp}`;
      const predictionData = {
        userAddress: userAddress.toLowerCase(),
        currentPrice,
        prediction, // 'up' or 'down'
        timestamp,
        expiresAt: timestamp + PREDICTION_WINDOW,
        storedAt: Date.now()
      };
      
      const stored = await storePrediction(predictionKey, predictionData);
      
      if (!stored && useKV) {
        console.warn('⚠️ KV storage failed, using in-memory fallback');
      }
      
      // Update history
      userHistory.push(timestamp);
      await setUserHistory(userAddress, userHistory);
      
      console.log(`📊 Prediction recorded:
        User: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}
        Price: $${currentPrice}
        Prediction: ${prediction.toUpperCase()}
        Key: ${predictionKey}
        TTL: ${PREDICTION_TTL}s
        Storage: ${useKV ? 'KV' : 'Memory'}
      `);
      
      return res.status(200).json({
        success: true,
        message: 'Prediction recorded',
        expiresAt: timestamp + PREDICTION_WINDOW,
        storage: useKV ? 'kv' : 'memory'
      });
    }
    
    // Verify prediction
    if (req.method === 'POST' && req.body.action === 'verify') {
      try {
        const { userAddress, timestamp, newPrice } = req.body;
        
        if (!userAddress || !timestamp || !newPrice) {
          return res.status(400).json({
            error: 'Missing required fields',
            correct: false,
            multiplier: 0
          });
        }
        
        const timeElapsed = Date.now() - parseInt(timestamp);
        console.log(`⏱️ Verifying prediction for ${userAddress.slice(0,6)}...${userAddress.slice(-4)}`);
        console.log(`  Timestamp: ${timestamp} (${new Date(parseInt(timestamp)).toISOString()})`);
        console.log(`  Time elapsed: ${Math.floor(timeElapsed / 1000)}s`);
        console.log(`  Current time: ${Date.now()} (${new Date().toISOString()})`);
        console.log(`  Expected window: 60s`);
        console.log(`  Storage: ${useKV ? 'KV' : 'Memory'}`);
        
        // Use consistent key format
        const predictionKey = `prediction_${userAddress.toLowerCase()}_${timestamp}`;
        console.log(`  Looking for key: ${predictionKey}`);
        
        const prediction = await getPrediction(predictionKey);
        
        console.log(`🔍 Prediction lookup result:`, prediction ? 'FOUND' : 'NOT FOUND');
        if (prediction) {
          console.log(`📊 Prediction details:`, {
            currentPrice: prediction.currentPrice,
            prediction: prediction.prediction,
            timestamp: prediction.timestamp,
            expiresAt: prediction.expiresAt,
            expiresAtDate: new Date(prediction.expiresAt).toISOString()
          });
        }
        
        if (!prediction) {
          console.error(`❌ Prediction not found for key: ${predictionKey}`);
          console.log(`  Debugging info:`);
          console.log(`  - User: ${userAddress.toLowerCase()}`);
          console.log(`  - Timestamp: ${timestamp}`);
          console.log(`  - TTL: ${PREDICTION_TTL}s (${Math.floor(PREDICTION_TTL / 60)} minutes)`);
          console.log(`  - Time elapsed since prediction: ${Math.floor(timeElapsed / 1000)}s`);
          
          // Try to debug by listing keys (if in-memory)
          if (!useKV && predictions.size > 0) {
            console.log(`  - Available keys in memory:`, Array.from(predictions.keys()));
          }
          
          return res.status(404).json({
            error: 'Prediction not found or expired',
            correct: false,
            multiplier: 0,
            debug: {
              key: predictionKey,
              storage: useKV ? 'kv' : 'memory',
              timeElapsed: `${Math.floor(timeElapsed / 1000)}s`,
              expectedTTL: `${PREDICTION_TTL}s`
            }
          });
        }
        
        // Check if expired (allow 10 second grace period)
        const gracePeriod = 10000;
        if (Date.now() > prediction.expiresAt + gracePeriod) {
          console.warn(`⚠️ Prediction expired: ${Date.now() - prediction.expiresAt}ms ago`);
          await deletePrediction(predictionKey);
          return res.status(400).json({
            error: 'Prediction expired',
            correct: false,
            multiplier: 0
          });
        }
        
        // Verify prediction
        const priceChange = parseFloat(newPrice) - parseFloat(prediction.currentPrice);
        const predictedUp = prediction.prediction === 'up';
        const actuallyWentUp = priceChange > 0;
        
        const correct = predictedUp === actuallyWentUp;
        const multiplier = correct ? 2 : 0.5;
        
        console.log(`📊 Price analysis:
          Start: ${prediction.currentPrice}
          End: ${newPrice}
          Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(4)}
          Predicted: ${prediction.prediction.toUpperCase()} (${predictedUp ? 'UP' : 'DOWN'})
          Actual: ${actuallyWentUp ? 'UP' : 'DOWN'}
          Result: ${correct ? '✅ CORRECT' : '❌ WRONG'}
        `);
        
        // Update user stats with proper streak tracking
        const stats = await getUserStats(userAddress);
        
        console.log('📊 Current stats before update:', stats);
        
        stats.totalPredictions++;
        
        if (correct) {
          stats.correctPredictions++;
          // CRITICAL: Increment streak if last prediction was also correct
          if (stats.lastPredictionCorrect) {
            stats.currentStreak++;
            console.log(`🔥 Streak increased to ${stats.currentStreak}!`);
          } else {
            stats.currentStreak = 1;
            console.log(`🆕 Starting new streak: 1`);
          }
          stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
          stats.lastPredictionCorrect = true;
        } else {
          // Reset streak on wrong prediction
          console.log(`💔 Streak broken. Resetting from ${stats.currentStreak} to 0`);
          stats.currentStreak = 0;
          stats.lastPredictionCorrect = false;
        }
        
        console.log('📊 Updated stats after prediction:', stats);
        
        // Save updated stats
        await setUserStats(userAddress, stats);
        
        // Verify stats were saved
        const verifyStats = await getUserStats(userAddress);
        console.log('✅ Verified saved stats:', verifyStats);
        
        // Clean up prediction
        await deletePrediction(predictionKey);
        
        const winRate = ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1);
        
        console.log(`${correct ? '✅' : '❌'} Prediction result:
          User: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}
          Start: ${prediction.currentPrice.toFixed(4)}
          End: ${parseFloat(newPrice).toFixed(4)}
          Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(4)} (${((priceChange / prediction.currentPrice) * 100).toFixed(2)}%)
          Predicted: ${prediction.prediction.toUpperCase()}
          Result: ${correct ? 'CORRECT ✅' : 'WRONG ❌'}
          Multiplier: ${multiplier}x
          Stats: ${stats.totalPredictions} total, ${stats.correctPredictions} correct
          Win Rate: ${winRate}%
          Current Streak: ${stats.currentStreak} 🔥
          Best Streak: ${stats.bestStreak} 🏆
          Last Correct: ${stats.lastPredictionCorrect}
          Storage: ${useKV ? 'KV' : 'Memory'}
        `);
        
        return res.status(200).json({
          success: true,
          correct,
          prediction: prediction.prediction,
          startPrice: parseFloat(prediction.currentPrice),
          endPrice: parseFloat(newPrice),
          priceChange: priceChange.toFixed(4),
          priceChangePercent: ((priceChange / prediction.currentPrice) * 100).toFixed(2),
          multiplier,
          stats: {
            totalPredictions: stats.totalPredictions,
            correctPredictions: stats.correctPredictions,
            currentStreak: stats.currentStreak,
            bestStreak: stats.bestStreak,
            winRate: winRate,
            lastPredictionCorrect: stats.lastPredictionCorrect
          }
        });
      } catch (verifyError) {
        console.error('❌ Error verifying prediction:', verifyError);
        console.error('Error stack:', verifyError.stack);
        return res.status(500).json({
          error: 'Failed to verify prediction',
          message: verifyError.message,
          correct: false,
          multiplier: 0
        });
      }
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
        : '0';
      
      console.log(`📊 Fetched stats for ${userAddress.slice(0,6)}...${userAddress.slice(-4)}:`, stats);
      
      return res.status(200).json(stats);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('❌ Prediction API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// Cleanup expired predictions periodically (in-memory only)
if (!useKV) {
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
      console.log(`🧹 Cleaned ${cleaned} expired predictions from memory`);
    }
  }, 60000);
  
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
    
    console.log('🧹 Cleaned old prediction history from memory');
  }, 86400000);
}
