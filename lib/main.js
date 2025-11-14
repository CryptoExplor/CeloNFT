/**
 * Main Application Entry Point
 * Orchestrates all modules and handles UI interactions
 */

// Buffer polyfill for WalletConnect
import { Buffer } from 'buffer';
window.Buffer = Buffer;
window.global = window.global || window;
window.process = window.process || { env: {} };

import { WalletManager, safeLocalStorage } from './wallet.js';
import { MintingManager, celebrateMint, getImprovedErrorMessage, getTokenIdFromReceipt, loadLastMintedNFT } from './minting.js';
import { PredictionManager } from './predictions.js';
import { GalleryManager } from './gallery.js';
import { AchievementsManager } from './achievements.js';
import { apiClient } from './api-client.js';
import { isFarcasterEmbed, initializeFarcasterSDK, createCast, promptAddMiniApp } from './farcaster.js';
import { getTimeAgo, animateCounter, sanitizeSVG, adjustInjectedSvg, setStatus } from './utils.js';
import DownloadManager from './downloads.js';
import TabManager from './tabs.js';
import FeedManager from './feeds.js';
import GiftManager from './gift.js';

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
let feedManager = null;
let giftManager = null;
let contractDetails = null;
let isFarcasterEnvironment = false;
let lastMintedTokenId = null;
let lastAirdropAmount = null; // Store last airdrop amount for cast
let userMintCount = 0;
let recentMintsInterval = null;
let leaderboardInterval = null;
let currentNFTData = null;
let tradingViewLoaded = false;
let accountChangeTimeout = null;


// Initialize application
async function initializeApp() {
  try {
    // Initialize managers
    walletManager = new WalletManager({
      projectId: PROJECT_ID,
      appName: 'Celo NFT Mint',
      appDescription: 'Mint a free Celo NFT that shows the live CELO price!',
      appUrl: 'https://celo-nft-phi.vercel.app/',
      appIcon: 'https://celo-nft-phi.vercel.app/icon.png',
    });

    await walletManager.initialize();

    // Detect Farcaster environment
    isFarcasterEnvironment = await isFarcasterEmbed();

    // Initialize Farcaster SDK if in Farcaster
    if (isFarcasterEnvironment) {
      await initializeFarcasterSDK();
    }

    // Set up account watching
    walletManager.watchAccountChanges(handleAccountChange);

    // Load contract details
    contractDetails = await loadContractDetails();
    
    // Initialize other managers
    mintingManager = new MintingManager(walletManager.wagmiConfig, contractDetails);
    predictionManager = new PredictionManager();
    galleryManager = new GalleryManager(walletManager.wagmiConfig, contractDetails);
    achievementsManager = new AchievementsManager(walletManager.wagmiConfig, contractDetails);
    downloadManager = new DownloadManager();
    tabManager = new TabManager();
    feedManager = new FeedManager(walletManager.wagmiConfig, contractDetails);
    giftManager = new GiftManager(mintingManager, safeLocalStorage);

    // Load initial state
    lastMintedTokenId = safeLocalStorage.getItem('lastMintedTokenId');
    if (lastMintedTokenId) {
      previewBtn.innerText = `Preview NFT #${lastMintedTokenId}`;
      previewBtn.classList.remove('hidden');
    }

    // Set up UI event listeners
    setupEventListeners();
    setupFilterListeners();
    tabManager.initializeTabs();

    // Start polling for recent mints
    feedManager.startRecentMintsPolling();
    feedManager.startLeaderboardPolling();

    console.log('App initialized successfully');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    setStatus('Failed to initialize. Please refresh the page.', 'error');
  }
}

