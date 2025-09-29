# CeloNFT

**Live Mint:** https://celo-nft-phi.vercel.app

## Overview

CeloNFT is a decentralized web application that allows users to mint free NFTs on the Celo blockchain. The application returns live CELO price data and is designed to work as a Farcaster mini app.

## Features

- **Mint NFTs on the Celo blockchain for free**
- **Real-time CELO price display in the UI**
- **Fully open source and frontend-only (hostable on Vercel)**
- **Compatible with Farcaster mini app standards**
- **Includes smart contract ABI and deployment address**

## Project Structure

- `index.html`: Main frontend application (web UI and logic)
- `contract.json`: Contains deployed contract address and ABI
- `/icons and visual assets`: Branding, logos, and screenshots
- `.well-known/farcaster.json`: Farcaster mini app configuration

## Usage

1. **Deploy**: Clone or fork this repo and deploy to Vercel (or another static host).
2. **Configure Contract**: Update contract.json with your deployed Celo NFT smart contract address and ABI if you redeploy a new contract.
3. **Mint NFT**: Visit the app, connect your Celo wallet, and mint your unique NFT.

## Smart Contract

- **Contract address**: 0x839a2b984db48c69d0aff4f712ba337ad7c6bad6
- **ABI**: See contract.json for full details

## Getting Started

```bash
git clone https://github.com/CryptoExplor/CeloNFT.git
cd CeloNFT
# Deploy to Vercel or serve index.html with your preferred web server
```

## License

## MIT
