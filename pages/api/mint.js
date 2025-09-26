import { kv } from "@vercel/kv";

// --- Rarity and Color Generation ---
function getRandomTrait(type) {
  const rand = Math.random();
  if (type === 'rarity') {
    if (rand < 0.05) {
      return "Legendary"; // 5% chance
    }
    if (rand < 0.20) {
      return "Rare"; // 15% chance
    }
    return "Common"; // 80% chance
  }
  if (type === 'color') {
    const colors = ["Gold", "Silver", "Bronze", "Emerald", "Ruby", "Sapphire"];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

export default async function handler(req, res) {
  // Add CORS headers to allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: "Method Not Allowed"
    });
  }

  const {
    tokenId
  } = req.body;

  if (!tokenId) {
    return res.status(400).json({
      error: "tokenId is required"
    });
  }

  try {
    // Generate random traits for the new NFT
    const traits = {
      rarity: getRandomTrait('rarity'),
      color: getRandomTrait('color'),
    };

    // Store the traits in Vercel KV with the NFT's token ID as the key
    await kv.set(`nft:${tokenId}`, JSON.stringify(traits));

    // Return the generated traits to the client
    res.status(200).json({
      traits
    });
  } catch (error) {
    console.error("Mint API error:", error);
    res.status(500).json({
      error: "Failed to generate and store NFT traits."
    });
  }
}
