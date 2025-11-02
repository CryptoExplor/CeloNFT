import { sdk } from '@farcaster/miniapp-sdk';
import {
  createConfig,
  connect,
  getAccount,
  watchAccount,
  writeContract,
  readContract,
  waitForTransactionReceipt,
  http
} from '@wagmi/core';
import { celo } from '@wagmi/core/chains';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import confetti from 'canvas-confetti';

// Configuration
const MAX_SUPPLY_FUNCTION_NAME = 'maxSupply';
const PROJECT_ID = 'e0dd881bad824ac3418617434a79f917';

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
const celoscanLink = document.getElementById('celoscanLink');
const shareBtn = document.getElementById('shareBtn');
const nftActions = document.getElementById('nftActions');
const downloadSVG = document.getElementById('downloadSVG');
const downloadPNG = document.getElementById('downloadPNG');
const downloadJSON = document.getElementById('downloadJSON');
const totalMintedStat = document.getElementById('totalMintedStat');
const yourMintsStat = document.getElementById('yourMintsStat');
const remainingStat = document.getElementById('remainingStat');
const ALL_RARITY_CLASSES = ["common", "rare", "legendary", "mythic"];

let MAX_SUPPLY = 0;
let lastMintedTokenId = null;
let contractAddress = null;
let mintPriceWei = 0n;
let userAddress = null;
let contractDetails = null;
let modal = null;
let isFarcasterEnvironment = false;
let wagmiConfig = null;
let userMintCount = 0;

// Improved Farcaster Detection
function isFarcasterEmbed() {
  // Method 1: Check if in iframe
  const isIframe = window.self !== window.top;
  
  // Method 2: Check for Farcaster-specific properties
  const hasFarcasterContext = typeof sdk !== 'undefined' && sdk.context;
  
  // Method 3: Check user agent (some Farcaster clients)
  const isFarcasterUA = /farcaster/i.test(navigator.userAgent);
  
  return isIframe || hasFarcasterContext || isFarcasterUA;
}

// Helper Functions
function celebrateMint() {
  // Fire confetti from the center
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#49dfb5', '#7dd3fc', '#fcd34d']
  });
  
  // Second burst after 200ms
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ['#49dfb5', '#7dd3fc']
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ['#fcd34d', '#f97316']
    });
  }, 200);
}

function animateCounter(element, start, end, duration = 1000) {
  if (!element) return;
  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;
  
  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
      element.textContent = end;
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current);
    }
  }, 16);
}
function setStatus(msg, type = 'info') {
  statusBox.innerHTML = '';
  let icon = '';
  if (type === 'success') icon = '✅ ';
  else if (type === 'error') icon = '❌ ';
  else if (type === 'warning') icon = '⚠️ ';
  else if (type === 'info') icon = 'ℹ️ ';
  
  statusBox.className = `status-box status-${type}`;
  statusBox.insertAdjacentText('afterbegin', icon + msg);
}

function getImprovedErrorMessage(error) {
  const msg = error.message || error.shortMessage || '';
  
  if (msg.includes('insufficient funds') || msg.includes('insufficient balance')) {
    return 'Not enough CELO in your wallet. Please add funds and try again.';
  } else if (msg.includes('gas')) {
    return 'Transaction failed due to gas issues. Try increasing your gas limit.';
  } else if (msg.includes('User rejected') || msg.includes('user rejected')) {
    return 'Transaction was rejected in your wallet.';
  } else if (msg.includes('network') || msg.includes('Network')) {
    return 'Network connection issue. Please check your connection and try again.';
  } else if (msg.includes('nonce')) {
    return 'Transaction ordering issue. Please try again in a moment.';
  } else if (msg.includes('already minted') || msg.includes('already claimed')) {
    return 'You have already minted this NFT.';
  } else if (msg.includes('Invalid parameters') || msg.includes('RPC')) {
    return 'Connection error. Please reload/refresh and try again.';
  } else if (error.shortMessage) {
    return error.shortMessage;
  }
  
  return 'Mint failed. Please try again or contact support if the issue persists.';
}

function showAddress(addr) {
  const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  userAddrBox.innerHTML = `<span style="cursor: pointer;" title="Click to change wallet">Your address: ${shortAddr}</span>`;
  userAddrBox.classList.remove('hidden');
  connectBtn.classList.add('hidden');
  mintBtn.classList.remove('hidden');
  
  // Make address clickable to open wallet modal
  userAddrBox.onclick = () => {
    if (modal) {
      modal.open();
    }
  };
}

function showConnectButton() {
  connectBtn.classList.remove('hidden');
  mintBtn.classList.add('hidden');
  userAddrBox.classList.add('hidden');
}

