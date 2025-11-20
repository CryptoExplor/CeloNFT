// ==========================
//  FIXED PRICE PREDICTION API
//  No memory fallback, KV-only
//  100% reliable verification
// ==========================

let kv = null;

// Load KV (required)
try {
  const kvModule = await import('@vercel/kv');
  kv = kvModule.kv;
  console.log("✅ Vercel KV loaded");
} catch (err) {
  console.error("❌ KV load failed:", err);
  throw new Error("Vercel KV is required — cannot start API");
}

// Constants
const PREDICTION_WINDOW = 60000;
const PREDICTION_TTL = 300;
const STATS_TTL = 2592000;
const HISTORY_TTL = 3600;
const MAX_PREDICTIONS_PER_HOUR = 10;

// -------------------------
//  Safe KV wrappers
// -------------------------

async function kvSet(key, value, ttl) {
  const data = JSON.stringify(value);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`📝 KV SET (attempt ${attempt}) →`, key);
      await kv.set(key, data, { ex: ttl });

      // Verify
      const check = await kv.get(key);
      if (check) return true;

      console.warn("⚠️ KV write not visible, retrying...");
    } catch (err) {
      console.error("❌ KV SET ERROR:", err);
    }
  }

  throw new Error("KV write failed after 3 attempts");
}

async function kvGet(key) {
  try {
    const raw = await kv.get(key);
    if (!raw) return null;

    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    console.error("❌ KV GET ERROR:", err);
    return null;
  }
}

async function kvDel(key) {
  try {
    await kv.del(key);
  } catch (err) {
    console.error("❌ KV DEL ERROR:", err);
  }
}

// ----------------------
//  User data helpers
// ----------------------

async function getStats(address) {
  const key = `stats_${address}`;
  const data = await kvGet(key);

  return (
    data || {
      totalPredictions: 0,
      correctPredictions: 0,
      currentStreak: 0,
      bestStreak: 0,
      lastPredictionCorrect: false,
    }
  );
}

async function saveStats(address, stats) {
  await kvSet(`stats_${address}`, stats, STATS_TTL);
}

async function getHistory(address) {
  return (await kvGet(`history_${address}`)) || [];
}

async function saveHistory(address, arr) {
  await kvSet(`history_${address}`, arr, HISTORY_TTL);
}

// ----------------------
//  API HANDLER
// ----------------------

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // ----------------------
  //  STORE PREDICTION
  // ----------------------
  if (req.method === "POST" && req.body.action === "predict") {
    const { userAddress, currentPrice, prediction, timestamp } = req.body;

    if (!userAddress || !currentPrice || !prediction || !timestamp) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const addr = userAddress.toLowerCase();
    const ts = Number(timestamp);

    // Rate limit
    const history = await getHistory(addr);
    const recent = history.filter((t) => Date.now() - t < 3600000);

    if (recent.length >= MAX_PREDICTIONS_PER_HOUR) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        message: `Max ${MAX_PREDICTIONS_PER_HOUR} predictions/hr`,
      });
    }

    const key = `pred_${addr}_${ts}`;
    const payload = {
      userAddress: addr,
      currentPrice: Number(currentPrice),
      prediction,
      timestamp: ts,
      expiresAt: ts + PREDICTION_WINDOW,
      storedAt: Date.now(),
    };

    console.log("🟣 STORE PREDICTION:", key, payload);

    try {
      await kvSet(key, payload, PREDICTION_TTL);
    } catch (err) {
      console.error("❌ Prediction store failed:", err);
      return res.status(500).json({
        error: "Storage failed",
        details: err.message,
      });
    }

    history.push(ts);
    await saveHistory(addr, history);

    return res.status(200).json({
      success: true,
      key,
      expiresAt: payload.expiresAt,
      storage: "kv",
    });
  }

  // ----------------------
  //  VERIFY PREDICTION
  // ----------------------
  if (req.method === "POST" && req.body.action === "verify") {
    const { userAddress, timestamp, newPrice } = req.body;
    if (!userAddress || !timestamp || !newPrice) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const addr = userAddress.toLowerCase();
    const ts = Number(timestamp);
    const key = `pred_${addr}_${ts}`;

    console.log("🟡 VERIFY:", key);

    const stored = await kvGet(key);
    if (!stored) {
      return res.status(404).json({
        error: "Prediction not found",
        key,
      });
    }

    // Expired?
    if (Date.now() > stored.expiresAt + 10000) {
      await kvDel(key);
      return res.status(400).json({ error: "Prediction expired" });
    }

    // Evaluate
    const newP = Number(newPrice);
    const oldP = Number(stored.currentPrice);
    const delta = newP - oldP;

    const wentUp = delta > 0;
    const predictedUp = stored.prediction === "up";

    const correct = wentUp === predictedUp;
    const multiplier = correct ? 2 : 0.5;

    // Stats update
    const stats = await getStats(addr);
    stats.totalPredictions++;

    if (correct) {
      stats.correctPredictions++;
      stats.currentStreak = stats.lastPredictionCorrect
        ? stats.currentStreak + 1
        : 1;

      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
      stats.lastPredictionCorrect = true;
    } else {
      stats.currentStreak = 0;
      stats.lastPredictionCorrect = false;
    }

    await saveStats(addr, stats);
    await kvDel(key);

    const winRate = (
      (stats.correctPredictions / stats.totalPredictions) *
      100
    ).toFixed(1);

    return res.status(200).json({
      success: true,
      correct,
      prediction: stored.prediction,
      startPrice: oldP,
      endPrice: newP,
      priceChange: delta.toFixed(4),
      priceChangePercent: ((delta / oldP) * 100).toFixed(2),
      multiplier,
      stats: {
        ...stats,
        winRate,
      },
    });
  }

  // ----------------------
  //  GET STATS
  // ----------------------
  if (req.method === "GET") {
    const { userAddress } = req.query;
    if (!userAddress) return res.status(400).json({ error: "Missing userAddress" });

    const addr = userAddress.toLowerCase();
    const stats = await getStats(addr);

    const winRate =
      stats.totalPredictions > 0
        ? ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1)
        : "0";

    return res.status(200).json({ ...stats, winRate });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
