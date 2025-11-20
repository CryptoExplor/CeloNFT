// Price Prediction Game API with Vercel KV (Redis) support
// FIXED: Consistent key format, proper KV storage, win streak tracking

import { randomUUID } from 'crypto';   // ← Node.js built-in, works on Vercel

let kv = null;
let useKV = false;

// Try to import Vercel KV
try {
  const kvModule = await import('@vercel/kv');
  kv = kvModule.kv;
  useKV = true;
  console.log('✅ Vercel KV module loaded successfully');
  console.log('📋 KV client type:', typeof kv);
} catch (e) {
  console.error('❌ Failed to load Vercel KV module:', e.message);
  console.log('⚠️ Using in-memory storage (not persistent across serverless instances)');
  useKV = false;
}

// Fallback in-memory storage
const predictions = new Map();
const predictionHistory = new Map();
const userStats = new Map();

const PREDICTION_WINDOW = 60000; // 1 minute
const MAX_PREDICTIONS_PER_HOUR = 10;
const PREDICTION_TTL = 300; // 5 minutes in seconds
const STATS_TTL = 2592000; // 30 days in seconds
const HISTORY_TTL = 3600; // 1 hour in seconds

// ===== KV STORAGE HELPERS =====

async function storePrediction(key, data) {
  if (useKV) {
    try {
      const dataString = JSON.stringify(data);
      console.log(`🔑 Storing prediction - Key: ${key}`);
      console.log(`📦 Data:`, data);
      
      await kv.set(key, dataString, { ex: PREDICTION_TTL });
      console.log(`✅ KV set() completed`);
      
      // Verify
      await new Promise(resolve => setTimeout(resolve, 50));
      const verify = await kv.get(key);
      
      if (verify) {
        console.log(`✅ Verified: Prediction stored in KV`);
        return true;
      } else {
        console.error(`❌ KV verification FAILED - data not found after write!`);
        predictions.set(key, data); // Fallback
        return false;
      }
    } catch (error) {
      console.error(`❌ KV storage error:`, error.message);
      predictions.set(key, data); // Fallback
      return false;
    }
  } else {
    predictions.set(key, data);
    console.log(`📝 Stored in memory: ${key}`);
    return true;
  }
}

async function getPrediction(key) {
  if (useKV) {
    try {
      console.log(`🔍 Looking up prediction: ${key}`);
      const data = await kv.get(key);
      
      if (data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        console.log(`✅ Found in KV:`, parsed);
        return parsed;
      } else {
        console.log(`❌ NOT FOUND in KV`);
        return null;
      }
    } catch (error) {
      console.error(`❌ KV read error:`, error.message);
      return predictions.get(key) || null;
    }
  } else {
    const data = predictions.get(key);
    console.log(`🔍 Memory lookup: ${key} - ${data ? 'FOUND' : 'NOT FOUND'}`);
    return data || null;
  }
}

async function deletePrediction(key) {
  if (useKV) {
    try {
      await kv.del(key);
      console.log(`🗑️ Deleted from KV: ${key}`);
    } catch (error) {
      console.error(`❌ KV delete error:`, error.message);
    }
  } else {
    predictions.delete(key);
    console.log(`🗑️ Deleted from memory: ${key}`);
  }
}

async function getUserStats(address) {
  const statsKey = `stats_${address.toLowerCase()}`;
  
  if (useKV) {
    try {
      const data = await kv.get(statsKey);
      if (data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        console.log(`📊 Stats loaded from KV:`, parsed);
        return parsed;
      }
    } catch (error) {
      console.error(`❌ Error reading stats:`, error.message);
    }
  } else {
    const data = userStats.get(address.toLowerCase());
    if (data) return data;
  }
  
  // Default stats
  return {
    totalPredictions: 0,
    correctPredictions: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastPredictionCorrect: false
  };
}