async function fetchCeloPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=celo&vs_currencies=usd');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (!data || !data.celo || !data.celo.usd) {
      throw new Error("Invalid response structure from CoinGecko.");
    }
    return data.celo.usd;
  } catch (e) {
    console.error("Failed to fetch CELO price:", e);
    throw new Error("Failed to fetch CELO price. Please try again.");
  }
}

function adjustInjectedSvg(container) {
  const svg = container.querySelector('svg');
  if (svg) {
    if (!svg.hasAttribute('viewBox')) {
      const w = svg.getAttribute('width');
      const h = svg.getAttribute('height');
      if (w && h) {
        const W = parseFloat(w);
        const H = parseFloat(h);
        if (!isNaN(W) && !isNaN(H) && W > 0 && H > 0) {
          svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        }
      }
    }
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxHeight = '60vh';
    svg.style.display = 'block';
  } else {
    const img = container.querySelector('img');
    if (img) {
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.maxHeight = '60vh';
      img.style.display = 'block';
    }
  }
  container.style.maxHeight = '60vh';
}

async function updateSupply(initialLoad = false) {
  try {
    if (!contractDetails) return 0;

    const total = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'totalSupply'
    });

    const totalNumber = Number(total);

    // Update stats counter
    if (totalMintedStat) {
      const current = parseInt(totalMintedStat.textContent) || 0;
      if (current !== totalNumber) {
        animateCounter(totalMintedStat, current, totalNumber, 800);
      }
    }
    
    if (remainingStat && MAX_SUPPLY > 0) {
      const remaining = MAX_SUPPLY - totalNumber;
      remainingStat.textContent = remaining > 0 ? remaining : '0';
    } else if (remainingStat) {
      remainingStat.textContent = '∞';
    }

    // Check if sold out
    if (MAX_SUPPLY > 0 && totalNumber >= MAX_SUPPLY) {
      mintBtn.disabled = true;
      mintBtn.innerText = "SOLD OUT";
      mintBtn.title = "The maximum supply has been reached.";
      
      if (!initialLoad) {
        setStatus(`All ${MAX_SUPPLY} NFTs have been minted!`, "warning");
      }
    } else if (!initialLoad && mintBtn.innerText !== "SOLD OUT") {
      mintBtn.disabled = false;
      const celoPrice = Number(mintPriceWei) / 1e18;
      mintBtn.innerText = mintPriceWei > 0n ? `MINT (${celoPrice.toFixed(4)} CELO)` : 'MINT';
      mintBtn.title = '';
    }

    return total;
  } catch (e) {
    if (totalMintedStat) totalMintedStat.textContent = '--';
    if (remainingStat) remainingStat.textContent = '--';
    console.error('Error updating supply:', e);
    return 0;
  }
}

function updateUserMintCount() {
  if (!userAddress || !contractDetails) {
    if (yourMintsStat) yourMintsStat.textContent = '--';
    return;
  }
  
  // Get user's mint count from contract
  readContract(wagmiConfig, {
    address: contractDetails.address,
    abi: contractDetails.abi,
    functionName: 'balanceOf',
    args: [userAddress]
  }).then(balance => {
    userMintCount = Number(balance);
    if (yourMintsStat) {
      yourMintsStat.textContent = userMintCount;
    }
  }).catch(err => {
    console.error('Error fetching user balance:', err);
    // Fallback to session storage
    const history = JSON.parse(sessionStorage.getItem('mintHistory') || '[]');
    const userMints = history.filter(m => m.address === userAddress);
    userMintCount = userMints.length;
    if (yourMintsStat) {
      yourMintsStat.textContent = userMintCount;
    }
  });
}

function saveMintToHistory(tokenId, txHash) {
  const history = JSON.parse(sessionStorage.getItem('mintHistory') || '[]');
  history.unshift({ 
    tokenId, 
    txHash, 
    timestamp: Date.now(), 
    address: userAddress 
  });
  
  // Keep only last 20 mints
  if (history.length > 20) history.pop();
  
  sessionStorage.setItem('mintHistory', JSON.stringify(history));
  updateUserMintCount();
}

async function shareNFT(tokenId, txHash) {
  const url = `https://celo-nft-phi.vercel.app/?nft=${tokenId}`;
  const text = `I just minted CELO NFT #${tokenId} with live price snapshot! 🎨✨`;
  
  // Try native share API first (mobile)
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'My CELO Price NFT',
        text: text,
        url: url
      });
      setStatus('Thanks for sharing! 🙏', 'success');
      return;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.log('Share cancelled or failed:', e);
      }
    }
  }
  
  // Fallback: Copy to clipboard
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    setStatus('✅ Link copied! Share it with your friends! 📋', 'success');
  } catch (e) {
    setStatus('Link: ' + url, 'info');
  }
}

