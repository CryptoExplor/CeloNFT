// api/celoscan.js - Vercel Serverless Function Format
// ✅ MIGRATED TO ETHERSCAN API V2 (August 2025)
// Proxy endpoint for Celoscan API using new unified multichain endpoint

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Get the API key from environment variables
    const apiKey = process.env.CELOSCAN_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️ CELOSCAN_API_KEY not configured - using public endpoint (rate limited)');
    }
    
    // ✅ NEW: Etherscan API V2 unified endpoint
    // Use single API key for all chains with chainid parameter
    const etherscanV2BaseUrl = 'https://api.etherscan.io/v2/api';
    const celoscanUrl = new URL(etherscanV2BaseUrl);
    
    // ✅ CRITICAL: Add chainid for Celo network
    // Celo Mainnet chainid = 42220
    celoscanUrl.searchParams.append('chainid', '42220');
    
    // Copy all query parameters from the request
    const queryParams = new URLSearchParams(req.url.split('?')[1] || '');
    for (const [key, value] of queryParams.entries()) {
      // Skip chainid if already added
      if (key !== 'chainid') {
        celoscanUrl.searchParams.append(key, value);
      }
    }
    
    // Add the API key if available
    if (apiKey) {
      celoscanUrl.searchParams.append('apikey', apiKey);
    }
    
    console.log('✅ Fetching from Etherscan V2 (Celo):', celoscanUrl.toString().replace(apiKey || '', 'REDACTED'));
    
    // Make the request to Etherscan V2 API
    const response = await fetch(celoscanUrl.toString());
    
    if (!response.ok) {
      throw new Error(`Etherscan V2 API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Check for V1 deprecation error
    if (data.status === '0' && data.message === 'NOTOK' && 
        data.result && data.result.includes('deprecated V1 endpoint')) {
      console.error('❌ CRITICAL: Still using V1 endpoint!', data.result);
      throw new Error('API V1 deprecated. Please update to V2.');
    }
    
    // Return the response with CORS headers
    return res.status(200).json(data);
  } catch (error) {
    console.error('Celoscan/Etherscan V2 API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch from Celoscan API', 
      message: error.message,
      status: '0',
      result: []
    });
  }
}
