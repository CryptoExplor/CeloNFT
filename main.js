/**
 * Main Application Entry Point - FINAL FIXED VERSION
 * All bugs resolved, fully functional modular architecture
 */

// Buffer polyfill for WalletConnect
import { Buffer } from 'buffer';
window.Buffer = Buffer;
window.global = window.global || window;
window.process = window.process || { env: {} };

import { WalletManager, safeLocalStorage } from './lib/wallet.js';
import { MintingManager, celebrateMint, getImprovedErrorMessage, getTokenIdFromReceipt, loadLastMintedNFT, saveMintToHistory as saveMintToHistoryHelper } from './lib/minting.js';
import { PredictionManager } from './lib/predictions.js';
import { GalleryManager } from './lib/gallery.js';
import { AchievementsManager } from './lib/achievements.js';
import { apiClient } from './lib/api-client.js';
import { isFarcasterEmbed, initializeFarcasterSDK, createCast } from './lib/farcaster.js';
import { getTimeAgo, animateCounter, sanitizeSVG, adjustInjectedSvg, setStatus } from './lib/utils.js';
import DownloadManager from './lib/downloads.js';
import TabManager from './lib/tabs.js';
import GiftManager from './lib/gift.js';

// Configuration
const PROJECT_ID = 'e0dd881bad824ac3418617434a79f917';
const MINIAPP_URL = 'https://farcaster.xyz/miniapps/Tip8ngTAKnHC/celo-nft';

// DOM Elements
const statusBox = document.getElementById('statusBox');
const mintBtn = document.getElementById('mintBtn');
const previewBtn = document.getElementById('previewBtn');
const connectBtn = document.getElementById('connectBtn');
const userAddrBox = document.getElementById('userAddressBox');
const previewContainer = document.getElementById('nft-preview-container');
const externalBanner = document.getElementById('externalBanner');
const externalBannerText = document.getElementById('externalBannerText');
const txLinksContainer = document.getElementById('txLinksContainer');
const nftActions = document.getElementById('nftActions');
const totalMintedStat = document.getElementById('totalMintedStat');
const yourMintsStat = document.getElementById('yourMintsStat');
const remainingStat = document.getElementById('remainingStat');

// Global state
let walletManager = null;
let mintingManager = null;
let predictionManager = null;
let galleryManager = null;
let achievementsManager = null;
let downloadManager = null;
let tabManager = null;
let giftManager = null;
let contractDetails = null;
let isFarcasterEnvironment = false;
let lastMintedTokenId = null;
let lastAirdropAmount = null;
let userMintCount = 0;
let currentNFTData = null;
let tradingViewLoaded = false;
let accountChangeTimeout = null;
let recentMintsInterval = null;
let leaderboardInterval = null;

// ✅ FIX: Expose wagmiConfig globally
let wagmiConfig = null;
let publicClient = null;