// Store last minted info for share button
let lastMintedInfo = { tokenId: null, txHash: null, metadata: null, svg: null };

// Tab Management
function switchTab(tabName) {
  console.log('Switching to tab:', tabName);
  
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
    tab.style.display = 'none';
  });
  
  // Remove active from all buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  const selectedTab = document.getElementById(`${tabName}Tab`);
  const selectedBtn = document.querySelector(`[data-tab="${tabName}"]`);
  
  if (selectedTab) {
    selectedTab.classList.add('active');
    selectedTab.style.display = 'block';
  }
  if (selectedBtn) {
    selectedBtn.classList.add('active');
  }
  
  // Load content for specific tabs
  if (tabName === 'gallery') loadGallery();
  if (tabName === 'leaderboard') loadLeaderboard();
  if (tabName === 'activity') loadActivityFeed();
  if (tabName === 'faq') updateFAQPrices();
}

// Gallery Functions
async function loadGallery() {
  const galleryGrid = document.getElementById('galleryGrid');
  if (!userAddress || !contractDetails) {
    galleryGrid.innerHTML = '<p class="empty-state">Connect your wallet to see your NFTs</p>';
    return;
  }
  
  galleryGrid.innerHTML = '<p class="loading-state">Loading your NFTs...</p>';
  
  try {
    const balance = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'balanceOf',
      args: [userAddress]
    });
    
    const count = Number(balance);
    
    if (count === 0) {
      galleryGrid.innerHTML = '<p class="empty-state">You haven\'t minted any NFTs yet!<br>Go to the Mint tab to create your first one! 🎨</p>';
      return;
    }
    
    // Get all token IDs owned by user
    const tokenIds = [];
    for (let i = 0; i < count; i++) {
      const tokenId = await readContract(wagmiConfig, {
        address: contractDetails.address,
        abi: contractDetails.abi,
        functionName: 'tokenOfOwnerByIndex',
        args: [userAddress, BigInt(i)]
      });
      tokenIds.push(Number(tokenId));
    }
    
    // Fetch metadata for each
    galleryGrid.innerHTML = '';
    for (const tokenId of tokenIds) {
      const item = await createGalleryItem(tokenId);
      galleryGrid.appendChild(item);
    }
    
  } catch (error) {
    console.error('Gallery load error:', error);
    galleryGrid.innerHTML = '<p class="empty-state">Error loading gallery. Make sure contract supports ERC721Enumerable.</p>';
  }
}

async function createGalleryItem(tokenId) {
  const item = document.createElement('div');
  item.className = 'gallery-item';
  
  try {
    const tokenURI = await readContract(wagmiConfig, {
      address: contractAddress,
      abi: contractDetails.abi,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)]
    });
    
    const base64Json = tokenURI.split(',')[1];
    const metadata = JSON.parse(atob(decodeURIComponent(base64Json)));
    
    const rarityAttr = metadata.attributes?.find(attr => attr.trait_type === 'Rarity');
    const priceAttr = metadata.attributes?.find(attr => attr.trait_type === 'CELO Price Snapshot');
    
    const rarity = rarityAttr?.value || 'Common';
    const price = priceAttr?.value || 'N/A';
    
    // Create thumbnail (smaller version of SVG)
    const base64Svg = metadata.image.split(',')[1];
    const svgData = atob(decodeURIComponent(base64Svg));
    
    item.innerHTML = `
      <div style="background:#000;border-radius:8px;padding:8px;">
        ${svgData}
      </div>
      <div class="gallery-item-info">
        <div>NFT #${tokenId}</div>
        <div class="gallery-item-rarity ${rarity.toLowerCase()}">${rarity}</div>
        <div style="font-size:0.8rem;margin-top:4px;">${price}</div>
      </div>
    `;
    
    item.onclick = () => viewNFTDetail(tokenId, metadata, svgData);
    
  } catch (error) {
    item.innerHTML = `<p style="color:#f87171;">Error loading NFT #${tokenId}</p>`;
  }
  
  return item;
}

function viewNFTDetail(tokenId, metadata, svg) {
  switchTab('mint');
  previewContainer.innerHTML = svg;
  previewContainer.classList.remove('hidden');
  adjustInjectedSvg(previewContainer);
  
  const rarityAttr = metadata.attributes?.find(attr => attr.trait_type === 'Rarity');
  const rarity = rarityAttr?.value || 'Common';
  previewContainer.classList.add('sparkles', rarity.toLowerCase());
  
  lastMintedInfo = { tokenId, metadata, svg };
  nftActions.classList.remove('hidden');
  previewBtn.classList.remove('hidden');
  
  const priceAttr = metadata.attributes?.find(attr => attr.trait_type === 'CELO Price Snapshot');
  const price = priceAttr?.value || 'N/A';
  previewBtn.textContent = `Preview NFT #${tokenId} (${rarity} / ${price})`;
}

