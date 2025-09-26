import { kv } from "@vercel/kv";

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
    return res.status(400).json({ error: "Invalid NFT ID." });
  }

  let traits;
  try {
    const traitsString = await kv.get(`nft:${id}`);
    if (traitsString) traits = JSON.parse(traitsString);
  } catch (error) {
    console.error("KV get error:", error);
    return res.status(500).json({ error: "Could not retrieve NFT traits." });
  }

  if (!traits) {
    return res.status(404).json({ error: "NFT traits not found — mint first." });
  }

  // ✅ Build base URL correctly
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto ? forwardedProto.split(",")[0] : "https";
  const hostHeader = req.headers.host || process.env.VERCEL_URL;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${hostHeader}`;

  const metadata = {
    name: `Celo NFT #${id}`,
    description: "A dynamic CELO NFT with rarity-based animated border.",
    image: `${baseUrl}/api/image/${id}`,
    attributes: [
      { trait_type: "Rarity", value: traits.rarity },
      { trait_type: "Color", value: traits.color }
    ]
  };

  res.status(200).json(metadata);
}
