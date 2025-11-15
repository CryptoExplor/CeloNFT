// api/celoscan.js - Vercel Serverless Function Format
// Proxy endpoint for Celoscan API

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
    
    // Build the Celoscan API URL
    const celoscanBaseUrl = 'https://api.celoscan.io/api';
    const celoscanUrl = new URL(celoscanBaseUrl);
    
    // Copy all query parameters from the request
    const queryParams = new URLSearchParams(req.url.split('?')[1] || '');
    for (const [key, value] of queryParams.entries()) {
      celoscanUrl.searchParams.append(key, value);
    }
    
    // Add the API key if available
    if (apiKey) {
      celoscanUrl.searchParams.append('apikey', apiKey);
    }
    
    console.log('Fetching from Celoscan:', celoscanUrl.toString().replace(apiKey || '', 'REDACTED'));
    
    // Make the request to Celoscan API
    const response = await fetch(celoscanUrl.toString());
    
    if (!response.ok) {
      throw new Error(`Celoscan API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Return the response with CORS headers
    return res.status(200).json(data);
  } catch (error) {
    console.error('Celoscan API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch from Celoscan API', 
      message: error.message,
      status: '0',
      result: []
    });
  }
}
