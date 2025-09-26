// pages/api/metadata/[id].js
import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const { id } = req.query;
  if (!id || !/^\d+$/.test(id)) return res.status(400).json({ error: "Invalid NFT ID." });

  let traits;
  try {
    const traitsString = await kv.get(`nft:${id}`);
    if (traitsString) traits = JSON.parse(traitsString);
  } catch (error) {
    console.error("KV get error:", error);
    return res.status(500).json({ error: "Could not retrieve NFT traits." });
  }

  if (!traits) return res.status(404).json({ error: "NFT traits not found — mint first." });

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto ? forwardedProto.split(",")[0] : "https";
  const host = req.headers.host || process.env.VERCEL_URL;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

  const metadata = {
    name: `Celo NFT #${id}`,
    description: "A dynamic CELO NFT with rarity-based animated border.",
    image: `${baseUrl}/api/image/${id}`,
    attributes: [
      { trait_type: "Rarity", value: traits.rarity },
      { trait_type: "Color", value: traits.color }
    ]
  };

  return res.status(200).json(metadata);
}
