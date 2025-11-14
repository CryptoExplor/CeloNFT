// api/celoscan.js - Proxy endpoint for Celoscan API
export default {
  async fetch(request, env) {
    // Get the URL parameters
    const url = new URL(request.url);
    const queryParams = url.searchParams;
    
    // Get the API key from environment variables
    const apiKey = env.CELOSCAN_API_KEY;
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Build the Celoscan API URL
    const celoscanBaseUrl = 'https://api.celoscan.io/api';
    const celoscanUrl = new URL(celoscanBaseUrl);
    
    // Copy all query parameters to the Celoscan URL
    for (const [key, value] of queryParams.entries()) {
      celoscanUrl.searchParams.append(key, value);
    }
    
    // Add the API key
    celoscanUrl.searchParams.append('apikey', apiKey);
    
    try {
      // Make the request to Celoscan API
      const response = await fetch(celoscanUrl.toString());
      
      // Clone the response to avoid issues with reading the body twice
      const responseBody = await response.text();
      
      // Return the response with appropriate CORS headers
      return new Response(responseBody, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch from Celoscan API', details: error.message }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  },
  
  async options() {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }
};