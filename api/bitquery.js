// api/bitquery.js - Bitquery GraphQL API proxy for Celo NFT data
// More reliable alternative to Celoscan

export default async function handler(req, res) {
  // CORS headers
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
    const apiKey = process.env.BITQUERY_API_KEY;
    
    if (!apiKey) {
      console.warn('⚠️ BITQUERY_API_KEY not configured');
      return res.status(500).json({ error: 'Bitquery API key not configured' });
    }
    
    const { contractAddress } = req.body;
    
    if (!contractAddress) {
      return res.status(400).json({ error: 'Contract address is required' });
    }
    
    console.log('📡 Fetching NFT transfers from Bitquery for:', contractAddress);
    
    // GraphQL query for all ERC721 transfers
    const query = `
    {
      ethereum(network: celo_mainnet) {
        transfers(
          options: {asc: "block.height", limit: 10000}
          smartContractEvent: {is: "Transfer"}
          any: [
            {currency: {isERC721: true}},
            {currency: {isERC1155: true}}
          ]
          where: {address: {is: "${contractAddress.toLowerCase()}"}}
        ) {
          block {
            height
            timestamp {
              iso8601
            }
          }
          transaction {
            hash
          }
          sender {
            address
          }
          receiver {
            address
          }
          tokenId
        }
      }
    }`;
    
    const response = await fetch("https://graphql.bitquery.io/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey
      },
      body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Bitquery API error ${response.status}:`, errorText);
      throw new Error(`Bitquery API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.errors) {
      console.error('❌ GraphQL errors:', data.errors);
      return res.status(500).json({ error: 'GraphQL query failed', details: data.errors });
    }
    
    const transfers = data.data?.ethereum?.transfers || [];
    console.log(`✅ Bitquery returned ${transfers.length} transfer events`);
    
    return res.status(200).json({
      success: true,
      transfers: transfers,
      count: transfers.length
    });
    
  } catch (error) {
    console.error('Bitquery API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch from Bitquery API', 
      message: error.message
    });
  }
}