// Leaderboard Functions
async function loadLeaderboard() {
  const leaderboardList = document.getElementById('leaderboardList');
  leaderboardList.innerHTML = '<p class="loading-state">Loading leaderboard data...</p>';
  
  try {
    // Get total supply
    const total = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'totalSupply'
    });
    
    const totalNumber = Number(total);
    
    // Sample leaderboard (in production, you'd track this off-chain or in contract events)
    const mockLeaderboard = [
      { address: '0x1234...5678', mints: 15, legendaryCount: 3, avgPrice: 0.95 },
      { address: '0x8765...4321', mints: 12, legendaryCount: 2, avgPrice: 0.87 },
      { address: '0xabcd...ef01', mints: 10, legendaryCount: 1, avgPrice: 0.92 },
      { address: '0x9876...5432', mints: 8, legendaryCount: 0, avgPrice: 0.78 },
      { address: '0x4321...8765', mints: 7, legendaryCount: 1, avgPrice: 0.85 },
    ];
    
    leaderboardList.innerHTML = '';
    
    mockLeaderboard.forEach((entry, index) => {
      const item = document.createElement('div');
      item.className = 'leaderboard-entry';
      
      let rankClass = '';
      if (index === 0) rankClass = 'gold';
      else if (index === 1) rankClass = 'silver';
      else if (index === 2) rankClass = 'bronze';
      
      item.innerHTML = `
        <div class="leaderboard-rank ${rankClass}">#${index + 1}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-address">${entry.address}</div>
          <div class="leaderboard-stats">
            ${entry.mints} mints • ${entry.legendaryCount} legendary • Avg: ${entry.avgPrice}
          </div>
        </div>
      `;
      
      leaderboardList.appendChild(item);
    });
    
    leaderboardList.insertAdjacentHTML('beforeend', `
      <p style="text-align:center;color:#9ca3af;margin-top:24px;font-size:0.9rem;">
        📊 Showing top minters • Total minted: ${totalNumber}
      </p>
    `);
    
  } catch (error) {
    console.error('Leaderboard error:', error);
    leaderboardList.innerHTML = '<p class="empty-state">Error loading leaderboard</p>';
  }
}

// Activity Feed Functions
let feedPaused = false;
let feedInterval = null;

async function loadActivityFeed() {
  const activityFeed = document.getElementById('activityFeed');
  
  if (!feedInterval) {
    updateActivityFeed();
    feedInterval = setInterval(() => {
      if (!feedPaused) updateActivityFeed();
    }, 10000); // Update every 10 seconds
  }
}

async function updateActivityFeed() {
  const activityFeed = document.getElementById('activityFeed');
  
  try {
    const total = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'totalSupply'
    });
    
    const totalNumber = Number(total);
    
    // Sample recent mints (in production, get from contract events)
    const recentMints = [
      { address: '0x1234', tokenId: totalNumber, rarity: 'Legendary', price: '0.95', time: Date.now() - 30000 },
      { address: '0x5678', tokenId: totalNumber - 1, rarity: 'Rare', price: '0.82', time: Date.now() - 120000 },
      { address: '0xabcd', tokenId: totalNumber - 2, rarity: 'Common', price: '0.78', time: Date.now() - 300000 },
      { address: '0xef01', tokenId: totalNumber - 3, rarity: 'Mythic', price: '1.23', time: Date.now() - 600000 },
    ];
    
    activityFeed.innerHTML = '';
    
    recentMints.forEach(mint => {
      const item = document.createElement('div');
      item.className = `activity-item ${mint.rarity.toLowerCase()}`;
      
      const emoji = mint.rarity === 'Mythic' ? '🔥' : mint.rarity === 'Legendary' ? '⭐' : '✨';
      const timeAgo = formatTimeAgo(mint.time);
      
      item.innerHTML = `
        <div class="activity-text">
          ${emoji} User ${mint.address}... minted ${mint.rarity} NFT #${mint.tokenId} at ${mint.price}!
        </div>
        <div class="activity-time">${timeAgo}</div>
      `;
      
      activityFeed.appendChild(item);
    });
    
  } catch (error) {
    console.error('Activity feed error:', error);
  }
}

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function updateFAQPrices() {
  const faqPrice = document.getElementById('faqMintPrice');
  if (faqPrice && mintPriceWei > 0n) {
    const celoPrice = Number(mintPriceWei) / 1e18;
    faqPrice.textContent = `${celoPrice.toFixed(4)}`;
  } else if (faqPrice) {
    faqPrice.textContent = 'FREE';
  }
}