// Handle account changes
function handleAccountChange(account) {
  clearTimeout(accountChangeTimeout);
  accountChangeTimeout = setTimeout(() => {
    try {
      if (account.address && account.isConnected) {
        console.log('Account changed to:', account.address);
        showAddress(account.address);
        setStatus('Wallet connected successfully!', 'success');
        mintBtn.disabled = false;

        // Update stats
        updateSupply(true);
        updateUserMintCount();

        // Show tab navigation and update balance
        const tabNav = document.getElementById('tabNavigation');
        if (tabNav) tabNav.classList.remove('hidden');
        updateWalletBalance();

        // Load achievements
        setTimeout(() => loadAchievementsBottom(), 1500);

        previewBtn.classList.add('hidden');
        previewContainer.classList.add('hidden');
        nftActions.classList.add('hidden');

        lastMintedTokenId = null;
        lastAirdropAmount = null;
        safeLocalStorage.removeItem('lastMintedTokenId');
      } else if (!account.isConnected) {
        console.log('Wallet disconnected');

        // Clean up intervals to prevent memory leaks
        if (feedManager) {
          feedManager.stopRecentMintsPolling();
          feedManager.stopLeaderboardPolling();
        }

        userAddrBox.classList.add('hidden');
        showConnectButton();
        setStatus('Wallet disconnected. Please connect again.', 'warning');
        mintBtn.disabled = true;

        // Hide tabs and balance
        const tabNav = document.getElementById('tabNavigation');
        if (tabNav) tabNav.classList.add('hidden');
        const balanceBox = document.getElementById('walletBalanceBox');
        if (balanceBox) balanceBox.classList.add('hidden');

        previewBtn.classList.add('hidden');
        previewContainer.classList.add('hidden');
        nftActions.classList.add('hidden');
        if (totalMintedStat) totalMintedStat.textContent = '--';
        if (yourMintsStat) yourMintsStat.textContent = '--';
        if (remainingStat) remainingStat.textContent = '--';
        safeLocalStorage.removeItem('lastMintedTokenId');
        lastMintedTokenId = null;
        lastAirdropAmount = null;
      }
    } catch (error) {
      console.error('Account change error:', error);
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

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const details = await response.json();
    console.log('Contract loaded:', details.address);
    return details;
  } catch (error) {
    setStatus('Missing contract details.', 'error');
    console.error('Contract load error:', error);

    const retryBtn = document.createElement('button');
    retryBtn.className = 'action-button';
    retryBtn.style.cssText =
      'background: linear-gradient(90deg, #f59e0b, #f97316); padding: 0.8rem 1.5rem; font-size: 1rem; margin-top: 12px;';
    retryBtn.innerText = '🔄 Retry Load';
    retryBtn.onclick = () => window.location.reload();

    statusBox.appendChild(document.createElement('br'));
    statusBox.appendChild(retryBtn);

    mintBtn.disabled = true;
    throw error;
  }
}

// Set up event listeners
function setupEventListeners() {
  connectBtn.addEventListener('click', () => {
    walletManager.openModal();
  });

  mintBtn.addEventListener('click', handleMint);
  previewBtn.addEventListener('click', () => previewNft(lastMintedTokenId, true));
  
  // Add download button event listeners
  const downloadSVG = document.getElementById('downloadSVG');
  const downloadGIF = document.getElementById('downloadGIF');
  const copyImageBtn = document.getElementById('copyImageBtn');
  const twitterBtn = document.getElementById('twitterBtn');
  const giftBtn = document.getElementById('giftBtn');
  
  if (downloadSVG) {
    downloadSVG.addEventListener('click', async () => {
      try {
        await downloadManager.downloadSVGFile(lastMintedTokenId);
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
  }
  
  if (downloadGIF) {
    downloadGIF.addEventListener('click', async () => {
      try {
        await downloadManager.downloadPNGFile(lastMintedTokenId);
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
  }
  
  if (copyImageBtn) {
    copyImageBtn.addEventListener('click', async () => {
      try {
        await downloadManager.copyImageToClipboard();
        setStatus('Image copied to clipboard!', 'success');
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
  }
  
  if (twitterBtn) {
    twitterBtn.addEventListener('click', () => {
      try {
        downloadManager.shareToTwitter(lastAirdropAmount);
        setStatus('Opening Twitter...', 'info');
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
  }
  
  if (giftBtn) {
    giftBtn.addEventListener('click', () => {
      try {
        giftManager.showGiftModal(lastMintedTokenId);
      } catch (error) {
        setStatus(error.message, 'error');
      }
    });
  }
}

// Stop recent mints polling
// function stopRecentMintsPolling() {
//   if (recentMintsInterval) {
//     clearInterval(recentMintsInterval);
//     recentMintsInterval = null;
//   }
// }

// Load achievements in bottom section
async function loadAchievementsBottom() {
  if (achievementsManager && walletManager) {
    const address = walletManager.getAddress();
    if (address && contractDetails) {
      try {
        // Get user mint count
        const balance = await mintingManager.getUserBalance(address);
        const userMintCount = Number(balance);
        
        // Load achievements
        await achievementsManager.loadAchievementsBottom(address, contractDetails, userMintCount);
      } catch (error) {
        console.error('Failed to load achievements:', error);
      }
    }
  }
}



// Handle mint process
async function handleMint() {
  try {
    if (!contractDetails) {
      setStatus("Contract details are missing. Cannot mint.", "error");
      return;
    }

    if (mintBtn.disabled && mintBtn.innerText === "SOLD OUT") {
      setStatus("This NFT drop is sold out.", "warning");
      return;
    }

    const account = walletManager.getAccount();
    if (account.chainId !== 42220) { // Celo chain ID
      setStatus("⚠️ Please switch to Celo Mainnet", "error");
      walletManager.openModal('Networks');
      return;
    }

    // Show prediction modal
    setStatus('Ready to predict? 📈', 'info');
    const predictionResult = await predictionManager.showPredictionModal(
      account.address,
      apiClient.fetchCeloPrice.bind(apiClient)
    );

    console.log('Prediction result:', predictionResult);

    statusBox.innerHTML = '';
    statusBox.className = 'status-box';

    // Hide UI elements
    previewBtn.classList.add('hidden');
    previewContainer.classList.add('hidden');
    txLinksContainer.classList.add('hidden');
    nftActions.classList.add('hidden');

    mintBtn.disabled = true;
    mintBtn.innerHTML = '<span class="spinner"></span> Minting...';
    lastMintedTokenId = null;
    lastAirdropAmount = null;

    // Mint NFT
    const priceData = await apiClient.fetchCeloPrice();
    const price = priceData.price;
    const priceForContract = Math.floor(price * 10000);

    const { hash } = await mintingManager.mint(priceForContract);
    setStatus("Confirming transaction...", "info");
    const receipt = await mintingManager.waitForMint(hash, 30000);

    const actualTokenId = getTokenIdFromReceipt(receipt);
    if (!actualTokenId) {
      throw new Error('Failed to get token ID from receipt');
    }

    safeLocalStorage.setItem('lastMintedTokenId', actualTokenId.toString());
    celebrateMint();

    setStatus("🎉 Mint Successful!", "success");

    const priceText = price.toFixed(4);
    lastMintedTokenId = actualTokenId;
    saveMintToHistory(actualTokenId, hash);

    await updateSupply();
    previewBtn.classList.remove('hidden');
    previewBtn.innerText = `Preview NFT #${actualTokenId}`;
    await previewNft(lastMintedTokenId, true);

    // Update wallet balance after mint
    updateWalletBalance();

    // Handle airdrop based on prediction
    if (predictionResult.skip) {
      // User skipped prediction - send standard airdrop
      setTimeout(async () => {
        const airdropResult = await apiClient.claimAirdrop(
          actualTokenId,
          account.address,
          hash,
          1
        );

        // Show bonus popup if user got bonuses
        if (
          airdropResult &&
          (airdropResult.luckyMultiplier > 1 ||
            airdropResult.rarityMultiplier > 1 ||
            airdropResult.bonusMessages)
        ) {
          setTimeout(() => {
            const fakeVerifyResult = {
              success: true,
              correct: null,
              prediction: 'skipped',
              startPrice: 0,
              endPrice: 0,
              priceChange: '0',
              priceChangePercent: '0',
              multiplier: 1,
              stats: null,
            };
            predictionManager.showPredictionResultPopup(fakeVerifyResult, airdropResult);
          }, 2000);
        }
      }, 2000);
    } else {
      // User made a prediction - wait for verification
      const remainingSeconds = Math.ceil(predictionResult.timeLeft / 1000);
      setStatus(`⏳ Waiting for price verification... (${remainingSeconds}s remaining)`, 'info');

      // Fix race condition: ensure minimum delay of 1 second
      const safeDelay = Math.max(predictionResult.timeLeft || 0, 1000);

      // Schedule airdrop after remaining time
      setTimeout(async () => {
        try {
          setStatus('🔍 Verifying prediction result...', 'info');

          // Verify prediction
          const verifyResult = await predictionManager.verifyPrediction(
            account.address,
            predictionResult.timestamp,
            apiClient.fetchCeloPrice.bind(apiClient)
          );

          const multiplier = verifyResult.multiplier || 1;

          console.log('Prediction verification result:', verifyResult);

          if (verifyResult.correct) {
            setStatus('🎯 Correct prediction! Claiming 2x airdrop...', 'success');
          } else {
            setStatus('🎲 Wrong prediction. Claiming 0.5x consolation airdrop...', 'info');
          }

          // Claim airdrop with verified multiplier
          const airdropResult = await apiClient.claimAirdrop(
            actualTokenId,
            account.address,
            hash,
            multiplier
          );

          console.log('Airdrop result:', airdropResult);

          // Add validation before showing popup
          if (!verifyResult || !airdropResult) {
            console.error('Missing required data for popup:', { verifyResult, airdropResult });
            return; // Early exit
          }

          // Show prediction result popup after airdrop is sent
          if (airdropResult && verifyResult) {
            console.log('Showing prediction result popup...');
            setTimeout(() => {
              predictionManager.showPredictionResultPopup(verifyResult, airdropResult);
            }, 2000);
          } else {
            console.log('Popup not shown - missing data:', { airdropResult, verifyResult });
          }
        } catch (error) {
          console.error('Prediction verification failed:', error);
          // Fallback to standard airdrop if verification fails
          setStatus('⚠️ Verification failed. Sending standard airdrop...', 'warning');
          await apiClient.claimAirdrop(actualTokenId, account.address, hash, 1);
        }
      }, safeDelay);
    }
  } catch (error) {
    const errorMsg = getImprovedErrorMessage(error);
    setStatus(errorMsg, "error");
    console.error('Mint Error:', error);

    if (!errorMsg.includes('rejected') && !errorMsg.includes('already minted')) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'action-button';
      retryBtn.style.cssText =
        'background: linear-gradient(90deg, #f59e0b, #f97316); padding: 0.6rem 1.2rem; font-size: 0.9rem; margin-top: 12px;';
      retryBtn.innerHTML = '🔄 Retry Mint';
      retryBtn.onclick = () => mintBtn.click();

      statusBox.appendChild(document.createElement('br'));
      statusBox.appendChild(retryBtn);
    }

    previewBtn.classList.add('hidden');
    previewContainer.classList.add('hidden');
    nftActions.classList.add('hidden');
    safeLocalStorage.removeItem('lastMintedTokenId');
    lastMintedTokenId = null;
    lastAirdropAmount = null;
  }
}

// Update supply counters
async function updateSupply(initialLoad = false) {
  try {
    if (!contractDetails) return 0;

    const total = await mintingManager.getTotalSupply();

    if (totalMintedStat) {
      const current = parseInt(totalMintedStat.textContent) || 0;
      if (current !== total) {
        animateCounter(totalMintedStat, current, total, 800);
      }
    }

    if (remainingStat) {
      const remaining = mintingManager.maxSupply - total;
      remainingStat.textContent = remaining > 0 ? remaining : '0';
    }

    if (mintingManager.maxSupply > 0 && total >= mintingManager.maxSupply) {
      mintBtn.disabled = true;
      mintBtn.innerText = "SOLD OUT";
      mintBtn.title = "The maximum supply has been reached.";

      if (!initialLoad) {
        setStatus(`All ${mintingManager.maxSupply} NFTs have been minted!`, "warning");
      }
    } else if (!initialLoad && mintBtn.innerText !== "SOLD OUT") {
      mintBtn.disabled = false;
      const celoPrice = Number(mintingManager.mintPrice) / 1e18;
      mintBtn.innerText = mintingManager.mintPrice > 0n ? `MINT (${celoPrice.toFixed(4)} CELO)` : 'MINT';
      mintBtn.title = '';
    }

    return total;
  } catch (error) {
    if (totalMintedStat) totalMintedStat.textContent = '--';
    if (remainingStat) remainingStat.textContent = '--';
    console.error('Error updating supply:', error);
    return 0;
  }
}

// Update user mint count
function updateUserMintCount() {
  const address = walletManager.getAddress();
  if (!address || !contractDetails) {
    if (yourMintsStat) yourMintsStat.textContent = '--';
    return;
  }

  mintingManager.getUserBalance(address).then((balance) => {
    userMintCount = balance;
    if (yourMintsStat) {
      yourMintsStat.textContent = userMintCount;
    }
    
    // Load last minted NFT if user has mints but no last token ID
    if (userMintCount > 0 && !lastMintedTokenId) {
      loadLastMintedNFT(walletManager.wagmiConfig, contractDetails, address);
    }
  }).catch((error) => {
    console.error('Error fetching user balance:', error);
    const history = JSON.parse(safeLocalStorage.getItem('mintHistory') || '[]');
    const userMints = history.filter(m => m.address === address);
    userMintCount = userMints.length;
    if (yourMintsStat) {
      yourMintsStat.textContent = userMintCount;
    }
  });
}

// Update wallet balance
async function updateWalletBalance() {
  const balanceBox = document.getElementById('walletBalanceBox');
  const celoBalanceEl = document.getElementById('celoBalance');
  const celoBalanceUSDEl = document.getElementById('celoBalanceUSD');

  const address = walletManager.getAddress();
  if (!address || !balanceBox) return;

  try {
    // Get CELO balance
    const balance = await walletManager.getBalance(address);
    const balanceInCelo = walletManager.formatBalance(balance);
    celoBalanceEl.textContent = balanceInCelo + ' CELO';

    // Get CELO price
    let celoPrice = 0;
    try {
      const priceData = await apiClient.fetchCeloPrice();
      celoPrice = parseFloat(priceData.price); // Extract price from object and ensure it's a number
    } catch (error) {
      console.log('Could not fetch CELO price for USD conversion');
    }

    // Calculate USD value
    const usdValue = parseFloat(balanceInCelo) * celoPrice;
    celoBalanceUSDEl.textContent = `≈ $${usdValue.toFixed(2)} USD`;

    balanceBox.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to fetch wallet balance:', error);
  }
}

// Show address in UI
function showAddress(addr) {
  const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  userAddrBox.innerHTML = `<span style="cursor: pointer;" title="Click to change wallet">Your address: ${shortAddr}</span>`;
  userAddrBox.classList.remove('hidden');
  connectBtn.classList.add('hidden');
  mintBtn.classList.remove('hidden');

  userAddrBox.onclick = () => {
    walletManager.openModal();
  };
}

// Show connect button
function showConnectButton() {
  connectBtn.classList.remove('hidden');
  mintBtn.classList.add('hidden');
  userAddrBox.classList.add('hidden');
}

// Save mint to history
function saveMintToHistory(tokenId, txHash) {
  try {
    const address = walletManager.getAddress();
    if (!address) return;

    const history = JSON.parse(safeLocalStorage.getItem('mintHistory') || '[]');
    history.push({
      tokenId,
      txHash,
      address,
      timestamp: Date.now(),
    });
    safeLocalStorage.setItem('mintHistory', JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save mint history:', error);
  }
}

// Preview NFT
async function previewNft(tokenId, showContainer = false) {
  if (!tokenId || !contractDetails) return;

  try {
    const tokenURI = await mintingManager.getTokenURI(tokenId);
    if (!tokenURI) {
      setStatus('Failed to load NFT data', 'error');
      return;
    }

    // Handle data URI
    let svgData;
    if (tokenURI.startsWith('data:')) {
      const base64Data = tokenURI.split(',')[1];
      svgData = atob(base64Data);
    } else {
      // Handle IPFS or HTTP URI
      const response = await fetch(tokenURI);
      if (!response.ok) throw new Error('Failed to fetch NFT data');
      svgData = await response.text();
    }

    // Sanitize and display SVG
    const sanitizedSVG = sanitizeSVG(svgData);
    currentNFTData = {
      svg: sanitizedSVG,
      tokenId: tokenId
    };
    
    // Set current NFT data in download manager
    downloadManager.setCurrentNFTData(currentNFTData);
    
    previewContainer.innerHTML = sanitizedSVG;
    adjustInjectedSvg(previewContainer);

    if (showContainer) {
      previewContainer.classList.remove('hidden');
    }

    // Get token traits for rarity effects
    const traits = await mintingManager.getTokenTraits(tokenId);
    if (traits) {
      const rarityLabels = ['common', 'rare', 'legendary', 'mythic'];
      const rarity = rarityLabels[traits.rarity] || 'common';

      // Add rarity class for effects
      previewContainer.classList.remove(...rarityLabels);
      previewContainer.classList.add(rarity);

      // Add sparkle effects for rare NFTs
      if (traits.rarity >= 1) {
        previewContainer.classList.add('sparkles');
      }
      
      // Update button label with rarity and price
      const priceText = (traits.priceSnapshot / 10000).toFixed(4);
      const rarityText = rarity.charAt(0).toUpperCase() + rarity.slice(1);
      previewBtn.innerText = `Preview NFT #${tokenId} (${rarityText} / $${priceText})`;
    }
  } catch (error) {
    console.error('Failed to preview NFT:', error);
    setStatus('Failed to load NFT preview', 'error');
  }
}



// Initialize TradingView
function initTradingView() {
  if (tradingViewLoaded) return;
  tradingViewLoaded = true;
  
  const script = document.createElement('script');
  script.src = 'https://s3.tradingview.com/tv.js';
  script.onload = () => {
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
  };
  document.head.appendChild(script);
}

// Add filter listeners
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

// View NFT details
function viewNFTDetails(tokenId) {
  // Switch to mint tab and preview this NFT
  tabManager.switchTab('mint');
  if (lastMintedTokenId !== tokenId) {
    lastMintedTokenId = tokenId;
    previewNft(tokenId);
  }
}

// Expose globally for onclick handlers
window.viewNFTDetails = viewNFTDetails;

// Initialize the application when the DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
