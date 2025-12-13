// api/celoscan.js - Fixed Etherscan V2 with proper error handling
// Replace your entire api/celoscan.js file with this

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
      console.warn('⚠️ CELOSCAN_API_KEY not configured - API may not work without key');
      // Return empty result instead of failing
      return res.status(200).json({
        status: '0',
        message: 'NOTOK',
        result: 'API key required'
      });
    }
    
    // Parse query parameters from request
    const queryParams = new URLSearchParams(req.url.split('?')[1] || '');
    const module = queryParams.get('module');
    const action = queryParams.get('action');
    
    console.log(`📡 Etherscan V2 API Request: module=${module}, action=${action}`);
    
    // ✅ Etherscan V2 unified endpoint
    const etherscanV2BaseUrl = 'https://api.etherscan.io/v2/api';
    const etherscanUrl = new URL(etherscanV2BaseUrl);
    
    // ✅ CRITICAL: Add chainid for Celo network (42220)
    etherscanUrl.searchParams.append('chainid', '42220');
    
    // Copy all query parameters (except chainid and apikey)
    for (const [key, value] of queryParams.entries()) {
      if (key !== 'chainid' && key !== 'apikey') {
        etherscanUrl.searchParams.append(key, value);
      }
    }
    
    // Add the API key
    etherscanUrl.searchParams.append('apikey', apiKey);
    
    const urlString = etherscanUrl.toString();
    console.log('✅ Fetching from Etherscan V2 (Celo):', 
      urlString.replace(apiKey, 'REDACTED'));
    
    // Make the request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
    
    const response = await fetch(urlString, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; CeloNFT/1.0)'
      }
    });
    
    clearTimeout(timeoutId);
    
    console.log(`📥 Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ HTTP Error ${response.status}:`, errorText);
      
      // Return structured error instead of throwing
      return res.status(200).json({
        status: '0',
        message: 'NOTOK',
        result: `HTTP ${response.status}: ${response.statusText}`
      });
    }
    
    const data = await response.json();
    
    console.log('📊 API Response:', {
      status: data.status,
      message: data.message,
      resultType: Array.isArray(data.result) ? 'array' : typeof data.result,
      resultLength: Array.isArray(data.result) ? data.result.length : 'N/A'
    });
    
    // Enhanced error checking
    if (data.status === '0' && data.message === 'NOTOK') {
      console.error('❌ API Error:', data.result);
      
      // Check for specific error types
      if (data.result && typeof data.result === 'string') {
        if (data.result.toLowerCase().includes('invalid')) {
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
    console.error('❌ Etherscan V2 API error:', error);
    console.error('Error stack:', error.stack);
    
    // Handle specific error types
    if (error.name === 'AbortError') {
      return res.status(200).json({ 
        error: 'Request timeout',
        message: 'The API request took too long to respond',
        status: '0',
        result: []
      });
    }
    
    // Return structured error response
    return res.status(200).json({ 
      error: 'Failed to fetch from Etherscan V2 API', 
      message: error.message,
      status: '0',
      result: []
    });
  }
}