// Download Functions
function downloadSVGFile() {
  if (!lastMintedInfo.svg) return;
  
  const blob = new Blob([lastMintedInfo.svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `celo-nft-${lastMintedInfo.tokenId}.svg`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('✅ SVG downloaded!', 'success');
}

function downloadPNGFile() {
  if (!lastMintedInfo.svg) return;
  
  const canvas = document.createElement('canvas');
  canvas.width = 500;
  canvas.height = 500;
  const ctx = canvas.getContext('2d');
  
  const img = new Image();
  const svgBlob = new Blob([lastMintedInfo.svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(svgBlob);
  
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(blob => {
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `celo-nft-${lastMintedInfo.tokenId}.png`;
      a.click();
      URL.revokeObjectURL(pngUrl);
      URL.revokeObjectURL(url);
      setStatus('✅ PNG downloaded!', 'success');
    });
  };
  
  img.src = url;
}

function downloadJSONFile() {
  if (!lastMintedInfo.metadata) return;
  
  const blob = new Blob([JSON.stringify(lastMintedInfo.metadata, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `celo-nft-${lastMintedInfo.tokenId}-metadata.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('✅ Metadata downloaded!', 'success');
}

async function previewNft(tokenId) {
  if (!contractDetails) return;

  statusBox.innerHTML = '';
  statusBox.className = 'status-box';
  
  previewBtn.disabled = true;
  previewBtn.innerHTML = '<span class="spinner"></span> Loading Preview…';
  previewContainer.classList.add('hidden');
  previewContainer.innerHTML = '';
  previewContainer.classList.remove("sparkles", ...ALL_RARITY_CLASSES);
  nftActions.classList.add('hidden');

  try {
    const tokenURI = await readContract(wagmiConfig, {
      address: contractAddress,
      abi: contractDetails.abi,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)] 
    });

    const base64Json = tokenURI.split(',')[1];
    if (!base64Json) throw new Error("Invalid tokenURI format.");

    const jsonString = atob(decodeURIComponent(base64Json));
    const metadata = JSON.parse(jsonString);
    
    const base64Svg = metadata.image.split(',')[1];
    if (!base64Svg) throw new Error("Invalid image data format.");

    let svgString = atob(decodeURIComponent(base64Svg));
    const safeSvg = svgString.replace(/<script.*?>.*?<\/script>/g, '');

    previewContainer.innerHTML = safeSvg;
    previewContainer.classList.remove('hidden');
    adjustInjectedSvg(previewContainer);
    
    let rarityText = "Common";
    let priceText = "N/A";

    if (metadata.attributes) {
      const rarityAttr = metadata.attributes.find(attr => attr.trait_type === 'Rarity');
      const priceAttr = metadata.attributes.find(attr => attr.trait_type === 'CELO Price Snapshot');
      
      if (rarityAttr) rarityText = rarityAttr.value;
      if (priceAttr) priceText = priceAttr.value;
    }
    
    previewContainer.classList.add("sparkles");
    const rarityClassLower = rarityText.toLowerCase();
    previewContainer.classList.add(rarityClassLower);

    const buttonLabel = `Preview NFT #${tokenId} (${rarityText} / ${priceText})`;
    previewBtn.innerText = buttonLabel;
    
    // Store for downloads
    lastMintedInfo.metadata = metadata;
    lastMintedInfo.svg = safeSvg;
    
    // Show download buttons
    nftActions.classList.remove('hidden');

  } catch (e) {
    setStatus("Failed to load NFT preview. Check console for details.", 'error'); 
    previewBtn.innerText = 'Preview NFT Error';
    console.error(`NFT Preview Error for token ID ${tokenId}:`, e);
    previewContainer.classList.add('hidden');
  } finally {
    previewBtn.disabled = false;
  }
}

// Initialize Farcaster SDK
(async () => {
  try {
    await sdk.actions.ready({ disableNativeGestures: true });
    console.log('Farcaster SDK initialized');
  } catch (e) {
    console.log('Farcaster SDK not available:', e);
  }
})();

// Initialize Tab Navigation Immediately
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing tabs');
  
  // Make sure mint tab is visible by default
  const mintTab = document.getElementById('mintTab');
  if (mintTab) {
    mintTab.style.display = 'block';
  }
  
  // Setup tab click handlers
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      console.log('Tab clicked:', tabName);
      switchTab(tabName);
    });
  });
});

// Setup Wagmi Config with Reown AppKit
const wagmiAdapter = new WagmiAdapter({
  networks: [celo],
  projectId: PROJECT_ID,
  ssr: false
});

