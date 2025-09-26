import { Redis } from '@upstash/redis';
import { kv } from "@vercel/kv";
import { NextResponse } from 'next/server';

// --- Environment Variable Setup (Ensures Explicit Connection) ---
const REDIS_URL = process.env.celonft__REDIS_URL;
const REDIS_TOKEN = process.env.celonft__KV_REST_API_TOKEN;

// Explicitly Initialize Redis to avoid issues with custom environment variable names
const redis = new Redis({
  url: REDIS_URL,
  token: REDIS_TOKEN,
});

export const POST = async (req) => {
  try {
    const body = await req.json();
    const { id } = body;

    // --- Debugging: Log incoming data and environment vars ---
    console.log("Metadata API POST BODY received:", body);
    console.log(`ENV Redis URL (celonft__REDIS_URL): ${REDIS_URL ? '✅ Loaded' : '❌ MISSING'}`);
    console.log(`ENV NEXT_PUBLIC_BASE_URL: ${process.env.NEXT_PUBLIC_BASE_URL || 'N/A'}`);
    console.log(`ENV VERCEL_URL: ${process.env.VERCEL_URL || 'N/A'}`);
    // -----------------------------------------------------------

    if (!id || isNaN(parseInt(id))) {
      return new NextResponse(JSON.stringify({ error: "Invalid NFT ID. ID must be a number." }), { status: 400 });
    }

    // Fetch NFT traits from Vercel KV
    let traits;
    try {
      // NOTE: kv() is assumed to be correctly configured to pick up Vercel KV environment variables.
      const traitsString = await kv.get(`nft:${id}`);
      if (traitsString) traits = JSON.parse(traitsString);
    } catch (error) {
      console.error("KV get error:", error.message);
      console.error("KV get error stack:", error.stack); // Log full stack for better diagnosis
      return new NextResponse(JSON.stringify({ error: "Could not retrieve NFT traits from KV." }), { status: 500 });
    }

    if (!traits) {
      return new NextResponse(JSON.stringify({ error: `NFT traits for ID #${id} not found — ensure it has been minted.` }), { status: 404 });
    }

    // Fetch Redis data (in parallel, non-blocking if fails)
    let redisData;
    try {
      redisData = await redis.get("item");
    } catch (error) {
      console.error("Redis fetch error:", error.message);
      console.error("Redis fetch error stack:", error.stack); // Log full stack for better diagnosis
      redisData = null;
    }

    // Simplify base URL construction
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL 
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    const metadata = {
      name: `Celo NFT #${id}`,
      description: "A dynamic CELO NFT with rarity-based animated border.",
      // Construct the image URL using the robust baseUrl
      image: `${baseUrl}/api/image/${id}`,
      attributes: [
        { trait_type: "Rarity", value: traits.rarity },
        { trait_type: "Color", value: traits.color }
      ],
      // Include Redis data if available, useful for debugging/dynamic content
      redisData
    };

    return new NextResponse(JSON.stringify(metadata), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    // Catch block for general request parsing or unexpected errors
    console.error("Metadata POST general error:", error.message);
    console.error("Metadata POST error stack:", error.stack); // Log full stack for better diagnosis
    return new NextResponse(JSON.stringify({ error: "Internal server error during metadata generation." }), { status: 500 });
  }
};
