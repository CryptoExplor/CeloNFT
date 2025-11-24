// api/notification.js – Option A (Neynar Frame Notifications)
// Sends real Farcaster Mini App notifications via Neynar's /frame/notifications API
// and tracks per-FID state in Vercel KV (with an in-memory fallback).

export const runtime = 'nodejs';

let kv;
let useKV = false;

try {
  const { kv: vercelKv } = require('@vercel/kv');
  kv = vercelKv;
  useKV = true;
  console.log('✅ KV loaded for notifications');
} catch (e) {
  console.warn('⚠️ KV not available for notifications - using memory fallback only');
  useKV = false;
}

// Simple in-memory fallback (non-persistent, but keeps local dev working)
const memoryUsers = new Map(); // key -> user object
const memoryUserSet = new Set(); // set of fid strings

// ---- Helper: KV-backed JSON set/get for users ----

const USER_KEY_PREFIX = 'notif_user_';
const USER_SET_KEY = 'notif_users';

function userKey(fid) {
  return `${USER_KEY_PREFIX}${fid}`;
}

async function saveUser(user) {
  const key = userKey(user.fid);
  // Persist to KV if available
  if (useKV && kv) {
    try {
      await kv.set(key, JSON.stringify(user));
      await kv.sadd(USER_SET_KEY, String(user.fid));
    } catch (e) {
      console.error('KV saveUser failed:', e.message || e);
    }
  }
  // Always mirror in memory
  memoryUsers.set(key, user);
  memoryUserSet.add(String(user.fid));
}