wagmiConfig = wagmiAdapter.wagmiConfig;

// Initialize App
(async () => {
  try {
    // Load last minted token from sessionStorage
    lastMintedTokenId = sessionStorage.getItem("lastMintedTokenId");
    if (lastMintedTokenId) {
      previewBtn.innerText = `Preview NFT #${lastMintedTokenId}`;
      previewBtn.classList.remove('hidden');
    }

    // Improved Farcaster detection
    isFarcasterEnvironment = isFarcasterEmbed();
    
    if (isFarcasterEnvironment) {
      console.log('Running in Farcaster environment');
      // Show "Mint in browser" banner IN Farcaster
      externalBanner.href = 'https://celo-nft-phi.vercel.app/';
      externalBannerText.textContent = 'Mint in browser';
      externalBanner.classList.remove('hidden');
    } else {
      console.log('Not in Farcaster environment');
      // Show "Mint in Farcaster" banner OUTSIDE Farcaster
      externalBanner.href = 'https://farcaster.xyz/miniapps/Tip8ngTAKnHC/celo-nft';
      externalBannerText.textContent = 'Mint in Farcaster';
      externalBanner.classList.remove('hidden');
    }

    // Try Farcaster connection first
    let connected = false;
    if (isFarcasterEnvironment) {
      try {
        const farcasterConnector = wagmiConfig.connectors.find(c => c.id === 'farcasterMiniApp');
        if (farcasterConnector) {
          const conn = await connect(wagmiConfig, { connector: farcasterConnector });
          userAddress = conn.accounts[0];
          showAddress(userAddress);
          connected = true;
          console.log('Connected via Farcaster:', userAddress);
          
          // Prompt to add mini app
          const hasPromptedAddApp = sessionStorage.getItem('hasPromptedAddApp');
          if (!hasPromptedAddApp && sdk?.actions?.addMiniApp) {
            try {
              await sdk.actions.addMiniApp();
              sessionStorage.setItem('hasPromptedAddApp', 'true');
            } catch(e) {
              console.log('Add mini app prompt declined or failed:', e);
            }
          }
        }
      } catch (e) {
        console.log('Farcaster connection failed:', e);
      }
    }

    // Setup Reown AppKit for wallet connections
    modal = createAppKit({
      adapters: [wagmiAdapter],
      networks: [celo],
      projectId: PROJECT_ID,
      metadata: {
        name: 'Celo NFT Mint',
        description: 'Mint a free Celo NFT that shows the live CELO price!',
        url: 'https://celo-nft-phi.vercel.app/',
        icons: ['https://celo-nft-phi.vercel.app/icon.png']
      },
      features: {
        analytics: true,
        email: false,
        socials: [],
      },
      allWallets: 'SHOW',
      themeMode: 'dark',
      themeVariables: {
        '--w3m-accent': '#49dfb5',
        '--w3m-border-radius-master': '8px'
      }
    });

    // Check if already connected
    if (!connected) {
      const currentAccount = getAccount(wagmiConfig);
      if (currentAccount.isConnected && currentAccount.address) {
        userAddress = currentAccount.address;
        showAddress(userAddress);
        connected = true;
        console.log('Already connected:', userAddress);
      } else {
        showConnectButton();
        setStatus('Connect your wallet to mint NFTs', 'info');
      }
    }

    // Load contract details - try multiple paths
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
      
      contractDetails = await response.json();
      contractAddress = contractDetails.address;
      console.log('Contract loaded:', contractAddress);
    } catch (e) { 
      setStatus("Missing contract details. Ensure 'contract.json' is in the public folder.", 'error'); 
      console.error('Contract load error:', e); 
      mintBtn.disabled = true; 
      return;
    }

    if (!contractDetails) {
      mintBtn.disabled = true;
      return;
    }

    // Get chain ID
    const currentAccount = getAccount(wagmiConfig);
    const chainId = currentAccount.chainId;

    // Network guard
    if (chainId && chainId !== celo.id) {
      setStatus("Please switch to Celo Mainnet.", 'warning');
      mintBtn.disabled = true;
      mintBtn.title = "Switch to Celo Mainnet to mint.";
      return;
    } else {
      mintBtn.title = ""; 
    }
    
    // Fetch contract settings
    try {
      const [max, price] = await Promise.all([
        readContract(wagmiConfig, {
          address: contractDetails.address,
          abi: contractDetails.abi,
          functionName: MAX_SUPPLY_FUNCTION_NAME
        }),
        readContract(wagmiConfig, {
          address: contractDetails.address,
          abi: contractDetails.abi,
          functionName: 'mintPrice'
        })
      ]);
      MAX_SUPPLY = Number(max);
      mintPriceWei = BigInt(price);
      
      if (mintPriceWei > 0n) {
        const celoPrice = Number(mintPriceWei) / 1e18;
        mintBtn.innerText = `MINT (${celoPrice.toFixed(4)} CELO)`;
      }

      console.log('Contract settings:', { MAX_SUPPLY, mintPriceWei: mintPriceWei.toString() });

    } catch (e) {
      setStatus(`Could not read contract settings. Assuming unlimited/free.`, 'warning');
      MAX_SUPPLY = 0;
      mintPriceWei = 0n;
      console.warn(`Failed to read contract settings.`, e);
    }

    // Fetch total supply
    if (connected) {
      await updateSupply(true);
      updateUserMintCount();
    }
  } catch (error) {
    console.error('Initialization error:', error);
    setStatus('Failed to initialize. Please refresh the page.', 'error');
  }
})();

