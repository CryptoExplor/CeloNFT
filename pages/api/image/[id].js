import { kv } from "@vercel/kv";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Initialize Redis
const redis = Redis.fromEnv();

// POST endpoint — fetch Redis data
export const POST = async () => {
  const result = await redis.get("item");
  return new NextResponse(JSON.stringify({ result }), { status: 200 });
};

// GET endpoint — generate NFT image
export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (!id || isNaN(parseInt(id))) {
    return res.status(400).send("Invalid NFT ID.");
  }

  // Fetch NFT traits from Vercel KV
  let traits;
  try {
    const traitsString = await kv.get(`nft:${id}`);
    if (traitsString) {
      traits = JSON.parse(traitsString);
    }
  } catch (error) {
    console.error("KV get error:", error);
    return res.status(500).send("Error retrieving NFT traits.");
  }

  if (!traits) {
    return res.status(404).send("Traits not found — mint first.");
  }

  // Fetch the current price of Celo from CoinGecko
  let price = "N/A";
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=celo&vs_currencies=usd"
    );
    const data = await response.json();
    price = data.celo.usd.toFixed(4);
  } catch (e) {
    console.error("CELO price fetch failed:", e);
  }

  // Fetch Redis data for inclusion in SVG
  let redisData = null;
  try {
    redisData = await redis.get("item");
  } catch (error) {
    console.error("Redis fetch error:", error);
  }

  // Determine animation speed based on rarity
  let speed = "8s";
  if (traits.rarity === "Rare") speed = "5s";
  if (traits.rarity === "Legendary") speed = "2s";

  // Generate SVG
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">
    <defs>
      <linearGradient id="rainbow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="red">
          <animate attributeName="stop-color"
                   values="red;orange;yellow;green;blue;indigo;violet;red"
                   dur="${speed}" repeatCount="indefinite"/>
        </stop>
        <stop offset="100%" stop-color="violet">
          <animate attributeName="stop-color"
                   values="violet;red;orange;yellow;green;blue;indigo;violet"
                   dur="${speed}" repeatCount="indefinite"/>
        </stop>
      </linearGradient>
    </defs>

    <rect width="400" height="400" fill="#1C1C1C"/>
    <rect x="5" y="5" width="390" height="390" rx="25"
          stroke="url(#rainbow)" stroke-width="10" fill="none"/>
    <circle cx="200" cy="120" r="60" fill="#FFFF66" stroke="white" stroke-width="0"/>
    <text x="200" y="125" font-family="Orbitron, sans-serif" font-size="36" font-weight="700"
          fill="#1C1C1C" text-anchor="middle" alignment-baseline="middle">CELO</text>
    <text x="200" y="250" font-family="Orbitron, sans-serif" font-size="42" font-weight="500"
          fill="#35D07F" text-anchor="middle" alignment-baseline="middle">
      $${price}
    </text>
    <text x="200" y="320" font-family="Orbitron, sans-serif" font-size="20" font-weight="500"
          fill="#FFFF66" text-anchor="middle" alignment-baseline="middle">
      <tspan fill="#FFFF66">${traits.rarity}</tspan>
    </text>
    <text x="200" y="360" font-family="Orbitron, sans-serif" font-size="14" font-weight="400"
          fill="#FFFFFF" text-anchor="middle" alignment-baseline="middle">
      Redis: ${redisData ?? "N/A"}
    </text>
  </svg>
  `;

  res.setHeader("Content-Type", "image/svg+xml");
  return res.status(200).send(svg);
}