// Initialize application
async function initializeApp() {
  try {
    console.log('🚀 Initializing CeloNFT App...');
    
    // Detect Farcaster environment
    isFarcasterEnvironment = await isFarcasterEmbed();
    console.log('🔍 Farcaster environment:', isFarcasterEnvironment);
    
    // Configure banner
    if (externalBanner && externalBannerText) {
      externalBanner.classList.remove('hidden');
      if (isFarcasterEnvironment) {
        externalBanner.href = window.location.origin;
        externalBannerText.textContent = 'Open in Browser';
      } else {
        externalBanner.href = MINIAPP_URL;
        externalBannerText.textContent = 'Open in Farcaster';
        externalBanner.classList.add('pulse');
      }
      setTimeout(() => externalBanner.classList.add('show'), 100);
    }
    
    // Initialize wallet manager
    walletManager = new WalletManager({
      projectId: PROJECT_ID,
      appName: 'Celo NFT Mint',
      appDescription: 'Mint a free Celo NFT that shows the live CELO price!',
      appUrl: 'https://celo-nft-phi.vercel.app/',
      appIcon: 'https://celo-nft-phi.vercel.app/icon.png',
    });

    await walletManager.initialize();
    
    // ✅ FIX: Store wagmiConfig and publicClient globally
    wagmiConfig = walletManager.wagmiConfig;
    publicClient = walletManager.getPublicClient();
    console.log('✅ WalletManager initialized');

    // Initialize Farcaster SDK
    if (isFarcasterEnvironment) {
      await initializeFarcasterSDK();

      // Auto-connect Farcaster wallet if possible
      try {
        const address = await walletManager.connectFarcaster();
        if (address) {
          console.log('✅ Farcaster wallet auto-connected:', address);
          handleAccountChange({ address, isConnected: true });
        }
      } catch (error) {
        console.log('⚠️ Farcaster auto-connect failed:', error);
      }
    }

    // Watch account changes
    walletManager.watchAccountChanges(handleAccountChange);

    // Load contract
    contractDetails = await loadContractDetails();
    console.log('✅ Contract loaded:', contractDetails.address);
    
    // Initialize managers
    mintingManager = new MintingManager(wagmiConfig, contractDetails);
    await mintingManager.loadContractConfig();
    
    predictionManager = new PredictionManager();
    galleryManager = new GalleryManager(wagmiConfig, contractDetails);
    achievementsManager = new AchievementsManager(wagmiConfig, contractDetails);
    downloadManager = new DownloadManager();
    tabManager = new TabManager();
    giftManager = new GiftManager(mintingManager, safeLocalStorage);
    console.log('✅ All managers initialized');

    // Load saved state
    lastMintedTokenId = safeLocalStorage.getItem('lastMintedTokenId');
    if (lastMintedTokenId) {
      previewBtn.innerText = `Preview NFT #${lastMintedTokenId}`;
      previewBtn.classList.remove('hidden');
    }

    // Setup UI
    setupEventListeners();
    setupFilterListeners();
    setupSectionToggles(); // ✅ FIX: Add this
    tabManager.initializeTabs();
    initTradingView();

    // Load initial data
    await updateSupply(true);
    
    // ✅ FIX: Start polling with proper delays
    setTimeout(() => {
      startRecentMintsPolling();
      startLeaderboardPolling();
    }, 2000);
    
    console.log('✅ App initialized');
    setStatus('Ready to mint! Connect your wallet to get started.', 'info');
  } catch (error) {
    console.error('❌ Failed to initialize:', error);
    setStatus('Failed to initialize. Please refresh.', 'error');
  }
}

// Handle account changes
function handleAccountChange(account) {
  clearTimeout(accountChangeTimeout);
  accountChangeTimeout = setTimeout(async () => {
    try {
      if (account.address && account.isConnected) {
        console.log('✅ Account connected:', account.address);
        showAddress(account.address);
        setStatus('Wallet connected!', 'success');
        mintBtn.disabled = false;

        await updateSupply(true);
        await updateUserMintCount();
        await updateWalletBalance();
        await loadUserGallery(account.address);

        const tabNav = document.getElementById('tabNavigation');
        if (tabNav) tabNav.classList.remove('hidden');

        setTimeout(() => loadAchievementsBottom(), 1500);

        previewBtn.classList.add('hidden');
        previewContainer.classList.add('hidden');
        nftActions.classList.add('hidden');

        lastMintedTokenId = null;
        lastAirdropAmount = null;
      } else if (!account.isConnected) {
        console.log('🔌 Wallet disconnected');
        userAddrBox.classList.add('hidden');
        showConnectButton();
        setStatus('Wallet disconnected', 'warning');
        mintBtn.disabled = true;

        const tabNav = document.getElementById('tabNavigation');
        if (tabNav) tabNav.classList.add('hidden');
        const balanceBox = document.getElementById('walletBalanceBox');
        if (balanceBox) balanceBox.classList.add('hidden');

        if (totalMintedStat) totalMintedStat.textContent = '--';
        if (yourMintsStat) yourMintsStat.textContent = '--';
        if (remainingStat) remainingStat.textContent = '--';
      }
    } catch (error) {
      console.error('❌ Account change error:', error);
    }
  }, 300);
}

