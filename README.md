# CeloNFT 🎨

[![Live App](https://img.shields.io/badge/Live-Vercel-black?style=for-the-badge&logo=vercel)](https://celo-nft-phi.vercel.app)
[![Farcaster](https://img.shields.io/badge/Farcaster-Mini_App-purple?style=for-the-badge&logo=farcaster)](https://farcaster.xyz/miniapps/Tip8ngTAKnHC/celo-nft)
[![Contract](https://img.shields.io/badge/Contract-Celo-yellow?style=for-the-badge&logo=ethereum)](https://celoscan.io/address/0xe90EC6F3f5C15cC76861CA5d41CD879548208Eff)

> A gamified NFT minting platform on Celo featuring live price snapshots, price prediction challenges, smart airdrops with lucky bonuses, and comprehensive community features.

## 🌟 Core Features

### 🎯 Price Prediction Game
- **60-Second Challenge**: Predict if CELO price will go UP or DOWN in 60 seconds
- **2x Reward for Correct**: Double your airdrop with accurate predictions
- **0.5x Consolation Prize**: Get half airdrop for wrong predictions
- **Skip Option**: Choose standard airdrop without prediction
- **Live Stats**: Track your win rate, current streak, and total predictions
- **Real-time Verification**: Automatic price verification after 60 seconds

### 💰 Enhanced Airdrop System
- **Base Amount**: 0.005-0.01 CELO per mint
- **Prediction Multiplier**: 2x (correct) or 0.5x (wrong)
- **Rarity Multipliers**: Common 1x, Rare 1.1x, Legendary 1.25x, Mythic 2x
- **Lucky Token Bonuses**:
  - 🎯 **Milestones** (100, 250, 500, 1000+): **1.4x**
  - 🍀 **Lucky Numbers** (77, 111, 222, 333+): **1.2x**
  - 🎰 **Repeating Digits** (1111, 5555): **1.5x**
  - 🔄 **Palindromes** (121, 1331): **2x**
  - 🔢 **Sequential** (123, 4567): **1.2x**
- **Hard Cap**: Maximum 0.033 CELO per mint (regardless of bonuses)
- **Beautiful Bonus Modal**: Detailed breakdown of all applied multipliers
- **Epic Confetti**: Intensity-based celebrations (normal/super/mega)

### 🎨 Minting & NFTs
- **Free Minting**: Zero or minimal cost NFT minting
- **Live Price Capture**: Each NFT captures exact CELO price at mint time
- **Four-Tier Rarity System**: Common (60%), Rare (30%), Legendary (9%), Mythic (1%)
- **Dynamic SVG Metadata**: On-chain generated artwork
- **Rarity-Based Sparkles**: Animated effects matching rarity tier

### 📊 Community Features
- **🔥 Recent Mints Feed**: Live feed of last 5 mints with rarity badges
- **🏆 Top Collectors Leaderboard**: Top 10 holders with rarity breakdowns
- **🏅 Achievement System**: 10 unlockable achievements
- **📈 Real-time Statistics**: Total minted, your mints, remaining supply
- **💰 Wallet Balance Display**: Live CELO balance with USD value
- **📱 Responsive Gallery**: View all your minted NFTs with filters

### 🔗 Platform Integration
- **Farcaster Mini App**: Native integration with cast composer
- **Auto-Registration**: Automatic daily notification opt-in
- **Direct Casting**: Share mints with prediction results to Farcaster
- **Twitter Sharing**: One-click X/Twitter sharing with rich context
- **Deep Linking**: Seamless navigation between platforms

### 🎁 Advanced Features
- **Download Options**: Export as SVG or PNG
- **Copy to Clipboard**: Direct image copy support
- **Gift NFTs**: Transfer NFTs to other addresses with messages
- **Multi-Tab Interface**: Mint, Gallery, and filtered views
- **TradingView Integration**: Real-time CELO/USD price charts
- **Achievement Tracking**: Progress system with 10 unlockable badges

## 🏗️ Technical Architecture

### Frontend Stack
- **Framework**: Vanilla JavaScript with Vite
- **Web3**: wagmi v2.13.4 + viem v2.21.0
- **Wallet Connection**: Reown AppKit (WalletConnect v2)
- **Farcaster SDK**: @farcaster/miniapp-sdk (latest)
- **UI Libraries**: 
  - Canvas Confetti v1.9.3
  - TradingView Widgets
- **Styling**: Pure CSS with animations

### Smart Contract
- **Network**: Celo Mainnet (Chain ID: 42220)
- **Address**: `0xe90EC6F3f5C15cC76861CA5d41CD879548208Eff`
- **Standard**: ERC-721 (OpenZeppelin)
- **Features**:
  - Dynamic on-chain metadata
  - Rarity system with weighted probabilities
  - Price snapshot storage (scaled to 4 decimals)
  - Mint timestamp tracking
  - Owner controls (price, sale toggle)

### Backend (Serverless Vercel Functions)
- **`/api/airdrop.js`**: Enhanced airdrop with lucky bonuses and prediction multipliers
- **`/api/prediction.js`**: Price prediction game logic with verification
- **`/api/notification.js`**: Farcaster notification system with auto-registration
- **`/api/celoscan.js`**: Etherscan V2 API proxy for NFT transfers
- **`/api/bitquery.js`**: Bitquery GraphQL proxy (optional, more reliable)
- **`/api/webhook.js`**: Event-based airdrop alternative
- **`/api/test-notification.js`**: Notification testing endpoint

### Data Sources
- **Price Data**: CoinGecko API
- **Blockchain Data**: Celo RPC (Forno)
- **NFT Transfers**: Celoscan API (Etherscan V2) with Bitquery fallback
- **Caching**: 60-second TTL for leaderboard, 2-minute polling intervals

### Storage
- **Browser**: LocalStorage for mint history and achievements
- **Server**: Vercel KV (Redis) for predictions and notifications
- **Memory Fallback**: In-memory storage when KV unavailable

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

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Required - Airdrop wallet (KEEP SECRET!)
AIRDROP_WALLET_PRIVATE_KEY=0x...your_private_key_here...

# Optional - Custom RPC for better reliability
CELO_RPC_URL=https://forno.celo.org

# Recommended - Celoscan API for better leaderboard performance
CELOSCAN_API_KEY=your_api_key_here

# Optional - More reliable alternative to Celoscan
BITQUERY_API_KEY=your_bitquery_key_here

# Required for notifications
NEYNAR_API_KEY=your_neynar_key_here
CRON_SECRET=your_secret_here
MINIAPP_URL=https://celo-nft-phi.vercel.app/

# Vercel KV (Redis) - Get from Vercel Dashboard
KV_URL=your_kv_url
KV_REST_API_URL=your_rest_api_url
KV_REST_API_TOKEN=your_rest_api_token
KV_REST_API_READ_ONLY_TOKEN=your_read_only_token
REDIS_URL=your_redis_url
```

⚠️ **SECURITY WARNING**: 
- Never commit `.env` file or expose private keys
- Use environment variables in production (Vercel Dashboard)
- Keep airdrop wallet funded but don't store large amounts

4. **Run development server**
```bash
npm run dev
```

Visit `http://localhost:3000`

### Production Deployment

**Deploy to Vercel:**
```bash
npm run build
vercel deploy
```

**Environment Variables Setup:**
1. Go to Vercel Project Settings → Environment Variables
2. Add all variables from `.env.example`
3. **Critical**: Add `AIRDROP_WALLET_PRIVATE_KEY` securely
4. Optional but recommended: Add `CELOSCAN_API_KEY` or `BITQUERY_API_KEY`
5. Required for notifications: Add `NEYNAR_API_KEY`, `CRON_SECRET`, `MINIAPP_URL`

## 📁 Project Structure

```
CeloNFT/
├── api/
│   ├── airdrop.js              # Main airdrop with lucky bonuses & predictions
│   ├── prediction.js           # Price prediction game backend (KV storage)
│   ├── notification.js         # Farcaster notifications with auto-register
│   ├── celoscan.js            # Etherscan V2 API proxy
│   ├── bitquery.js            # Bitquery GraphQL proxy (alternative)
│   ├── webhook.js             # Event-based airdrop (alternative approach)
│   └── test-notification.js   # Manual notification testing
├── public/
│   ├── contract.json          # Contract ABI & address
│   ├── icon.png              # App icon
│   ├── image.png             # Social preview
│   └── splash.png            # Splash screen
├── .well-known/
│   └── farcaster.json        # Farcaster manifest
├── index.html                # Main application (responsive UI)
├── main.js                   # Core logic (~2800 lines)
├── package.json              # Dependencies
├── vite.config.js            # Build configuration
├── vercel.json               # Deployment config with cron
└── .env.example              # Environment template
```

## 🎮 Game Mechanics

### Price Prediction Flow

1. **Prediction Modal Appears**: User sees current CELO price
2. **User Choice**: 
   - 📈 **UP**: Bet price will increase in 60 seconds
   - 📉 **DOWN**: Bet price will decrease in 60 seconds
   - ⏭️ **Skip**: Get standard airdrop without prediction
3. **Mint Happens**: NFT minting proceeds immediately (no delay)
4. **60-Second Wait**: Timer counts down in background
5. **Verification**: System fetches new price and compares
6. **Result Modal**: Shows:
   - Prediction result (correct/wrong)
   - Price change details
   - Total airdrop breakdown
   - Lucky bonuses (if any)
   - User statistics (win rate, streak)
7. **Airdrop Sent**: Multiplied amount sent to wallet
8. **Cast Option**: Share result to Farcaster with one click

### Airdrop Calculation Example

**Scenario**: Token #1000 (Milestone) with Legendary rarity, correct prediction

```
Base Amount:     0.010 CELO
Lucky Bonus:     × 1.4 (Milestone) = 0.014 CELO
Rarity Bonus:    × 1.25 (Legendary) = 0.0175 CELO
Prediction:      × 2.0 (Correct)    = 0.035 CELO
Hard Cap:        MAX 0.033 CELO     = 0.033 CELO (final)
```

### Lucky Token Detection

The system automatically detects special token IDs:

- **Milestone Tokens**: Exact matches (100, 250, 500, 1000, 2500, 5000, 10000, etc.)
- **Lucky Numbers**: Repeating patterns (77, 111, 222, 333, 444, 555, 666, 777, 888, 999, 1111+)
- **Palindromes**: Reads same forwards/backwards, 2+ digits (121, 1331, 12321, 45654)
- **Sequential**: 3+ consecutive digits ascending/descending (123, 234, 4567, 987, 543)
- **Repeating Digits**: All same digit, 2+ chars (11, 22, 111, 5555, 8888)

### Achievement System

10 unlockable achievements:
1. 🎯 **First Steps**: Mint your first NFT
2. 🔥 **Getting Started**: Mint 5 NFTs
3. 💎 **Collector**: Mint 10 NFTs
4. 💙 **Rare Find**: Own a Rare NFT
5. ⭐ **Legendary!**: Own a Legendary NFT
6. 👑 **Mythic Master**: Own a Mythic NFT
7. 🚀 **Early Adopter**: Minted in first 100
8. 🍀 **Lucky Number**: Own lucky token
9. 🎯 **Milestone Collector**: Own milestone token
10. 🏆 **Top Collector**: Be in top 10 leaderboard

## 🎨 Rarity System

| Rarity | Probability | Sparkle Color | Animation Speed | Airdrop Multiplier |
|--------|-------------|---------------|-----------------|--------------------| 
| Common | 60% | Gray | 6s | 1.0x |
| Rare | 30% | Blue | 4s | 1.1x |
| Legendary | 9% | Gold | 2s | 1.25x |
| Mythic | 1% | Crimson | 1.5s | 2.0x |

## 🏆 Leaderboard System

### Data Collection Methods

The leaderboard uses a **multi-layered approach** for maximum reliability:

**Method 1: Bitquery GraphQL API** (Most Reliable)
- Direct blockchain indexing via GraphQL
- Tracks all ERC-721 Transfer events
- Handles large collections efficiently
- Requires `BITQUERY_API_KEY` environment variable
- Free tier: 10,000 requests/month

**Method 2: Celoscan NFT Transfers API** (Etherscan V2)
- Paginated token transfer fetching (1000 per page)
- Supports up to 50 pages (50,000 transfers)
- Chronological ordering with proper deduplication
- Requires `CELOSCAN_API_KEY` for better rate limits
- Free tier: 100,000 calls/day, 5 calls/second

**Method 3: Direct Blockchain Scan** (Fallback)
- Queries each token directly via RPC
- Chunk processing (20-50 tokens per batch)
- Used when API methods fail or have incomplete data
- No API key required
- Slower but 100% accurate

### How It Works

1. **Transfer History**: System builds complete transfer history
2. **Ownership Tracking**: Determines current owner per token
3. **Holder Aggregation**: Counts NFTs per address
4. **Rarity Fetching**: Batch fetches rarity for top holders
5. **Sorting Logic**:
   - Primary: Total NFT count
   - Tiebreaker 1: Mythic count
   - Tiebreaker 2: Legendary count
6. **Caching**: 2-minute cache to reduce API calls
7. **Auto-Refresh**: Updates every 2 minutes

### Display Features

- **Top 10 Collectors**: Only shows top holders
- **Rarity Breakdown**: Shows Mythic, Legendary, Rare counts
- **Your Rank Highlight**: Crown emoji for your position
- **Rank Medals**: 🥇🥈🥉 for top 3
- **Animated Entry**: Smooth slide-up animations

## 📱 Farcaster Integration

### Mini App Features
- **Native SDK**: Full Farcaster mini app support
- **Cast Composer**: Share mints with `sdk.actions.composeCast()`
- **Auto-Registration**: Users auto-opted into daily notifications
- **Deep Linking**: Seamless app switching
- **Wallet Integration**: Farcaster wallet auto-connect

### Daily Notifications

**Automated System:**
- Cron job runs daily at 4:00 PM UTC (`vercel.json`)
- Sends rotating messages about minting, airdrops, predictions
- Respects user preferences (can disable)
- Neynar API for notification delivery
- User stats tracked (last notification, total sent)

**Message Rotation:**
1. 🎨 Daily NFT Mint Time!
2. 💰 Your Daily Airdrop Awaits!
3. 📈 Price Prediction Challenge!
4. 🍀 Lucky Numbers Alert!
5. 🎁 Free Daily Mint + Rewards!

### Cast Formatting

**With Prediction Result:**
```
🎯 I predicted CELO price correctly and got 2x airdrop!

✨ Minted NFT #1234 (Legendary) at $0.8234
💰 Earned 0.0280 CELO
🔥 Try your luck with price predictions!

Mint + Predict: [link]
```

**With Bonus Airdrop:**
```
💎 LUCKY MINT! Got bonus airdrop!

✨ Minted NFT #1000 (Rare) at $0.8123
🎁 Received 0.0245 CELO
🍀 Plus price prediction game!

Mint + Earn: [link]
```

## 🔧 Configuration

### Airdrop Settings

Modify in `api/airdrop.js`:
```javascript
const MIN_AIRDROP_AMOUNT = '0.005';  // Minimum CELO
const MAX_AIRDROP_AMOUNT = '0.01';   // Maximum CELO
const ABSOLUTE_MAX_AIRDROP = '0.033'; // Hard cap
const RATE_LIMIT_WINDOW = 3600000;   // 1 hour
const MAX_CLAIMS_PER_HOUR = 5;       // Claims per hour
const LOW_BALANCE_THRESHOLD = '1.0'; // Wallet alert threshold
```

### Prediction Settings

Modify in `api/prediction.js`:
```javascript
const STATS_TTL = 2592000;      // 30 days
const PREDICTION_TTL = 600;      // 10 minutes
```

And in `main.js`:
```javascript
// Prediction timer (line ~1234)
const remainingTime = 60000; // 60 seconds
```

### Lucky Token Patterns

Add/modify in `api/airdrop.js`:
```javascript
const LUCKY_NUMBERS = [
  77, 111, 222, 333, 444, 555, 666, 777, 888, 999,
  1111, 2222, 3333, 4444, 5555, 6666, 7777, 8888, 9999
];

const MILESTONE_TOKENS = [
  100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000
];
```

### Notification Schedule

Modify in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/notification",
      "schedule": "0 16 * * *"  // 4:00 PM UTC daily
    }
  ]
}
```

### Contract Settings

To use a different contract, update `public/contract.json`:
```json
{
  "address": "0xYourContractAddress",
  "abi": [...]
}
```

## 🔐 Security Features

### Airdrop Protection
- ✅ **NFT Ownership Verification**: Confirms ownership before sending
- ✅ **Recent Mint Check**: Only airdrops for mints within 10 minutes
- ✅ **Rate Limiting**: Max 5 claims per hour per address
- ✅ **Duplicate Prevention**: Prevents claiming same transaction twice
- ✅ **Transaction Validation**: Verifies mint transaction on-chain
- ✅ **Hard Cap Enforcement**: Maximum 0.033 CELO regardless of bonuses
- ✅ **Low Balance Alerts**: Warns when wallet below 1.0 CELO

### Smart Contract Safety
- ✅ **OpenZeppelin Base**: Built on audited ERC-721 implementation
- ✅ **Owner Controls**: Mint price adjustment, sale toggle
- ✅ **Reentrancy Protection**: Safe fund withdrawal patterns
- ✅ **Input Validation**: Price range checks and data validation

### API Security
- ✅ **CORS Headers**: Proper cross-origin configuration
- ✅ **Rate Limiting**: API call throttling and caching
- ✅ **Input Sanitization**: SVG and user input cleaning
- ✅ **Error Boundaries**: Graceful error handling
- ✅ **Timeout Protection**: 30-second request timeouts

## 📊 Performance Optimizations

### Frontend
- **Lazy Loading**: TradingView widget loads on scroll
- **Batch Processing**: Multiple contract calls in parallel
- **Memory Management**: Proper cleanup of intervals and timers
- **Caching**: LocalStorage for user preferences and history
- **Debouncing**: Account change events debounced (300ms)

### Backend
- **Leaderboard Caching**: 2-minute TTL reduces API calls
- **Chunked Scanning**: Processes blockchain data in batches
- **Parallel Fetching**: Concurrent API requests where possible
- **Small Delays**: Rate limit avoidance with 50-200ms delays
- **Progress Logging**: Detailed console output for debugging

### API Calls
- **Recent Mints**: Fetches last 5 tokens only, 15-second refresh
- **Leaderboard**: 2-minute cache, pagination for large collections
- **Predictions**: 10-minute TTL for stored predictions
- **Notifications**: Daily batch processing with cleanup

## 🐛 Troubleshooting

### Common Issues

**"Connection Error - Refresh Required"**
- **Cause**: RPC connection issue or network problem
- **Solution**: Refresh page or check Celo network status
- **Prevention**: Add `CELO_RPC_URL` with reliable RPC endpoint

**"Airdrop Already Claimed"**
- **Cause**: Duplicate claim attempt for same mint
- **Solution**: Each mint can only claim once (by design)
- **Note**: Check transaction on Celoscan for airdrop status

**"Rate Limit Exceeded"**
- **Cause**: More than 5 claims in 1 hour
- **Solution**: Wait for cooldown period (shows remaining time)
- **Adjustment**: Modify `MAX_CLAIMS_PER_HOUR` in `api/airdrop.js`

**"NFT Ownership Verification Failed"**
- **Cause**: NFT not in your connected wallet
- **Solution**: Verify ownership on Celoscan, check correct wallet connected
- **Debug**: Check console for detailed error messages

**"Prediction Verification Failed"**
- **Cause**: Prediction not found or expired (>10 minutes)
- **Solution**: System uses client-side verification fallback
- **Note**: Check browser console for KV storage status

**"Leaderboard Not Loading"**
- **Cause**: Celoscan API rate limit or connection issue
- **Solution**: System automatically falls back to blockchain scan
- **Improvement**: Add `CELOSCAN_API_KEY` or `BITQUERY_API_KEY`

**"Recent Mints Taking Too Long"**
- **Cause**: Large collection or slow RPC
- **Solution**: Shows last 5 tokens only, auto-refreshes every 15s
- **Performance**: Consider using custom RPC endpoint

**"Notifications Not Working"**
- **Cause**: Missing `NEYNAR_API_KEY` or invalid FID
- **Solution**: Add API key to environment variables
- **Testing**: Use `/api/test-notification` endpoint to verify

**"Preview Not Loading"**
- **Cause**: Invalid SVG data or metadata format
- **Solution**: Clear localStorage, check contract metadata
- **Debug**: Open browser console for detailed error

**"Wallet Balance Not Showing"**
- **Cause**: RPC issue or wrong network
- **Solution**: Ensure connected to Celo Mainnet (Chain ID 42220)
- **Check**: Verify `userAddress` is set in console

### Debug Mode

Enable detailed logging in browser console:
```javascript
localStorage.setItem('debug', 'true');
// Reload page
```

View stored data:
```javascript
// Check mint history
JSON.parse(localStorage.getItem('mintHistory'));

// Check achievements
JSON.parse(localStorage.getItem('achievements'));

// Check last prediction
sessionStorage.getItem('lastPredictionResult');
```

### API Testing

**Test Airdrop:**
```bash
curl -X POST https://your-domain.vercel.app/api/airdrop \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": 1,
    "userAddress": "0x...",
    "mintTxHash": "0x...",
    "predictionMultiplier": 2
  }'
```

**Test Notification:**
```bash
curl -X POST https://your-domain.vercel.app/api/test-notification \
  -H "Content-Type: application/json" \
  -d '{"testFid": 12345}'
```

**Test Prediction:**
```bash
# Make prediction
curl -X POST https://your-domain.vercel.app/api/prediction \
  -H "Content-Type: application/json" \
  -d '{
    "action": "predict",
    "userAddress": "0x...",
    "currentPrice": 0.8234,
    "prediction": "up",
    "timestamp": 1234567890000
  }'

# Verify prediction (after 60s)
curl -X POST https://your-domain.vercel.app/api/prediction \
  -H "Content-Type: application/json" \
  -d '{
    "action": "verify",
    "userAddress": "0x...",
    "timestamp": 1234567890000,
    "newPrice": 0.8256
  }'
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- **Code Style**: Use ES6+ syntax, async/await for promises
- **Error Handling**: Always wrap async calls in try-catch
- **Comments**: Add JSDoc comments for complex functions
- **Testing**: Test on Celo Testnet (Alfajores) before mainnet
- **Security**: Never commit private keys or sensitive data
- **Performance**: Profile before adding heavy operations

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[Celo](https://celo.org/)** - Mobile-first blockchain platform
- **[Farcaster](https://farcaster.xyz/)** - Decentralized social protocol
- **[Neynar](https://neynar.com/)** - Farcaster API infrastructure
- **[OpenZeppelin](https://openzeppelin.com/)** - Smart contract standards
- **[Reown/WalletConnect](https://reown.com/)** - Wallet connection protocol
- **[TradingView](https://tradingview.com/)** - Financial charts
- **[CoinGecko](https://coingecko.com/)** - Price data API
- **[Bitquery](https://bitquery.io/)** - Blockchain GraphQL API
- **[Celoscan](https://celoscan.io/)** - Celo block explorer
- **[Vercel](https://vercel.com/)** - Deployment platform

## 📞 Support

- **Developer**: [@kumar14700](https://x.com/kumar14700) on X/Twitter
- **Farcaster**: [@dare1.eth](https://farcaster.xyz/dare1.eth)
- **Issues**: [GitHub Issues](https://github.com/CryptoExplor/CeloNFT/issues)
- **Email**: ravikumar699121@gmail.com

## 🔗 Links

- **Live App**: [celo-nft-phi.vercel.app](https://celo-nft-phi.vercel.app)
- **Farcaster Mini App**: [farcaster.xyz/miniapps/Tip8ngTAKnHC/celo-nft](https://farcaster.xyz/miniapps/Tip8ngTAKnHC/celo-nft)
- **Smart Contract**: [celoscan.io/address/0xe90EC6F3f5C15cC76861CA5d41CD879548208Eff](https://celoscan.io/address/0xe90EC6F3f5C15cC76861CA5d41CD879548208Eff)
- **GitHub**: [github.com/CryptoExplor/CeloNFT](https://github.com/CryptoExplor/CeloNFT)

---

**Built with ❤️ on Celo by CryptoExplor**

*Last Updated: December 2024*