// Watch for account changes
watchAccount(wagmiConfig, {
  onChange(account) {
    try {
      if (account.address && account.isConnected) {
        console.log('Account changed to:', account.address);
        userAddress = account.address;
        showAddress(userAddress);
        setStatus('Wallet connected successfully!', 'success');
        mintBtn.disabled = false;
        
        updateSupply(true);
        updateUserMintCount();
        previewBtn.classList.add('hidden');
        previewContainer.classList.add('hidden');
        sessionStorage.removeItem('lastMintedTokenId');
        lastMintedTokenId = null;

      } else if (!account.isConnected && userAddress) {
        console.log('Wallet disconnected');
        userAddress = null;
        userAddrBox.classList.add('hidden');
        showConnectButton();
        setStatus('Wallet disconnected. Please connect again.', 'warning');
        mintBtn.disabled = true;
        
        previewBtn.classList.add('hidden');
        previewContainer.classList.add('hidden');
        if (totalMintedStat) totalMintedStat.textContent = '--';
        if (yourMintsStat) yourMintsStat.textContent = '--';
        if (remainingStat) remainingStat.textContent = '--';
        sessionStorage.removeItem('lastMintedTokenId');
        lastMintedTokenId = null;
      }
    } catch (error) {
      console.error('Account change error:', error);
    }
  },
});

// Connect Button Handler
connectBtn.addEventListener('click', async () => {
  try {
    if (modal) {
      modal.open();
    }
  } catch (error) {
    console.error('Connect button error:', error);
    setStatus('Failed to open wallet modal.', 'error');
  }
});

// Mint Button Handler
mintBtn.addEventListener('click', async () => {
  try {
    if (!contractDetails) {
      setStatus("Contract details are missing. Cannot mint.", "error");
      return;
    }

    if (mintBtn.disabled && mintBtn.innerText === "SOLD OUT") {
      setStatus("This NFT drop is sold out.", "warning");
      return;
    }
    
    statusBox.innerHTML = '';
    statusBox.className = 'status-box';

    previewBtn.classList.add('hidden');
    previewContainer.classList.add('hidden');
    previewContainer.classList.remove('sparkles', ...ALL_RARITY_CLASSES);
    txLinksContainer.classList.add('hidden');
    txLinksContainer.innerHTML = '';
    shareBtn.classList.add('hidden');

    mintBtn.disabled = true;
    mintBtn.innerHTML = '<span class="spinner"></span> Minting...';
    lastMintedTokenId = null;

    const { address, abi } = contractDetails;

    const currentSupply = await readContract(wagmiConfig, {
      address,
      abi,
      functionName: 'totalSupply'
    });
    
    const nextTokenId = Number(currentSupply) + 1;

    const price = await fetchCeloPrice();
    const priceForContract = Math.floor(price * 10000);

    const hash = await writeContract(wagmiConfig, {
      address,
      abi,
      functionName: 'mint',
      args: [priceForContract],
      value: mintPriceWei 
    });
    
    setStatus("Confirming transaction...", "info");
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });

    if (receipt.status === 'reverted') {
      throw new Error('Transaction was reverted.');
    }

    sessionStorage.setItem('lastMintedTokenId', nextTokenId.toString());
    
    // 🎉 CELEBRATE WITH CONFETTI!
    celebrateMint();
    
    setStatus("🎉 Mint Successful!", "success");
    
    // Store mint info for share button and downloads
    lastMintedInfo.tokenId = nextTokenId;
    lastMintedInfo.txHash = hash;
    
    // Show transaction link and share button (side by side, persistent)
    if (contractAddress) {
      const celoscanTokenUrl = `https://celoscan.io/token/${contractAddress}?a=${nextTokenId}`;
      
      celoscanLink.href = celoscanTokenUrl;
      txLinksContainer.classList.remove('hidden');
      
      console.log('Showing tx links:', celoscanTokenUrl);
    }

    lastMintedTokenId = nextTokenId;
    saveMintToHistory(nextTokenId, hash);

    await updateSupply();
    previewBtn.classList.remove('hidden');
    previewBtn.innerText = `Preview NFT #${nextTokenId}`;
    await previewNft(lastMintedTokenId);

  } catch (e) {
    const errorMsg = getImprovedErrorMessage(e);
    setStatus(errorMsg, "error");
    console.error('Mint Error:', e);
    
    // Add retry button for certain errors
    if (!errorMsg.includes('rejected') && !errorMsg.includes('already minted')) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'action-button';
      retryBtn.style.cssText = 'background: linear-gradient(90deg, #f59e0b, #f97316); padding: 0.6rem 1.2rem; font-size: 0.9rem; margin-top: 12px;';
      retryBtn.innerHTML = '🔄 Retry Mint';
      retryBtn.onclick = () => mintBtn.click();
      
      statusBox.appendChild(document.createElement('br'));
      statusBox.appendChild(retryBtn);
    }
    
    previewBtn.classList.add('hidden');
    previewContainer.classList.add('hidden');
    previewContainer.classList.remove('sparkles', ...ALL_RARITY_CLASSES);
    sessionStorage.removeItem('lastMintedTokenId');
    lastMintedTokenId = null;
    lastMintedInfo = { tokenId: null, txHash: null };
  } finally {
    if (mintBtn.innerText !== "SOLD OUT") {
      mintBtn.disabled = false;
      const celoPrice = Number(mintPriceWei) / 1e18;
      mintBtn.innerText = mintPriceWei > 0n ? `MINT (${celoPrice.toFixed(4)} CELO)` : 'MINT';
    }
  }
});

