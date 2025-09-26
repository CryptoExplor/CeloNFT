import { Redis } from '@upstash/redis';
import { kv } from "@vercel/kv";
import { NextResponse } from 'next/server';

// Initialize Redis
const redis = Redis.fromEnv();

// --- Rarity and Color Generation ---
function getRandomTrait(type) {
  const rand = Math.random();
  if (type === 'rarity') {
    if (rand < 0.05) return "Legendary"; // 5% chance
    if (rand < 0.20) return "Rare";      // 15% chance
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
      await kv.set(`nft:${tokenId}`, JSON.stringify(traits));
    } catch (error) {
      console.error("KV set error:", error);
      return new NextResponse(JSON.stringify({ error: "Failed to store traits." }), { status: 500 });
    }

    // Fetch Redis data
    let redisData;
    try {
      redisData = await redis.get("item");
    } catch (error) {
      console.error("Redis fetch error:", error);
      redisData = null; // continue even if Redis fails
    }

    // Return traits and Redis data
    return new NextResponse(
      JSON.stringify({
        tokenId,
        traits,
        redisData
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Mint POST error:", error);
    return new NextResponse(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
};
