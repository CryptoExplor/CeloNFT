// api/test-notification.js
// Manual test endpoint for notifications

export const runtime = 'nodejs';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { testFid } = req.body;
    
    if (!testFid) {
      return res.status(400).json({ error: 'testFid required' });
    }

    const apiKey = process.env.NEYNAR_API_KEY;
    const miniAppUrl = process.env.MINIAPP_URL || 'https://celo-nft-phi.vercel.app/';

    if (!apiKey) {
      throw new Error('NEYNAR_API_KEY is not configured');
    }

    const notificationUuid = `test-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const payload = {
      target_fids: [Number(testFid)],
      notification: {
        title: '🧪 Test Notification',
        body: 'If you see this, notifications are working! 🎉',
        target_url: miniAppUrl,
        uuid: notificationUuid
      }
    };

    console.log('Sending test notification:', payload);

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
        `Neynar API error: ${response.status} - ${errorBody}`
      );
    }

    const data = await response.json();

    console.log('Test notification response:', data);

    return res.json({
      success: true,
      message: 'Test notification sent',
      deliveries: data.notification_deliveries,
      notificationUuid
    });

  } catch (err) {
    console.error('Test notification error:', err);
    return res.status(500).json({
      error: 'Failed to send test notification',
      message: err.message || 'Unknown error'
    });
  }
}
