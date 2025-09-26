import { Redis } from '@upstash/redis';
import { kv } from "@vercel/kv";
import { NextResponse } from 'next/server';

// --- Debugging Environment Variable Load Status ---
const REDIS_URL = process.env.celonft__REDIS_URL;
const REDIS_TOKEN = process.env.celonft__KV_REST_API_TOKEN; // Assuming this is the appropriate token for Redis, as per your checklist

console.log("--- DEBUG START ---");
console.log(`Redis URL (celonft__REDIS_URL): ${REDIS_URL ? '✅ Loaded' : '❌ MISSING'}`);
console.log(`Redis/KV Token (celonft__KV_REST_API_TOKEN): ${REDIS_TOKEN ? '✅ Loaded' : '❌ MISSING'}`);
// @vercel/kv relies on KV_URL/KV_REST_API_TOKEN by default, but logging the token is useful.
console.log("--- DEBUG END ---");

// Explicitly Initialize Redis with custom env vars instead of relying on Redis.fromEnv()
// This addresses the primary suspected issue with custom environment variable names.
const redis = new Redis({
  url: REDIS_URL,
  token: REDIS_TOKEN,
});

// --- Rarity and Color Generation ---
function getRandomTrait(type) {
  const rand = Math.random();
  if (type === 'rarity') {
    if (rand < 0.05) return "Legendary"; // 5% chance
    if (rand < 0.20) return "Rare";      // 15% chance (20% - 5%)
    return "Common";                     // 80% chance
  }
  if (type === 'color') {
    const colors = ["Gold", "Silver", "Bronze", "Emerald", "Ruby", "Sapphire"];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

export const POST = async (req) => {
  try {
    const body = await req.json();
    const { tokenId } = body;

    // Debugging: Log the incoming request body
    console.log("Mint API POST BODY received:", body);

    if (!tokenId) {
      return new NextResponse(JSON.stringify({ error: "tokenId is required" }), { status: 400 });
    }

    // Generate random traits
    const traits = {
      rarity: getRandomTrait('rarity'),
      color: getRandomTrait('color'),
    };

    // Store traits in Vercel KV
    try {
      // NOTE: kv() should automatically pick up VERCEL_KV_URL and VERCEL_KV_REST_API_TOKEN.
      // If your env vars are custom, ensure Vercel KV has been configured to use the custom names
      // or that the standard names are set. We proceed assuming kv is correctly initialized by Vercel.
      await kv.set(`nft:${tokenId}`, JSON.stringify(traits));
    } catch (error) {
      console.error("KV set error:", error.message);
      console.error("KV set error stack:", error.stack); // Log stack for diagnosis
      return new NextResponse(JSON.stringify({ error: "Failed to store traits in Vercel KV." }), { status: 500 });
    }

    // Fetch Redis data
    let redisData;
    try {
      // We are using the explicitly initialized 'redis' instance here
      redisData = await redis.get("item");
    } catch (error) {
      console.error("Redis fetch error:", error.message);
      console.error("Redis fetch error stack:", error.stack); // Log stack for diagnosis
      redisData = null; // continue even if Redis fails
    }

    // Return traits and Redis data
    return new NextResponse(
      JSON.stringify({
        tokenId,
        traits,
        redisData,
        message: "NFT traits generated and stored successfully."
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    // Catch block for general request parsing or initial errors
    console.error("Mint POST general error:", error.message);
    console.error("Mint POST error stack:", error.stack); // Log stack for diagnosis
    return new NextResponse(JSON.stringify({ error: "Internal server error during processing." }), { status: 500 });
  }
};