// Load contract details
async function loadContractDetails() {
  try {
    let response;
    try {
      response = await fetch('./contract.json');
    } catch {
      response = await fetch('/contract.json');
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Contract load error:', error);
    setStatus('Failed to load contract', 'error');
    throw error;
  }
}

// Setup event listeners
function setupEventListeners() {
  connectBtn.addEventListener('click', () => walletManager.openModal());
  mintBtn.addEventListener('click', handleMint);
  previewBtn.addEventListener('click', () => previewNft(lastMintedTokenId, true));
  
  const downloadSVG = document.getElementById('downloadSVG');
  const downloadGIF = document.getElementById('downloadGIF');
  const copyImageBtn = document.getElementById('copyImageBtn');
  const twitterBtn = document.getElementById('twitterBtn');
  const giftBtn = document.getElementById('giftBtn');
  
  if (downloadSVG) downloadSVG.addEventListener('click', async () => {
    try {
      setStatus('Downloading SVG...', 'info');
      await downloadManager.downloadSVGFile(lastMintedTokenId);
      setStatus('SVG downloaded!', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });
  
  if (downloadGIF) downloadGIF.addEventListener('click', async () => {
    try {
      setStatus('Generating PNG...', 'info');
      await downloadManager.downloadPNGFile(lastMintedTokenId);
      setStatus('PNG downloaded!', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });
  
  if (copyImageBtn) copyImageBtn.addEventListener('click', async () => {
    try {
      await downloadManager.copyImageToClipboard();
      setStatus('Image copied!', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });
  
  if (twitterBtn) twitterBtn.addEventListener('click', () => {
    try {
      downloadManager.shareToTwitter(lastAirdropAmount);
      setStatus('Opening Twitter...', 'info');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });
  
  if (giftBtn) giftBtn.addEventListener('click', () => {
    try {
      giftManager.showGiftModal(lastMintedTokenId);
    } catch (error) {
      setStatus(error.message, 'error');
    }
  });
}

// ✅ FIX: Setup section toggles
function setupSectionToggles() {
  const toggleRecentBtn = document.getElementById('toggleRecentBtn');
  const toggleLeaderboardBtn = document.getElementById('toggleLeaderboardBtn');
  const toggleAchievementsBtn = document.getElementById('toggleAchievementsBtn');
  
  const recentMintsSection = document.getElementById('recentMintsSection');
  const leaderboardSection = document.getElementById('leaderboardSection');
  const achievementsSection = document.getElementById('achievementsSection');
  
  if (!toggleRecentBtn || !toggleLeaderboardBtn || !toggleAchievementsBtn) {
    console.warn('⚠️ Toggle buttons not found');
    return;
  }
  
  toggleRecentBtn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    toggleRecentBtn.classList.add('active');
    
    if (recentMintsSection) recentMintsSection.style.display = 'block';
    if (leaderboardSection) leaderboardSection.style.display = 'none';
    if (achievementsSection) achievementsSection.style.display = 'none';
  });
  
  toggleLeaderboardBtn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    toggleLeaderboardBtn.classList.add('active');
    
    if (recentMintsSection) recentMintsSection.style.display = 'none';
    if (leaderboardSection) leaderboardSection.style.display = 'block';
    if (achievementsSection) achievementsSection.style.display = 'none';
    
    loadLeaderboard();
  });
  
  toggleAchievementsBtn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    toggleAchievementsBtn.classList.add('active');
    
    if (recentMintsSection) recentMintsSection.style.display = 'none';
    if (leaderboardSection) leaderboardSection.style.display = 'none';
    if (achievementsSection) achievementsSection.style.display = 'block';
    
    loadAchievementsBottom();
  });
}

// ✅ FIX: Setup filter listeners
function setupFilterListeners() {
  const rarityFilter = document.getElementById('rarityFilter');
  const sortFilter = document.getElementById('sortFilter');
  
  if (rarityFilter) {
    rarityFilter.addEventListener('change', () => {
      if (galleryManager && galleryManager.userNFTs) {
        galleryManager.renderGallery(galleryManager.userNFTs);
      }
    });
  }
  
  if (sortFilter) {
    sortFilter.addEventListener('change', () => {
      if (galleryManager && galleryManager.userNFTs) {
        galleryManager.renderGallery(galleryManager.userNFTs);
      }
    });
  }
}

// ✅ FIX: Polling functions
function startRecentMintsPolling() {
  if (recentMintsInterval) return;
  
  loadRecentMints(); // Initial load
  recentMintsInterval = setInterval(() => {
    if (document.getElementById('recentMintsSection')?.style.display !== 'none') {
      loadRecentMints();
    }
  }, 15000);
}

function startLeaderboardPolling() {
  if (leaderboardInterval) return;
  
  setTimeout(() => loadLeaderboard(), 1000); // Initial load
  leaderboardInterval = setInterval(() => {
    if (document.getElementById('leaderboardSection')?.style.display !== 'none') {
      loadLeaderboard();
    }
  }, 120000);
}

// Load recent mints
async function loadRecentMints() {
  const container = document.getElementById('recentMintsContainer');
  if (!container || !galleryManager) return;
  
  try {
    const mints = await galleryManager.fetchRecentMints(5);
    
    if (!mints || mints.length === 0) {
      container.innerHTML = '<div class="empty-state">No mints yet. Be the first! 🚀</div>';
      return;
    }
    
    const userAddress = walletManager.getAddress()?.toLowerCase();
    
    container.innerHTML = mints.map(mint => `
      <div class="mint-item ${mint.owner.toLowerCase() === userAddress ? 'your-mint' : ''}">
        <div class="mint-info">
          <span class="token-id">#${mint.tokenId}</span>
          <span class="rarity-badge" style="color: ${mint.rarityColor}; border-color: ${mint.rarityColor};">
            ${mint.rarity}
          </span>
        </div>
        <div class="mint-meta">
          <span class="owner">${mint.ownerShort}</span>
          <span class="time">${getTimeAgo(Date.now() - mint.timestamp)}</span>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load recent mints:', error);
    container.innerHTML = '<div class="empty-state">Failed to load</div>';
  }
}

// Load leaderboard
async function loadLeaderboard() {
  const container = document.getElementById('leaderboardContainer');
  if (!container || !galleryManager) return;
  
  try {
    container.innerHTML = '<div class="empty-state">Loading... ⏳</div>';
    
    const leaderboard = await galleryManager.fetchLeaderboard();
    
    if (!leaderboard || leaderboard.length === 0) {
      container.innerHTML = '<div class="empty-state">No data yet</div>';
      return;
    }
    
    const userAddress = walletManager.getAddress()?.toLowerCase();
    
    container.innerHTML = leaderboard.map((holder, index) => `
      <div class="leaderboard-item ${holder.address?.toLowerCase() === userAddress ? 'your-rank' : ''}">
        <div class="rank-badge">${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</div>
        <div class="holder-info">
          <div class="holder-address">
            ${holder.address?.toLowerCase() === userAddress ? '👑 You' : holder.shortAddress}
          </div>
          <div class="holder-rarities">
            ${holder.rarities?.mythic > 0 ? `<span class="rarity-count mythic">${holder.rarities.mythic}M</span>` : ''}
            ${holder.rarities?.legendary > 0 ? `<span class="rarity-count legendary">${holder.rarities.legendary}L</span>` : ''}
            ${holder.rarities?.rare > 0 ? `<span class="rarity-count rare">${holder.rarities.rare}R</span>` : ''}
          </div>
        </div>
        <div class="holder-count">${holder.count} NFTs</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load leaderboard:', error);
    container.innerHTML = '<div class="empty-state">Failed to load</div>';
  }
}

// Load achievements
async function loadAchievementsBottom() {
  if (!achievementsManager || !walletManager) return;
  
  const address = walletManager.getAddress();
  if (address && contractDetails) {
    try {
      const balance = await mintingManager.getUserBalance(address);
      await achievementsManager.loadAchievementsBottom(address, contractDetails, balance);
    } catch (error) {
      console.error('Failed to load achievements:', error);
    }
  }
}

// Handle mint
async function handleMint() {
  try {
    if (!contractDetails) {
      setStatus("Contract missing", "error");
      return;
    }

    const account = walletManager.getAccount();
    if (account.chainId !== 42220) {
      setStatus("Switch to Celo Mainnet", "error");
      walletManager.openModal('Networks');
      return;
    }

    // Prediction modal
    setStatus('Ready to predict? 📈', 'info');
    const predictionResult = await predictionManager.showPredictionModal(
      account.address,
      apiClient.fetchCeloPrice.bind(apiClient)
    );

    // Reset UI
    previewBtn.classList.add('hidden');
    previewContainer.classList.add('hidden');
    txLinksContainer.classList.add('hidden');
    nftActions.classList.add('hidden');
    mintBtn.disabled = true;
    mintBtn.innerHTML = '<span class="spinner"></span> Minting...';

    // Mint
    const priceData = await apiClient.fetchCeloPrice();
    const priceForContract = Math.floor(priceData.price * 10000);

    const { hash } = await mintingManager.mint(priceForContract);
    setStatus("Confirming...", "info");
    const receipt = await mintingManager.waitForMint(hash, 30000);

    const tokenId = getTokenIdFromReceipt(receipt);
    if (!tokenId) throw new Error('No token ID');

    safeLocalStorage.setItem('lastMintedTokenId', tokenId.toString());
    celebrateMint();
    setStatus("🎉 Mint Successful!", "success");

    lastMintedTokenId = tokenId;
    saveMintToHistory(tokenId, hash);
    showTransactionLinks(tokenId, hash);

    await updateSupply();
    await updateUserMintCount();
    await updateWalletBalance();
    
    previewBtn.classList.remove('hidden');
    previewBtn.innerText = `Preview NFT #${tokenId}`;
    await previewNft(tokenId, true);

    // Reload feeds
    loadRecentMints();
    loadLeaderboard();

    // Handle airdrop
    if (predictionResult.skip) {
      setTimeout(async () => {
        const airdropResult = await apiClient.claimAirdrop(tokenId, account.address, hash, 1);
        if (airdropResult?.luckyMultiplier > 1 || airdropResult?.rarityMultiplier > 1) {
          setTimeout(async () => {
            predictionManager.showPredictionResultPopup({
              success: true, correct: null, prediction: 'skipped',
              startPrice: 0, endPrice: 0, priceChange: '0',
              priceChangePercent: '0', multiplier: 1, stats: null
            }, airdropResult);
            // Refresh wallet balance after bonus airdrop
            await updateWalletBalance();
          }, 2000);
        } else {
          // Standard airdrop - still refresh balance
          await updateWalletBalance();
        }
      }, 2000);
    } else {
      const delay = Math.max(predictionResult.timeLeft || 0, 1000);
      setTimeout(async () => {
        try {
          setStatus('🔍 Verifying...', 'info');
          const verifyResult = await predictionManager.verifyPrediction(
            account.address,
            predictionResult,
            apiClient.fetchCeloPrice.bind(apiClient)
          );

          const airdropResult = await apiClient.claimAirdrop(
            tokenId, account.address, hash, verifyResult.multiplier || 1
          );

          if (airdropResult && verifyResult) {
            setTimeout(async () => {
              predictionManager.showPredictionResultPopup(verifyResult, airdropResult);
              // Refresh wallet balance after airdrop
              await updateWalletBalance();
            }, 2000);
          } else {
            // Even if popup not shown, refresh balance after claim
            await updateWalletBalance();
          }
        } catch (error) {
          console.error('Verification failed:', error);
          await apiClient.claimAirdrop(tokenId, account.address, hash, 1);
          await updateWalletBalance();
        }
      }, delay);
    }
  } catch (error) {
    const errorMsg = getImprovedErrorMessage(error);
    setStatus(errorMsg, "error");
    console.error('Mint error:', error);
  } finally {
    mintBtn.disabled = false;
    const celoPrice = Number(mintingManager.mintPrice) / 1e18;
    mintBtn.innerText = mintingManager.mintPrice > 0n ? `MINT (${celoPrice.toFixed(4)} CELO)` : 'MINT';
  }
}

// Update supply
async function updateSupply(initialLoad = false) {
  try {
    if (!mintingManager) return 0;

    const total = await mintingManager.getTotalSupply();

    if (totalMintedStat) {
      const current = parseInt(totalMintedStat.textContent) || 0;
      if (current !== total) animateCounter(totalMintedStat, current, total, 800);
    }

    if (remainingStat) {
      const remaining = mintingManager.maxSupply - total;
      remainingStat.textContent = remaining > 0 ? remaining : '∞';
    }

    if (mintingManager.maxSupply > 0 && total >= mintingManager.maxSupply) {
      mintBtn.disabled = true;
      mintBtn.innerText = "SOLD OUT";
    } else if (!initialLoad && mintBtn.innerText !== "SOLD OUT") {
      mintBtn.disabled = false;
      const price = Number(mintingManager.mintPrice) / 1e18;
      mintBtn.innerText = mintingManager.mintPrice > 0n ? `MINT (${price.toFixed(4)} CELO)` : 'MINT';
    }

    return total;
  } catch (error) {
    console.error('Error updating supply:', error);
    return 0;
  }
}

// Update user mint count
async function updateUserMintCount() {
  const address = walletManager.getAddress();
  if (!address) {
    if (yourMintsStat) yourMintsStat.textContent = '--';
    return;
  }

  try {
    const balance = await mintingManager.getUserBalance(address);
    userMintCount = balance;
    if (yourMintsStat) yourMintsStat.textContent = userMintCount;
    
    if (userMintCount > 0 && !lastMintedTokenId) {
      const lastToken = await loadLastMintedNFT(wagmiConfig, contractDetails, address);
      if (lastToken) {
        lastMintedTokenId = lastToken;
        previewBtn.innerText = `Preview NFT #${lastToken}`;
        previewBtn.classList.remove('hidden');
        setTimeout(() => previewNft(lastMintedTokenId, false), 1000);
      }
    }
  } catch (error) {
    console.error('Error fetching balance:', error);
  }
}

// Update wallet balance
async function updateWalletBalance() {
  const balanceBox = document.getElementById('walletBalanceBox');
  const celoBalanceEl = document.getElementById('celoBalance');
  const celoBalanceUSDEl = document.getElementById('celoBalanceUSD');

  const address = walletManager.getAddress();
  if (!address || !balanceBox) return;

  try {
    const balance = await walletManager.getBalance(address);
    const balanceInCelo = walletManager.formatBalance(balance);
    celoBalanceEl.textContent = balanceInCelo + ' CELO';

    let celoPrice = 0;
    try {
      const priceData = await apiClient.fetchCeloPrice();
      celoPrice = parseFloat(priceData.price);
    } catch {}

    const usdValue = parseFloat(balanceInCelo) * celoPrice;
    celoBalanceUSDEl.textContent = `≈ $${usdValue.toFixed(2)} USD`;

    balanceBox.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to fetch balance:', error);
  }
}

// Load user gallery
async function loadUserGallery(userAddress) {
  if (!galleryManager || !userAddress) return;
  
  try {
    const nfts = await galleryManager.loadUserGallery(userAddress);
    galleryManager.renderGallery(nfts);
  } catch (error) {
    console.error('Failed to load gallery:', error);
  }
}

// Show address
function showAddress(addr) {
  const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  userAddrBox.innerHTML = `<span style="cursor: pointer;">Your address: ${shortAddr}</span>`;
  userAddrBox.classList.remove('hidden');
  connectBtn.classList.add('hidden');
  mintBtn.classList.remove('hidden');
  userAddrBox.onclick = () => walletManager.openModal();
}

// Show connect button
function showConnectButton() {
  connectBtn.classList.remove('hidden');
  mintBtn.classList.add('hidden');
  userAddrBox.classList.add('hidden');
}

// Save mint to history
function saveMintToHistory(tokenId, txHash) {
  const address = walletManager.getAddress();
  if (!address) return;
  saveMintToHistoryHelper(tokenId, txHash, address, safeLocalStorage);
}

// Show transaction links (always include Cast button, like main.old.js)
function showTransactionLinks(tokenId, txHash) {
  if (!txLinksContainer) return;
  
  const explorerUrl = `https://celoscan.io/tx/${txHash}`;
  const nftUrl = `https://celoscan.io/nft/${contractDetails.address}/${tokenId}`;
  
  txLinksContainer.innerHTML = `
    <a href="${explorerUrl}" target="_blank" rel="noopener noreferrer">🔍 View on Celoscan</a>
    <a href="${nftUrl}" target="_blank" rel="noopener noreferrer">🖼️ View NFT</a>
    <button class="cast-link" onclick="handleCastClick(${tokenId})">📣 Cast</button>
  `;
  
  txLinksContainer.classList.remove('hidden');
}

// Track last preview details for Farcaster casts (mirrors main.old.js behavior)
let lastCastInfo = { tokenId: null, rarityText: null, priceText: null };

// Handle cast
window.handleCastClick = async function(tokenId) {
  try {
    // Prefer detailed info from the last preview
    const useDetails = lastCastInfo.tokenId === tokenId;
    const rarityText = useDetails && lastCastInfo.rarityText ? lastCastInfo.rarityText : 'NFT';
    const priceText = useDetails && lastCastInfo.priceText ? lastCastInfo.priceText : null;

    let text;
    if (lastAirdropAmount) {
      const airdropFormatted = parseFloat(lastAirdropAmount).toFixed(4);
      if (priceText) {
        text = `I just minted CELO NFT #${tokenId} (${rarityText}) at $${priceText} and received ${airdropFormatted} CELO airdrop! 🎨✨💰\n\nMint yours now:`;
      } else {
        text = `I just minted CELO NFT #${tokenId} and received ${airdropFormatted} CELO airdrop! 🎨✨💰\n\nMint yours now:`;
      }
    } else if (priceText) {
      text = `I just minted CELO NFT #${tokenId} (${rarityText}) at $${priceText}! 🎨✨\n\nMint yours now:`;
    } else {
      text = `I just minted CELO NFT #${tokenId}! 🎨✨\n\nMint yours now:`;
    }

    await createCast(
      text,
      `${MINIAPP_URL}`,
      isFarcasterEnvironment,
      setStatus
    );
  } catch (error) {
    console.error('Cast failed:', error);
  }
};

// Preview NFT (ported from main.old.js behavior)
async function previewNft(tokenId, isNewMint = false) {
  if (!contractDetails || !tokenId) return;

  // Reset status and show loading spinner like old version
  setStatus('', 'info');
  previewContainer.innerHTML = '<div style="display: flex; justify-content: center; align-items: center; height: 200px;"><span class="spinner" style="width: 40px; height: 40px; border-width: 4px;"></span></div>';
  previewContainer.classList.remove('hidden');

  previewBtn.disabled = true;
  previewBtn.innerHTML = '<span class="spinner"></span> Loading Preview…';
  previewContainer.classList.remove('sparkles', 'common', 'rare', 'legendary', 'mythic');
  nftActions.classList.add('hidden');

  if (!isNewMint) {
    txLinksContainer.classList.add('hidden');
  }

  const nftActionsRow2 = document.getElementById('nftActionsRow2');
  if (nftActionsRow2) nftActionsRow2.classList.add('hidden');

  try {
    const tokenURI = await mintingManager.getTokenURI(tokenId);
    if (!tokenURI) throw new Error('Missing tokenURI');

    let metadata = null;
    let svgString = '';

    if (tokenURI.startsWith('data:')) {
      const base64Json = tokenURI.split(',')[1];
      if (!base64Json) throw new Error('Invalid tokenURI format');

      const jsonString = atob(decodeURIComponent(base64Json));
      metadata = JSON.parse(jsonString);

      if (!metadata.image) throw new Error('Missing image field in metadata');
      const base64Svg = metadata.image.split(',')[1];
      if (!base64Svg) throw new Error('Invalid image data format');

      svgString = atob(decodeURIComponent(base64Svg));
    } else {
      // Fallback: fetch JSON from URL and then SVG
      const metaRes = await fetch(tokenURI);
      if (!metaRes.ok) throw new Error('Failed to fetch metadata');
      metadata = await metaRes.json();
      if (!metadata.image) throw new Error('Missing image field in metadata');

      if (metadata.image.startsWith('data:image/svg+xml;base64,')) {
        const base64Svg = metadata.image.split(',')[1];
        svgString = atob(decodeURIComponent(base64Svg));
      } else {
        const svgRes = await fetch(metadata.image);
        if (!svgRes.ok) throw new Error('Failed to fetch SVG image');
        svgString = await svgRes.text();
      }
    }

    const safeSvg = sanitizeSVG(svgString);

    currentNFTData = {
      svg: safeSvg,
      metadata,
      tokenId,
    };
    downloadManager.setCurrentNFTData(currentNFTData);

    previewContainer.innerHTML = safeSvg;
    adjustInjectedSvg(previewContainer);

    let rarityText = 'Common';
    let priceText = 'N/A';

    if (metadata?.attributes) {
      const rarityAttr = metadata.attributes.find((attr) => attr.trait_type === 'Rarity');
      const priceAttr = metadata.attributes.find((attr) => attr.trait_type === 'CELO Price Snapshot');

      if (rarityAttr) rarityText = rarityAttr.value;
      if (priceAttr) priceText = priceAttr.value;
    }

    previewContainer.classList.add('sparkles');
    const rarityClassLower = rarityText.toLowerCase();
    previewContainer.classList.add(rarityClassLower);

    const buttonLabel = `Preview NFT #${tokenId} (${rarityText} / ${priceText})`;
    previewBtn.innerText = buttonLabel;

    nftActions.classList.remove('hidden');
    if (nftActionsRow2) nftActionsRow2.classList.remove('hidden');

    // Store details for Farcaster cast text (rarity + price)
    lastCastInfo = {
      tokenId,
      rarityText,
      priceText,
    };

    setStatus(`NFT #${tokenId} loaded!`, 'success');
  } catch (error) {
    console.error(`NFT Preview Error for token ID ${tokenId}:`, error);
    setStatus('Failed to load NFT preview. Check console for details.', 'error');
    previewBtn.innerText = 'Preview NFT Error';
    previewContainer.classList.add('hidden');
    nftActions.classList.add('hidden');
    const nftActionsRow2 = document.getElementById('nftActionsRow2');
    if (nftActionsRow2) nftActionsRow2.classList.add('hidden');
    txLinksContainer.classList.add('hidden');
  } finally {
    previewBtn.disabled = false;
  }
}

// Initialize TradingView
function initTradingView() {
  if (tradingViewLoaded) return;
  tradingViewLoaded = true;

  const container = document.getElementById('celo-chart');
  if (!container) {
    console.error('❌ TradingView container not found');
    return;
  }
  
  const script = document.createElement('script');
  script.src = 'https://s3.tradingview.com/tv.js';
  script.async = true;
  script.onload = () => {
    try {
      // Small delay to ensure TradingView global is ready
      setTimeout(() => {
        try {
          // eslint-disable-next-line no-undef
          new TradingView.widget({
            autosize: true,
            symbol: "BINANCE:CELOUSDT",
            interval: "60",
            theme: "dark",
            style: "1",
            hide_top_toolbar: true,
            withdateranges: false,
            toolbar_bg: "#1f1f1f",
            locale: "en",
            enable_publishing: false,
            allow_symbol_change: false,
            container_id: "celo-chart"
          });
        } catch (error) {
          console.error('TradingView widget error:', error);
        }
      }, 500);
    } catch (error) {
      console.error('TradingView error:', error);
    }
  };
  script.onerror = () => {
    console.error('❌ Failed to load TradingView script');
  };
  document.head.appendChild(script);
}

// View NFT details (for gallery)
function viewNFTDetails(tokenId) {
  tabManager.switchTab('mint');
  if (lastMintedTokenId !== tokenId) {
    lastMintedTokenId = tokenId;
    previewNft(tokenId, true);
  }
}

// Expose globally
window.viewNFTDetails = viewNFTDetails;

// Listen for gallery tab open
window.addEventListener('galleryTabOpened', async () => {
  if (galleryManager && walletManager.isConnected()) {
    const address = walletManager.getAddress();
    await loadUserGallery(address);
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
