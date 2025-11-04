# CeloNFT 🎨

[![Live App](https://img.shields.io/badge/Live-Vercel-black?style=for-the-badge&logo=vercel)](https://celo-nft-phi.vercel.app)
[![Farcaster](https://img.shields.io/badge/Farcaster-Mini_App-purple?style=for-the-badge&logo=farcaster)](https://farcaster.xyz/miniapps/Tip8ngTAKnHC/celo-nft)
[![Contract](https://img.shields.io/badge/Contract-Celo-yellow?style=for-the-badge&logo=ethereum)](https://celoscan.io/address/0xe90EC6F3f5C15cC76861CA5d41CD879548208Eff)

> A decentralized NFT minting platform on Celo that captures live CELO price snapshots, features automatic CELO airdrops, and functions as a Farcaster mini app.

## 🌟 Features

### Core Functionality
- **🆓 Free NFT Minting** - Mint unique NFTs on the Celo blockchain
- **💰 Automatic Airdrop** - Receive 0.01 CELO automatically when minting
- **📊 Live Price Integration** - Each NFT captures the exact CELO price at mint time
- **📈 TradingView Chart** - Real-time CELO/USD price visualization
- **🎲 Rarity System** - Four-tier rarity (Common, Rare, Legendary, Mythic)

### Visual Experience
- **✨ Dynamic Sparkle Effects** - Rarity-based animations with varying speeds
- **🖼️ Responsive NFT Preview** - SVG rendering with proper scaling
- **📱 Mobile Optimized** - Full responsive design for all devices
- **🎉 Celebration Effects** - Confetti animations on successful mints

### Farcaster Integration
- **🟣 Mini App Support** - Full Farcaster mini app compatibility
- **📣 Direct Casting** - Share minted NFTs directly to Farcaster
- **🔗 Deep Linking** - Seamless navigation between web and Farcaster
- **👛 Native Wallet** - Auto-connect with Farcaster wallet

### User Features
- **⬇️ Export Options** - Download as SVG or PNG
- **📋 Clipboard Support** - Copy images directly to clipboard
- **🎁 Gift NFTs** - Transfer NFTs to other addresses
- **🐦 Twitter Sharing** - One-click social media sharing
- **📊 Real-time Stats** - Track total mints, your mints, and remaining supply

## 🏗️ Architecture

### Frontend Stack
- **Framework**: Vanilla JavaScript + Vite
- **Web3**: wagmi v2 + viem
- **Wallet**: Reown AppKit (WalletConnect v2)
- **UI Libraries**: Canvas Confetti, TradingView Widget
- **Farcaster**: @farcaster/miniapp-sdk

### Smart Contract
- **Network**: Celo Mainnet
- **Contract**: `0xe90EC6F3f5C15cC76861CA5d41CD879548208Eff`
- **Standard**: ERC-721
- **Features**: Dynamic metadata, rarity system, price snapshots

### Backend (Serverless)
- **Platform**: Vercel Functions
- **Airdrop System**: Automatic CELO distribution via Viem
- **Rate Limiting**: 3 claims per hour per address
- **Security**: NFT ownership verification, recent mint validation

## 🚀 Quick Start

### Prerequisites
```bash
node >= 18.0.0
npm >= 9.0.0
```

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/CryptoExplor/CeloNFT.git
cd CeloNFT
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` and add your airdrop wallet private key:
```env
CELO_RPC_URL=https://forno.celo.org
AIRDROP_WALLET_PRIVATE_KEY=0x...your_private_key_here...
```

⚠️ **CRITICAL**: Never commit your `.env` file or expose your private key!

4. **Run development server**
```bash
npm run dev
```

Visit `http://localhost:3000` to see the app.

### Production Deployment

**Deploy to Vercel:**
```bash
npm run build
vercel deploy
```

**Configure environment variables in Vercel:**
- Go to Project Settings → Environment Variables
- Add `AIRDROP_WALLET_PRIVATE_KEY`
- Add `CELO_RPC_URL` (optional, for custom RPC)

## 📁 Project Structure

```
CeloNFT/
├── api/
│   ├── airdrop.js          # Main airdrop endpoint (user-triggered)
│   └── webhook.js          # Event-based airdrop (alternative)
├── public/
│   ├── contract.json       # Contract ABI & address
│   ├── icon.png           # App icon
│   ├── image.png          # Social preview
│   └── splash.png         # Splash screen
├── .well-known/
│   └── farcaster.json     # Farcaster manifest
├── index.html             # Main application
├── main.js                # Application logic
├── package.json           # Dependencies
├── vite.config.js         # Vite configuration
├── vercel.json            # Vercel deployment config
└── .env.example           # Environment template
```

## 🎨 Rarity System

NFT rarity is determined randomly during minting:

| Rarity | Probability | Sparkle Color | Animation Speed |
|--------|-------------|---------------|-----------------|
| Common | 60% | Gray | 6s |
| Rare | 30% | Blue | 4s |
| Legendary | 9% | Gold | 2s |
| Mythic | 1% | Crimson | 1.5s |

## 🔐 Security Features

### Airdrop Protection
- **Ownership Verification**: Confirms NFT ownership before airdrop
- **Recent Mint Check**: Only airdrops for mints within 10 minutes
- **Rate Limiting**: Max 3 claims per hour per address
- **Duplicate Prevention**: Prevents claiming same transaction twice
- **Transaction Validation**: Verifies mint transaction on-chain

### Smart Contract Safety
- **OpenZeppelin Standards**: Built on audited ERC-721 implementation
- **Owner Controls**: Mint price adjustment, sale toggle
- **No Max Supply** (unless configured): Unlimited minting potential

## 🔧 Configuration

### Contract Settings

To use a different contract, update `public/contract.json`:
```json
{
  "address": "0xYourContractAddress",
  "abi": [...]
}
```

### Airdrop Amount

Modify in `api/airdrop.js`:
```javascript
const AIRDROP_AMOUNT = '0.01'; // CELO
```

### Rate Limits

Adjust in `api/airdrop.js`:
```javascript
const RATE_LIMIT_WINDOW = 3600000; // 1 hour
const MAX_CLAIMS_PER_HOUR = 3;
```

### Price Integration

The app fetches CELO price from CoinGecko API. To use a different source, modify the `fetchCeloPrice()` function in `main.js`.

## 📊 Stats & Analytics

The app tracks:
- **Total Minted**: Global mint counter
- **Your Mints**: User's NFT balance
- **Remaining Supply**: Available NFTs (if max supply set)
- **Mint History**: localStorage-based history
- **User Balance**: Real-time wallet NFT count

## 🎁 Airdrop System

### How It Works

1. User mints an NFT
2. Transaction is confirmed on-chain
3. Frontend automatically calls `/api/airdrop`
4. API verifies:
   - NFT ownership
   - Recent mint (< 10 minutes)
   - Rate limit compliance
   - No duplicate claims
5. 0.01 CELO is sent to user's wallet
6. Confetti celebration! 🎉

### Alternative: Webhook System

For production reliability, use the webhook approach (`api/webhook.js`):

**Option 1: Blockchain Indexer**
- Use Goldsky, The Graph, or similar
- Listen for `Minted` events
- POST to `/api/webhook`

**Option 2: Cron Job**
- Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/poll-mints",
    "schedule": "* * * * *"
  }]
}
```

## 🌐 Farcaster Integration

### Mini App Configuration

The app is configured in `.well-known/farcaster.json`:
- **Name**: Celo NFT
- **Description**: Mintable Collection on Celo
- **Category**: art-creativity
- **Tags**: celonft, celo, nft, free, mint

### Features in Farcaster
- Native wallet connection
- Cast composer integration
- Splash screen & icon
- Deep linking support

## 🛠️ Development

### Available Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

### Code Style

- ES6+ JavaScript
- Modular architecture
- Async/await for promises
- Error boundaries
- Responsive design patterns

### Testing Locally

1. Use Celo Testnet (Alfajores)
2. Get test CELO from faucet
3. Deploy test contract
4. Update `contract.json` with test address

## 📝 Smart Contract

### Key Functions

```solidity
mint(uint128 priceScaled) payable
// Mints NFT with price snapshot

tokenURI(uint256 tokenId) view returns (string)
// Returns base64-encoded metadata

tokenTraits(uint256 tokenId) view returns (uint128, uint8, uint40)
// Returns priceSnapshot, rarity, mintedAt

totalSupply() view returns (uint256)
// Returns total minted count
```

### Events

```solidity
event Minted(
    address indexed owner,
    uint256 indexed tokenId,
    uint8 rarity,
    uint128 priceSnapshot
)
```

## 🐛 Troubleshooting

### Common Issues

**"Connection Error - Refresh Required"**
- RPC connection issue
- Solution: Refresh the page or check network

**"Airdrop Already Claimed"**
- Duplicate claim attempt
- Each mint can only claim once

**"Rate Limit Exceeded"**
- Too many claims in 1 hour
- Wait for cooldown period

**"NFT Ownership Verification Failed"**
- NFT not in your wallet
- Check on Celoscan

**Preview Not Loading**
- Clear localStorage
- Check console for errors
- Verify contract address

### Debug Mode

Enable detailed logging:
```javascript
// In main.js
console.log('Debug mode enabled');
localStorage.setItem('debug', 'true');
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Celo](https://celo.org/) - Blockchain platform
- [Farcaster](https://farcaster.xyz/) - Social protocol
- [OpenZeppelin](https://openzeppelin.com/) - Smart contract standards
- [Reown/WalletConnect](https://reown.com/) - Wallet connection
- [TradingView](https://tradingview.com/) - Price charts
- [CoinGecko](https://coingecko.com/) - Price data API

## 📞 Support

- **Twitter**: [@kumar14700](https://x.com/kumar14700)
- **Farcaster**: [@dare1.eth](https://farcaster.xyz/dare1.eth)
- **Issues**: [GitHub Issues](https://github.com/CryptoExplor/CeloNFT/issues)

---

**Built with ❤️ on Celo by CryptoExplor**

[Live Demo](https://celo-nft-phi.vercel.app) • [Farcaster Mini App](https://farcaster.xyz/miniapps/Tip8ngTAKnHC/celo-nft) • [Contract](https://celoscan.io/address/0xe90EC6F3f5C15cC76861CA5d41CD879548208Eff)
