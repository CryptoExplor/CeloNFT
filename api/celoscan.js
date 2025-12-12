// api/celoscan.js - Updated for Etherscan API V2
// ✅ FULLY COMPATIBLE WITH NEW API (December 2025)

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
    const apiKey = process.env.CELOSCAN_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️ CELOSCAN_API_KEY not configured - using public endpoint (rate limited)');
    }
    
    // ✅ NEW: Etherscan API V2 unified endpoint
    const etherscanV2BaseUrl = 'https://api.etherscan.io/v2/api';
    const celoscanUrl = new URL(etherscanV2BaseUrl);
    
    // ✅ CRITICAL: Add chainid for Celo network
    celoscanUrl.searchParams.append('chainid', '42220');
    
    // Copy all query parameters from the request
    const queryParams = new URLSearchParams(req.url.split('?')[1] || '');
    
    // Log the requested endpoint for debugging
    const module = queryParams.get('module');
    const action = queryParams.get('action');
    console.log(`📡 API Request: module=${module}, action=${action}`);
    
    for (const [key, value] of queryParams.entries()) {
      if (key !== 'chainid') {
        celoscanUrl.searchParams.append(key, value);
      }
    }
    
    // Add the API key if available
    if (apiKey) {
      celoscanUrl.searchParams.append('apikey', apiKey);
    }
    
    console.log('✅ Fetching from Etherscan V2 (Celo):', 
      celoscanUrl.toString().replace(apiKey || '', 'REDACTED'));
    
    // Make the request to Etherscan V2 API
    const response = await fetch(celoscanUrl.toString());
    
    if (!response.ok) {
      throw new Error(`Etherscan V2 API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Enhanced error checking
    if (data.status === '0' && data.message === 'NOTOK') {
      console.error('❌ API Error:', data.result);
      
      // Check for specific error types
      if (data.result && typeof data.result === 'string') {
        if (data.result.includes('deprecated')) {
          console.error('❌ CRITICAL: Endpoint deprecated!');
        } else if (data.result.includes('Invalid')) {
          console.error('❌ Invalid parameters:', data.result);
        } else if (data.result.includes('rate limit')) {
          console.error('⚠️ Rate limit exceeded');
        }
      }
    } else if (data.status === '1') {
      console.log(`✅ API Success: ${Array.isArray(data.result) ? data.result.length : 'OK'} results`);
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