async function setUserStats(address, stats) {
  const statsKey = `stats_${address.toLowerCase()}`;
  
  // Validate stats
  const validStats = {
    totalPredictions: parseInt(stats.totalPredictions) || 0,
    correctPredictions: parseInt(stats.correctPredictions) || 0,
    currentStreak: parseInt(stats.currentStreak) || 0,
    bestStreak: parseInt(stats.bestStreak) || 0,
    lastPredictionCorrect: Boolean(stats.lastPredictionCorrect)
  };
  
  if (useKV) {
    try {
      await kv.set(statsKey, JSON.stringify(validStats), { ex: STATS_TTL });
      console.log(`✅ Stats saved to KV:`, validStats);
      
      // Verify
      const verify = await kv.get(statsKey);
      if (verify) {
        console.log(`✅ Stats verified in KV`);
      }
    } catch (error) {
      console.error(`❌ Error saving stats:`, error.message);
      userStats.set(address.toLowerCase(), validStats);
    }
  } else {
    userStats.set(address.toLowerCase(), validStats);
    console.log(`📝 Stats saved to memory:`, validStats);
  }
}

async function getUserHistory(address) {
  const historyKey = `history_${address.toLowerCase()}`;
  
  if (useKV) {
    try {
      const data = await kv.get(historyKey);
      if (data) {
        return typeof data === 'string' ? JSON.parse(data) : data;
      }
    } catch (error) {
      console.error(`❌ Error reading history:`, error.message);
    }
  } else {
    const data = predictionHistory.get(address.toLowerCase());
    if (data) return data;
  }
  
  return [];
}

async function setUserHistory(address, history) {
  const historyKey = `history_${address.toLowerCase()}`;
  
  if (useKV) {
    try {
      await kv.set(historyKey, JSON.stringify(history), { ex: HISTORY_TTL });
    } catch (error) {
      console.error(`❌ Error saving history:`, error.message);
      predictionHistory.set(address.toLowerCase(), history);
    }
  } else {
    predictionHistory.set(address.toLowerCase(), history);
  }
}

// ===== API HANDLER =====

