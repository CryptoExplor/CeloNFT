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
    
    // Parse query parameters from request
    const queryParams = new URLSearchParams(req.url.split('?')[1] || '');
    const module = queryParams.get('module');
    const action = queryParams.get('action');
    
    console.log(`📡 API Request: module=${module}, action=${action}`);
    
    // ✅ NEW: Etherscan API V2 unified endpoint
    const etherscanV2BaseUrl = 'https://api.etherscan.io/v2/api';
    const celoscanUrl = new URL(etherscanV2BaseUrl);
    
    // ✅ CRITICAL: Add chainid for Celo network (42220)
    celoscanUrl.searchParams.append('chainid', '42220');
    
    // Copy all query parameters (except chainid which we already added)
    for (const [key, value] of queryParams.entries()) {
      if (key !== 'chainid' && key !== 'apikey') {
        celoscanUrl.searchParams.append(key, value);
      }
    }
    
    // Add the API key last
    if (apiKey) {
      celoscanUrl.searchParams.append('apikey', apiKey);
    }
    
    const urlString = celoscanUrl.toString();
    console.log('✅ Fetching from Etherscan V2 (Celo):', 
      urlString.replace(apiKey || '', 'REDACTED'));
    
    // Make the request to Etherscan V2 API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
    
    const response = await fetch(urlString, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ HTTP Error ${response.status}:`, errorText);
      throw new Error(`Etherscan V2 API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Enhanced error checking
    if (data.status === '0' && data.message === 'NOTOK') {
      console.error('❌ API Error:', data.result);
      
      // Check for specific error types
      if (data.result && typeof data.result === 'string') {
        if (data.result.toLowerCase().includes('deprecated')) {
          console.error('❌ CRITICAL: Endpoint deprecated!');
        } else if (data.result.toLowerCase().includes('invalid')) {
          console.error('❌ Invalid parameters:', data.result);
        } else if (data.result.toLowerCase().includes('rate limit')) {
          console.error('⚠️ Rate limit exceeded');
        } else if (data.result.toLowerCase().includes('no transactions found')) {
          console.log('ℹ️ No transactions found for this query');
        }
      }
    } else if (data.status === '1') {
      const resultCount = Array.isArray(data.result) ? data.result.length : 'single result';
      console.log(`✅ API Success: ${resultCount}`);
    }
    
    // Return the response
    return res.status(200).json(data);
    
  } catch (error) {
    console.error('Celoscan/Etherscan V2 API error:', error);
    
    // Handle specific error types
    if (error.name === 'AbortError') {
      return res.status(504).json({ 
        error: 'Request timeout',
        message: 'The API request took too long to respond',
        status: '0',
        result: []
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to fetch from Celoscan API', 
      message: error.message,
      status: '0',
      result: []
    });
  }
}