async function loadUser(fid) {
  const key = userKey(fid);

  // Try KV
  if (useKV && kv) {
    try {
      const raw = await kv.get(key);
      if (raw) {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    } catch (e) {
      console.error('KV loadUser failed:', e.message || e);
    }
  }

  // Fallback to memory
  const user = memoryUsers.get(key);
  return user || null;
}

async function getRegisteredFids() {
  if (useKV && kv) {
    try {
      const fids = await kv.smembers(USER_SET_KEY); // array of strings
      return (fids || [])
        .map((f) => Number(f))
        .filter((n) => Number.isInteger(n) && n > 0);
    } catch (e) {
      console.error('KV smembers failed:', e.message || e);
    }
  }

  // Memory fallback
  return Array.from(memoryUserSet)
    .map((f) => Number(f))
    .filter((n) => Number.isInteger(n) && n > 0);
}

// ---- Notification content ----

const NOTIFICATION_MESSAGES = [
  {
    id: 'daily-mint',
    title: '🎨 Daily NFT Mint Time!',
    body: 'CELO price is moving! Mint an NFT with live price snapshot and get instant airdrop today! 💰'
  },
  {
    id: 'daily-airdrop',
    title: '💰 Your Daily Airdrop Awaits!',
    body: 'Mint a CELO NFT now → Get instant airdrop + predict price for 2x bonus! 🎯'
  },
  {
    id: 'prediction-challenge',
    title: '📈 Price Prediction Challenge!',
    body: 'Will CELO go UP or DOWN in 60 seconds? Predict correctly and double your airdrop! 🚀'
  },
  {
    id: 'lucky-numbers',
    title: '🍀 Lucky Numbers Alert!',
    body: 'Today might be your lucky day! Some tokens give 2x–4x airdrop bonuses. Try your luck! ✨'
  },
  {
    id: 'free-daily-mint',
    title: '🎁 Free Daily Mint + Rewards!',
    body: "Don't miss today’s free NFT mint with instant CELO airdrop. Claim yours now! 🎉"
  }
];

function pickRandomMessage() {
  const idx = Math.floor(Math.random() * NOTIFICATION_MESSAGES.length);
  return NOTIFICATION_MESSAGES[idx];
}

// ---- Neynar Frame Notifications sender (Option A core) ----

async function sendMiniAppNotificationsToFids(targetFids, message, uuid) {
  const apiKey = process.env.NEYNAR_API_KEY;
  const miniAppUrl =
    process.env.MINIAPP_URL || 'https://celo-nft-phi.vercel.app/';

  if (!apiKey) {
    throw new Error('NEYNAR_API_KEY is not configured');
  }

  if (!Array.isArray(targetFids)) {
    throw new Error('targetFids must be an array');
  }

  // Per Neynar docs, max 100 fids per call
  // We will enforce that at the caller level, but assert here as well.
  if (targetFids.length > 100) {
    throw new Error('targetFids length must be <= 100');
  }

  const notificationUuid =
    uuid ||
    (globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `celo-nft-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const payload = {
    target_fids: targetFids,
    // You can add filters here if needed (e.g. minimum_user_score, location, etc.)
    // filters: { minimum_user_score: 0.0 },
    notification: {
      title: message.title,
      body: message.body,
      target_url: miniAppUrl,
      uuid: notificationUuid
    }
  };

  const response = await fetch(
    'https://api.neynar.com/v2/farcaster/frame/notifications/',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch (_) {}
    throw new Error(
      `Neynar notifications API error: ${response.status} - ${errorBody}`
    );
  }

  const data = await response.json();

  const deliveries = Array.isArray(data.notification_deliveries)
    ? data.notification_deliveries
    : [];

  const successfulFids = deliveries
    .filter((d) => d.status === 'success')
    .map((d) => d.fid);

  return { successfulFids, deliveries };
}

// ---- Main API handler ----

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-vercel-cron, x-cron-secret'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // ===== AUTO-REGISTER USER (called from main.js on app load) =====
    if (req.method === 'POST' && req.body?.action === 'register') {
      const { fid, username } = req.body;

      const fidNum = Number(fid);
      if (!fidNum || !Number.isInteger(fidNum) || fidNum <= 0) {
        return res.status(400).json({ error: 'Invalid fid' });
      }

      const existingUser = await loadUser(fidNum);

      if (!existingUser) {
        const now = Date.now();
        const userData = {
          fid: fidNum,
          username: username || `User ${fidNum}`,
          registeredAt: now,
          lastNotification: null,
          enabled: true,
          totalNotificationsSent: 0
        };

        await saveUser(userData);

        console.log(
          `✅ Auto-registered user ${fidNum} (${userData.username}) for notifications`
        );

        return res.json({
          success: true,
          message: 'Registered for daily reminders',
          isNew: true
        });
      } else {
        // Optionally refresh username
        if (username && existingUser.username !== username) {
          existingUser.username = username;
          await saveUser(existingUser);
        }

        console.log(`ℹ️ User ${fidNum} already registered`);
        return res.json({
          success: true,
          message: 'Already registered',
          isNew: false
        });
      }
    }

    // ===== ENABLE / DISABLE USER (unsubscribe / resubscribe) =====
    if (req.method === 'POST' && req.body?.action === 'setEnabled') {
      const { fid, enabled } = req.body;
      const fidNum = Number(fid);

      if (!fidNum || !Number.isInteger(fidNum) || fidNum <= 0) {
        return res.status(400).json({ error: 'Invalid fid' });
      }

      const user = (await loadUser(fidNum)) || {
        fid: fidNum,
        username: `User ${fidNum}`,
        registeredAt: Date.now(),
        lastNotification: null,
        totalNotificationsSent: 0
      };

      user.enabled = Boolean(enabled);
      await saveUser(user);

      console.log(
        `${user.enabled ? '✅ Enabled' : '🚫 Disabled'} notifications for ${fidNum}`
      );

      return res.json({
        success: true,
        enabled: user.enabled
      });
    }

    // ===== SEND DAILY NOTIFICATIONS (Cron job via Neynar) =====
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    const isSendDaily =
      req.method === 'POST' && req.body?.action === 'sendDaily';

    if (isVercelCron || isSendDaily) {
      // Authorization: Vercel scheduled cron OR signed manual trigger
      if (!isVercelCron) {
        const cronSecret = req.headers['x-cron-secret'];
        if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
          console.error('❌ Unauthorized cron request');
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }

      console.log('🔔 Starting daily Neynar notification batch...');

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      const allFids = await getRegisteredFids();
      console.log(`📊 Found ${allFids.length} registered users`);

      const eligibleFids = [];
      const userCache = new Map(); // fid -> user object

      // Filter by user.enabled and lastNotification < 24h
      for (const fidNum of allFids) {
        try {
          const user = await loadUser(fidNum);
          if (!user) continue;
          userCache.set(fidNum, user);

          if (user.enabled === false) {
            continue;
          }

          if (user.lastNotification && user.lastNotification > oneDayAgo) {
            continue;
          }

          eligibleFids.push(fidNum);
        } catch (e) {
          console.error(`💥 Error loading user ${fidNum}:`, e);
        }
      }

      console.log(`✅ Eligible users for today: ${eligibleFids.length}`);

      if (eligibleFids.length === 0) {
        const summary = {
          success: true,
          sent: 0,
          skipped: allFids.length,
          errors: 0,
          total: allFids.length,
          timestamp: new Date().toISOString(),
          message: 'No eligible users for daily notification'
        };
        console.log('📧 Daily notification batch complete:', summary);
        return res.json(summary);
      }

      const message = pickRandomMessage();
      const todayStr = new Date().toISOString().slice(0, 10);
      const baseUuid = `celo-nft-daily-${todayStr}-${message.id}`;

      const batchSize = 100; // Neynar limit per call
      let sentCount = 0;
      let errorCount = 0;

      for (let i = 0; i < eligibleFids.length; i += batchSize) {
        const batchFids = eligibleFids.slice(i, i + batchSize);
        const batchUuid = `${baseUuid}-batch-${Math.floor(i / batchSize)}`;

        try {
          const { successfulFids } = await sendMiniAppNotificationsToFids(
            batchFids,
            message,
            batchUuid
          );

          // Update per-user metadata for successfully notified fids
          for (const fid of successfulFids) {
            const user =
              userCache.get(fid) || (await loadUser(fid)) || {
                fid,
                username: `User ${fid}`,
                registeredAt: now,
                totalNotificationsSent: 0,
                enabled: true
              };

            user.lastNotification = now;
            user.totalNotificationsSent =
              (user.totalNotificationsSent || 0) + 1;

            await saveUser(user);
          }

          sentCount += successfulFids.length;
          console.log(
            `📨 Sent batch to ${batchFids.length} fids (success: ${successfulFids.length})`
          );
        } catch (e) {
          errorCount++;
          console.error(
            `❌ Neynar notifications API failed for batch starting at index ${i}:`,
            e.message || e
          );
        }
      }

      const summary = {
        success: true,
        sent: sentCount,
        skipped: allFids.length - sentCount,
        errors: errorCount,
        total: allFids.length,
        timestamp: new Date().toISOString(),
        notificationTitle: message.title
      };

      console.log('📧 Daily notification batch complete:', summary);
      return res.json(summary);
    }

    // ===== GET USER STATUS =====
    if (req.method === 'GET' && req.query.fid) {
      const fid = Array.isArray(req.query.fid) ? req.query.fid[0] : req.query.fid;
      const fidNum = Number(fid);
      if (!fidNum || !Number.isInteger(fidNum) || fidNum <= 0) {
        return res.status(400).json({ error: 'Invalid fid' });
      }

      const userData = await loadUser(fidNum);

      return res.json({
        registered: !!userData,
        enabled: userData ? userData.enabled !== false : false,
        lastNotification: userData ? userData.lastNotification : null,
        totalSent: userData ? userData.totalNotificationsSent || 0 : 0
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('💥 Notification API error:', err);
    return res
      .status(500)
      .json({ error: 'Server error', message: err.message || 'Unknown error' });
  }
}
