// pages/api/mint.js
import { kv } from "@vercel/kv";

function getRandomTrait(type) {
  const rand = Math.random();
  if (type === "rarity") {
    if (rand < 0.05) return "Legendary";
    if (rand < 0.20) return "Rare";
    return "Common";
  }
  if (type === "color") {
    const colors = ["Gold", "Silver", "Bronze", "Emerald", "Ruby", "Sapphire"];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const { tokenId } = req.body;
  if (!tokenId || !/^\d+$/.test(tokenId)) {
    return res.status(400).json({ error: "tokenId is required and must be numeric" });
  }

  try {
    const traits = {
      rarity: getRandomTrait("rarity"),
      color: getRandomTrait("color"),
    };
    await kv.set(`nft:${tokenId}`, JSON.stringify(traits));

    return res.status(200).json({ tokenId, traits });
  } catch (error) {
    console.error("Mint API error:", error);
    return res.status(500).json({ error: "Failed to generate and store NFT traits." });
  }
}