export default async function handler(req, res) {
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
      
      if (!userAddress || !currentPrice || !prediction || !timestamp) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      
      // Rate limiting
      const userHistory = await getUserHistory(userAddress);
      const recentPredictions = userHistory.filter(t => Date.now() - t < 3600000);
      
      if (recentPredictions.length >= MAX_PREDICTIONS_PER_HOUR) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Max ${MAX_PREDICTIONS_PER_HOUR} predictions per hour`
        });
      }
      
      // CRITICAL: Use short unique ID instead of timestamp
      const predictionId = randomUUID().replace(/-/g, '').slice(0, 12); // 12-char safe string
      const predictionKey = `pred_${userAddress.toLowerCase()}_${predictionId}`;

      const predictionData = {
        userAddress: userAddress.toLowerCase(),
        currentPrice: parseFloat(currentPrice),
        prediction,
        timestamp: parseInt(timestamp),           // still store original timestamp for display
        predictionId,                              // ← add this
        expiresAt: parseInt(timestamp) + PREDICTION_WINDOW,
        storedAt: Date.now()
      };
      
      console.log(`\n📊 NEW PREDICTION RECEIVED`);
      console.log(`User: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);
      console.log(`Price: $${currentPrice}`);
      console.log(`Prediction: ${prediction.toUpperCase()}`);
      console.log(`Key: ${predictionKey}`);
      console.log(`Storage: ${useKV ? 'KV (Persistent)' : 'Memory (Lost on restart)'}`);
      
      const stored = await storePrediction(predictionKey, predictionData);
      
      if (!stored && useKV) {
        console.warn('⚠️ KV storage failed, using memory fallback');
      }
      
      // Update history
      userHistory.push(timestamp);
      await setUserHistory(userAddress, userHistory);
      
      return res.status(200).json({
        success: true,
        message: 'Prediction recorded',
        predictionId,                  // ← THIS IS NEW
        expiresAt: timestamp + PREDICTION_WINDOW,
        storage: useKV ? 'kv' : 'memory',
        // key: predictionKey         // optional, you can remove for security
      });
    }
    
    // ===== VERIFY PREDICTION =====
    if (req.method === 'POST' && req.body.action === 'verify') {
      try {
        // OLD:
        // const { userAddress, timestamp, newPrice } = req.body;
        // NEW – require predictionId instead of timestamp
        const { userAddress, predictionId, newPrice } = req.body;

        // OLD:
        // if (!userAddress || !timestamp || !newPrice) {
        //   return res.status(400).json({
        //     error: 'Missing required fields',
        //     correct: false,
        //     multiplier: 0
        //   });
        // }
        // NEW – require predictionId instead of timestamp
        if (!userAddress || !predictionId || !newPrice) {
          return res.status(400).json({ 
            error: 'Missing required fields (need predictionId)', 
            correct: false,
            multiplier: 0
          });
        }
        
        // OLD:
        // const predictionKey = `pred_${userAddress.toLowerCase()}_${timestamp}`;
        // NEW – require predictionId instead of timestamp
        const predictionKey = `pred_${userAddress.toLowerCase()}_${predictionId}`;
        
        console.log(`\n🔍 VERIFYING PREDICTION`);
        console.log(`User: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);
        console.log(`Key: ${predictionKey}`);
        console.log(`Storage: ${useKV ? 'KV' : 'Memory'}`);
        
        const prediction = await getPrediction(predictionKey);
        
        if (!prediction) {
          console.error(`❌ PREDICTION NOT FOUND!`);
          console.log(`Possible reasons:`);
          console.log(`1. Prediction was never stored (check POST /predict logs)`);
          console.log(`2. Key mismatch (storage vs lookup)`);
          console.log(`3. TTL expired (${PREDICTION_TTL}s)`);
          console.log(`4. Serverless instance restart (memory lost)`);
          
          return res.status(404).json({
            error: 'Prediction not found or expired',
            correct: false,
            multiplier: 0,
            debug: {
              key: predictionKey,
              storage: useKV ? 'kv' : 'memory',
              // timestamp: timestamp,
              ttl: PREDICTION_TTL
            }
          });
        }
        
        // Check expiration
        const gracePeriod = 10000;
        if (Date.now() > prediction.expiresAt + gracePeriod) {
          console.warn(`⚠️ Prediction expired`);
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
        
        console.log(`📊 PRICE ANALYSIS:`);
        console.log(`Start: $${prediction.currentPrice}`);
        console.log(`End: $${newPrice}`);
        console.log(`Change: ${priceChange > 0 ? '+' : ''}$${priceChange.toFixed(6)}`);
        console.log(`Predicted: ${prediction.prediction.toUpperCase()}`);
        console.log(`Result: ${correct ? '✅ CORRECT' : '❌ WRONG'}`);
        
        // Update stats with streak tracking
        const stats = await getUserStats(userAddress);
        
        console.log(`📊 STATS BEFORE:`, stats);
        
        stats.totalPredictions++;
        
        if (correct) {
          stats.correctPredictions++;
          
          if (stats.lastPredictionCorrect) {
            stats.currentStreak++;
            console.log(`🔥 STREAK CONTINUES: ${stats.currentStreak}!`);
          } else {
            stats.currentStreak = 1;
            console.log(`🆕 NEW STREAK STARTED: 1`);
          }
          
          stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
          stats.lastPredictionCorrect = true;
        } else {
          console.log(`💔 STREAK BROKEN (was ${stats.currentStreak})`);
          stats.currentStreak = 0;
          stats.lastPredictionCorrect = false;
        }
        
        console.log(`📊 STATS AFTER:`, stats);
        
        // Save stats
        await setUserStats(userAddress, stats);
        
        // Clean up
        await deletePrediction(predictionKey);
        
        const winRate = ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1);
        
        console.log(`\n✅ VERIFICATION COMPLETE`);
        console.log(`Win Rate: ${winRate}%`);
        console.log(`Current Streak: ${stats.currentStreak} 🔥`);
        console.log(`Best Streak: ${stats.bestStreak} 🏆\n`);
        
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
        console.error('❌ Verification error:', verifyError);
        return res.status(500).json({
          error: 'Failed to verify prediction',
          message: verifyError.message,
          correct: false,
          multiplier: 0
        });
      }
    }
    
    // ===== GET USER STATS =====
    if (req.method === 'GET') {
      const { userAddress } = req.query;
      
      if (!userAddress) {
        return res.status(400).json({ error: 'Missing userAddress' });
      }
      
      const stats = await getUserStats(userAddress);
      stats.winRate = stats.totalPredictions > 0 
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : '0';
      
      return res.status(200).json(stats);
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('❌ API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// Cleanup for in-memory storage
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
}