// Preview Button Handler
previewBtn.addEventListener('click', async () => {
  try {
    if (lastMintedTokenId !== null) {
      await previewNft(lastMintedTokenId);
    } else {
      setStatus("No token ID to preview. Please mint first.", 'warning');
    }
  } catch (error) {
    console.error('Preview error:', error);
    setStatus('Failed to load preview.', 'error');
  }
});

// Share Button Handler (Persistent)
shareBtn.addEventListener('click', async () => {
  if (lastMintedInfo.tokenId && lastMintedInfo.txHash) {
    await shareNFT(lastMintedInfo.tokenId, lastMintedInfo.txHash);
  } else if (lastMintedTokenId) {
    // Fallback to session stored token
    await shareNFT(lastMintedTokenId, null);
  } else {
    setStatus('No NFT to share. Please mint first!', 'warning');
  }
});

// Tab Navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab');
    switchTab(tabName);
  });
});

// Make sure this runs after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        switchTab(tabName);
      });
    });
  });
}

// Leaderboard sub-tabs
document.querySelectorAll('.lb-tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.lb-tab-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    loadLeaderboard();
  });
});

document.querySelectorAll('.lb-cat-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.lb-cat-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    loadLeaderboard();
  });
});

// Activity Feed Controls
const pauseFeedBtn = document.getElementById('pauseFeed');
const refreshFeedBtn = document.getElementById('refreshFeed');

if (pauseFeedBtn) {
  pauseFeedBtn.addEventListener('click', () => {
    feedPaused = !feedPaused;
    pauseFeedBtn.textContent = feedPaused ? '▶️ Resume' : '⏸️ Pause';
  });
}

if (refreshFeedBtn) {
  refreshFeedBtn.addEventListener('click', () => {
    updateActivityFeed();
  });
}

// Gallery Filters
const rarityFilter = document.getElementById('rarityFilter');
const sortBy = document.getElementById('sortBy');

if (rarityFilter) {
  rarityFilter.addEventListener('change', () => {
    // Filter gallery items
    const items = document.querySelectorAll('.gallery-item');
    const selectedRarity = rarityFilter.value;
    
    items.forEach(item => {
      if (selectedRarity === 'all') {
        item.style.display = 'block';
      } else {
        const rarityEl = item.querySelector('.gallery-item-rarity');
        const itemRarity = rarityEl?.textContent.toLowerCase();
        item.style.display = itemRarity === selectedRarity ? 'block' : 'none';
      }
    });
  });
}

if (sortBy) {
  sortBy.addEventListener('change', () => {
    // Re-sort gallery
    loadGallery();
  });
}

// Download Buttons
downloadSVG.addEventListener('click', downloadSVGFile);
downloadPNG.addEventListener('click', downloadPNGFile);
downloadJSON.addEventListener('click', downloadJSONFile);
