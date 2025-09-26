import { Redis } from '@upstash/redis';
import { kv } from "@vercel/kv";
import { NextResponse } from 'next/server';

// Initialize Redis
const redis = Redis.fromEnv();

export const POST = async (req) => {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id || isNaN(parseInt(id))) {
      return new NextResponse(JSON.stringify({ error: "Invalid NFT ID." }), { status: 400 });
    }

    // Fetch NFT traits from Vercel KV
    let traits;
    try {
      const traitsString = await kv.get(`nft:${id}`);
      if (traitsString) traits = JSON.parse(traitsString);
    } catch (error) {
      console.error("KV get error:", error);
      return new NextResponse(JSON.stringify({ error: "Could not retrieve NFT traits." }), { status: 500 });
    }

    if (!traits) {
      return new NextResponse(JSON.stringify({ error: "NFT traits not found — mint first." }), { status: 404 });
    }

    // Fetch Redis data in parallel
    let redisData;
    try {
      redisData = await redis.get("item");
    } catch (error) {
      console.error("Redis error:", error);
      redisData = null;
    }

    // Build base URL
    const protocol = process.env.NEXT_PUBLIC_BASE_URL ? process.env.NEXT_PUBLIC_BASE_URL.split(":")[0] : "https";
    const host = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || "localhost";
    const baseUrl = `${protocol}://${host}`;

    const metadata = {
      name: `Celo NFT #${id}`,
      description: "A dynamic CELO NFT with rarity-based animated border.",
      image: `${baseUrl}/api/image/${id}`,
      attributes: [
        { trait_type: "Rarity", value: traits.rarity },
        { trait_type: "Color", value: traits.color }
      ],
      redisData
    };

    return new NextResponse(JSON.stringify(metadata), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new NextResponse(JSON.stringify({ error: "Internal server error." }), { status: 500 });
  }
};
