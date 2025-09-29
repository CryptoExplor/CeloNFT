# CeloNFT

**Live Mint:** https://farcaster.xyz/miniapps/Tip8ngTAKnHC/celo-nft

## Overview

CeloNFT is a decentralized web application that allows users to mint free NFTs on the Celo blockchain. The application captures live CELO price data at the moment of minting and is designed to work as a Farcaster mini app with advanced visual features.

## Features

- **Free NFT Minting** - Mint NFTs on the Celo blockchain for free
- **Live CELO Price Integration** - Real-time CELO price display with TradingView chart widget
- **NFT Rarity System** - Four-tier rarity system (Common, Rare, Legendary, Mythic) with dynamic sparkle effects
- **Responsive NFT Preview** - Enhanced SVG preview with proper scaling and aspect ratio preservation
- **Price Snapshot NFTs** - Each NFT captures the exact CELO price at minting time
- **Farcaster Mini App** - Full compatibility with Farcaster mini app standards
- **Enhanced Error Handling** - Improved connection error recovery with retry guidance
- **Persistent State** - LocalStorage integration to remember last minted NFT
- **Dynamic Supply Tracking** - Real-time supply updates with sold-out detection
- **Open Source & Frontend-Only** - Fully hostable on Vercel or any static host

## Visual Enhancements

### Sparkle Effects
- **Common NFTs**: Subtle gray sparkles with 6-second animation
- **Rare NFTs**: Blue sparkles with 4-second animation
- **Legendary NFTs**: Gold sparkles with 2-second animation
- **Mythic NFTs**: Crimson sparkles with 1.5-second animation

### UI Improvements
- TradingView widget for live CELO price charts
- Responsive SVG scaling without cropping
- Loading spinners and status indicators
- Enhanced visual feedback for all user actions
- Mobile-optimized interface with proper viewport handling

## Project Structure

- `index.html`: Main frontend application (web UI and logic) with enhanced features
- `contract.json`: Contains deployed contract address and ABI
- `favicon.ico`, `icon.png`, `splash.png`: Visual assets and branding
- `image.png`: Social media preview image
- `.well-known/farcaster.json`: Farcaster mini app configuration
- `vercel.json`: Vercel deployment configuration

## Usage

1. **Deploy**: Clone or fork this repo and deploy to Vercel (or another static host)
2. **Configure Contract**: Update `contract.json` with your deployed Celo NFT smart contract address and ABI if you redeploy a new contract
3. **Mint NFT**: Visit the app, connect your Celo wallet, and mint your unique price-snapshot NFT
4. **Preview**: Use the preview button to see your minted NFT with its rarity and sparkle effects
5. **Track**: View your NFT on Celoscan through the provided links

## Smart Contract

- **Contract Address**: `0xe90EC6F3f5C15cC76861CA5d41CD879548208Eff`
- **Network**: Celo Mainnet
- **ABI**: See `contract.json` for full contract interface details
- **Features**: Dynamic pricing, supply limits, metadata generation

## Technical Features

### Enhanced Error Handling
- Connection error detection with refresh recommendations
- RPC error handling with user-friendly messages
- Transaction failure recovery with clear guidance

### Price Integration
- CoinGecko API for live CELO price fetching
- Price validation and error handling
- Real-time price display in TradingView widget

### NFT Metadata
- Base64-encoded SVG images
- JSON metadata with rarity and price attributes
- Dynamic attribute generation based on mint conditions

## Getting Started

```bash
git clone https://github.com/CryptoExplor/CeloNFT.git
cd CeloNFT
# Deploy to Vercel or serve index.html with your preferred web server
```

### Local Development

1. Serve the `index.html` file with any local web server
2. Ensure `contract.json` contains valid contract details
3. Test with a Celo wallet connection

### Deployment

- **Vercel**: Connect your GitHub repo for automatic deployments
- **Netlify**: Drag and drop the folder for instant deployment
- **Any Static Host**: Upload all files maintaining directory structure

## Troubleshooting

- **Connection Issues**: Refresh the miniapp if you encounter RPC errors
- **Mint Failures**: Ensure you're connected to Celo Mainnet
- **Preview Not Loading**: Check console for detailed error messages
- **Sold Out**: Monitor the supply counter for availability

## License

MIT

---

*Built for the Celo ecosystem with ❤️ by CryptoExplor*
