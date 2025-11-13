// Celoscan API Proxy
// Keeps API key secure on backend

const API_KEY = process.env.CELOSCAN_API_KEY || 'X83R8MW5FKH3VM4DR5DY659VZRSTCGHYI5';
const BASE_URL = 'https://api.celoscan.io/api';

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
    const { module, action, contractaddress, page, offset, sort } = req.query;
    
    // Validate required params
    if (!module || !action) {
      return res.status(400).json({
        error: 'Missing required parameters: module, action'
      });
    }
    
    // Build API URL
    const params = new URLSearchParams({
      module,
      action,
      apikey: API_KEY
    });
    
    // Add optional params
    if (contractaddress) params.append('contractaddress', contractaddress);
    if (page) params.append('page', page);
    if (offset) params.append('offset', offset);
    if (sort) params.append('sort', sort);
    
    const apiUrl = `${BASE_URL}?${params.toString()}`;
    
    console.log('Proxying Celoscan API request:', { module, action, contractaddress });
    
    // Fetch from Celoscan
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Celoscan API error: ${response.status}`);
    }
    
    // Return the data
    return res.status(200).json(data);
    
  } catch (error) {
    console.error('Celoscan proxy error:', error);
    return res.status(500).json({
      error: 'Failed to fetch from Celoscan',
      message: error.message
    });
  }
}
