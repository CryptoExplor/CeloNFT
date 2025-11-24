// api/notification.js - FIXED VERSION
// Auto-subscribe all users who add the miniapp to Farcaster notifications

export const runtime = 'nodejs';

let kv;
let useKV = false;

try {
  const { kv: vercelKv } = require('@vercel/kv');
  kv = vercelKv;
  useKV = true;
  console.log('✅ KV loaded for notifications');
} catch (e) {
  console.warn('⚠️ KV not available for notifications - using memory fallback');
  useKV = false;
}

const memory = new Map();

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

async function getAllKeys(pattern) {
  const keys = [];
  if (useKV) {
    try {
      const allKeys = await kv.keys(pattern);
      return allKeys;
    } catch (e) {
      console.error('KV keys fetch failed:', e);
    }
  }
  // Fallback to memory
  for (const [key] of memory.entries()) {
    if (key.startsWith(pattern.replace('*', ''))) {
      keys.push(key);
    }
  }
  return keys;
}

const NOTIFICATION_MESSAGES = [
  {
    title: "🎨 Daily NFT Mint Time!",
    body: "CELO price is moving! Mint an NFT with live price snapshot and get instant airdrop today! 💰"
  },
  {
    title: "💰 Your Daily Airdrop Awaits!",
    body: "Mint a CELO NFT now → Get instant airdrop + predict price for 2x bonus! 🎯"
  },
  {
    title: "📈 Price Prediction Challenge!",
    body: "Will CELO go UP or DOWN in 60 seconds? Predict correctly and double your airdrop! 🚀"
  },
  {
    title: "🍀 Lucky Numbers Alert!",
    body: "Today might be your lucky day! Some tokens give 2x-4x airdrop bonuses. Try your luck! ✨"
  },
  {
    title: "🎁 Free Daily Mint + Rewards!",
    body: "Don't miss today's free NFT mint with instant CELO airdrop. Claim yours now! 🎉"
  }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-vercel-cron');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // ===== AUTO-REGISTER USER (Called from main.js on app load) =====
    if (req.method === 'POST' && req.body?.action === 'register') {
      const { fid, username } = req.body;

      if (!fid) {
        return res.status(400).json({ error: 'Missing fid' });
      }

      const userKey = `notif_user_${fid}`;
      const existingUser = await get(userKey);

      if (!existingUser) {
        const userData = {
          fid,
          username: username || `User ${fid}`,
          registeredAt: Date.now(),
          lastNotification: null,
          enabled: true,
          totalNotificationsSent: 0
        };

        await set(userKey, userData, 365 * 24 * 60 * 60); // 1 year TTL

        console.log(`✅ Auto-registered user ${fid} (${username}) for notifications`);

        return res.json({
          success: true,
          message: 'Registered for daily reminders',
          isNew: true
        });
      } else {
        console.log(`ℹ️ User ${fid} already registered`);
        return res.json({
          success: true,
          message: 'Already registered',
          isNew: false
        });
      }
    }

    // ===== SEND DAILY NOTIFICATIONS (Cron Job) =====
    // FIX: Support both POST with action AND GET with Vercel cron header
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    const isSendDaily = req.method === 'POST' && req.body?.action === 'sendDaily';
    
    if (isVercelCron || isSendDaily) {
      // Verify authorization
      if (!isVercelCron) {
        const cronSecret = req.headers['x-cron-secret'];
        if (cronSecret !== process.env.CRON_SECRET) {
          console.error('❌ Unauthorized cron request');
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }

      console.log('🔔 Starting daily notification batch...');

      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      // Get all registered users
      const userKeys = await getAllKeys('notif_user_*');
      console.log(`📊 Found ${userKeys.length} registered users`);

      let sentCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const userKey of userKeys) {
        try {
          const user = await get(userKey);
          
          if (!user || !user.enabled) {
            skippedCount++;
            continue;
          }

          // Check if already sent notification in last 24 hours
          if (user.lastNotification && user.lastNotification > oneDayAgo) {
            console.log(`⏭️ Skipping ${user.fid} - already notified recently`);
            skippedCount++;
            continue;
          }

          // Pick random message
          const message = NOTIFICATION_MESSAGES[Math.floor(Math.random() * NOTIFICATION_MESSAGES.length)];
          
          // Send notification
          const notifResult = await sendFarcasterNotification(
            user.fid,
            message.title,
            message.body
          );

          if (notifResult.success) {
            // Update user's last notification time
            user.lastNotification = now;
            user.totalNotificationsSent = (user.totalNotificationsSent || 0) + 1;
            await set(userKey, user, 365 * 24 * 60 * 60);
            
            sentCount++;
            console.log(`✅ Sent notification to ${user.fid} (${user.username})`);
          } else {
            errorCount++;
            console.error(`❌ Failed to send to ${user.fid}:`, notifResult.error);
          }

          // Rate limit: wait 500ms between sends
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (e) {
          console.error(`💥 Error processing user ${userKey}:`, e);
          errorCount++;
        }
      }

      const summary = {
        success: true,
        sent: sentCount,
        skipped: skippedCount,
        errors: errorCount,
        total: userKeys.length,
        timestamp: new Date().toISOString()
      };

      console.log('📧 Daily notification batch complete:', summary);

      return res.json(summary);
    }

    // ===== GET USER STATUS =====
    if (req.method === 'GET' && req.query.fid) {
      const { fid } = req.query;

      const userData = await get(`notif_user_${fid}`);

      return res.json({
        registered: !!userData,
        enabled: userData ? userData.enabled : false,
        lastNotification: userData ? userData.lastNotification : null,
        totalSent: userData ? userData.totalNotificationsSent : 0
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('💥 Notification API error:', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
}

// Send notification via Farcaster API
async function sendFarcasterNotification(fid, title, body) {
  try {
    const FARCASTER_API_KEY = process.env.FARCASTER_API_KEY;
    const FARCASTER_SIGNER_UUID = process.env.FARCASTER_SIGNER_UUID;
    
    if (!FARCASTER_API_KEY || !FARCASTER_SIGNER_UUID) {
      throw new Error('FARCASTER_API_KEY or FARCASTER_SIGNER_UUID not configured');
    }

    // Combine title and body for the message
    const message = `${title}\n\n${body}\n\n🎨 Mint now: https://celo-nft-phi.vercel.app/`;

    // Using Neynar API v2
    const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api_key': FARCASTER_API_KEY
      },
      body: JSON.stringify({
        signer_uuid: FARCASTER_SIGNER_UUID,
        text: message,
        parent: {
          fid: fid
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Farcaster API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log(`✅ Notification sent to FID ${fid}:`, data.cast?.hash);

    return { success: true, castHash: data.cast?.hash };
  } catch (error) {
    console.error('❌ Failed to send Farcaster notification:', error);
    return { success: false, error: error.message };
  }
}
