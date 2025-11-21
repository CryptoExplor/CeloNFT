// Buffer polyfill for WalletConnect
import { Buffer } from 'buffer';
window.Buffer = Buffer;

window.global = window.global || window;
window.process = window.process || { env: {} };

import { sdk } from '@farcaster/miniapp-sdk';
import {
  createConfig,
  connect,
  getAccount,
  watchAccount,
  writeContract,
  readContract,
  waitForTransactionReceipt,
  http,
  getBalance
} from '@wagmi/core';
import { celo } from '@wagmi/core/chains';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import confetti from 'canvas-confetti';

// Configuration
const MAX_SUPPLY_FUNCTION_NAME = 'maxSupply';
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
const downloadSVG = document.getElementById('downloadSVG');
const downloadGIF = document.getElementById('downloadGIF');
const giftBtn = document.getElementById('giftBtn');
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
let currentNFTData = null;
let accountChangeTimeout = null;
let tradingViewLoaded = false;
let lastAirdropAmount = null; // Store last airdrop amount for cast

// Safe LocalStorage wrapper
const safeLocalStorage = {
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
      return false;
    }
  },
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('Failed to read from localStorage:', e);
      return null;
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      console.warn('Failed to remove from localStorage:', e);
      return false;
    }
  }
};

// Improved Farcaster detection with timeout
async function isFarcasterEmbed() {
  return Promise.race([
    (async () => {
      const isIframe = window.self !== window.top;
      const hasSDK = typeof sdk !== 'undefined';
      
      if (!isIframe || !hasSDK) return false;
      
      await new Promise(resolve => setTimeout(resolve, 100));
      const isSdkReady = sdk.context !== undefined && sdk.context !== null;
      
      const checks = {
        isIframe,
        hasSDK,
        isSdkReady,
        hasValidContext: hasSDK && sdk.context?.user?.fid !== undefined
      };

      console.log('Farcaster Detection Checks:', checks);
      
      return isIframe && hasSDK && isSdkReady;
    })(),
    new Promise(resolve => setTimeout(() => resolve(false), 500))
  ]);
}

// Helper Functions
function celebrateMint() {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#49dfb5', '#7dd3fc', '#fcd34d']
  });
  
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
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=celo&vs_currencies=usd&include_24hr_change=true');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (!data || !data.celo || !data.celo.usd) {
      throw new Error("Invalid response structure from CoinGecko.");
    }
    return {
      price: data.celo.usd,
      change24h: data.celo.usd_24h_change || 0
    };
  } catch (e) {
    console.error("Failed to fetch CELO price:", e);
    throw new Error("Failed to fetch CELO price. Please try again.");
  }
}

// Enhanced SVG sanitization
function sanitizeSVG(svgString) {
  return svgString
    .replace(/<script.*?>.*?<\/script>/gi, '')
    .replace(/<iframe.*?>.*?<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    // Fix invalid width/height attributes
    .replace(/width\s*=\s*["'](small|medium|large|auto|x?small|x?large)["']/gi, '')
    .replace(/height\s*=\s*["'](small|medium|large|auto|x?small|x?large)["']/gi, '')
    // Remove other potentially problematic attributes
    .replace(/width\s*=\s*["']?[a-zA-Z]+["']?/gi, '')
    .replace(/height\s*=\s*["']?[a-zA-Z]+["']?/gi, '');
}

function adjustInjectedSvg(container) {
  // Check if container exists before querying
  if (!container) return;
  
  const svg = container.querySelector('svg');
  if (svg) {
    // Remove invalid width/height attributes before processing
    const widthAttr = svg.getAttribute('width');
    const heightAttr = svg.getAttribute('height');
    
    // Check if width/height are valid numeric values
    if (widthAttr && (widthAttr === 'small' || widthAttr === 'medium' || widthAttr === 'large' || widthAttr === 'auto' || widthAttr.includes('small') || widthAttr.includes('large'))) {
      svg.removeAttribute('width');
    } else if (widthAttr) {
      // Try to parse and validate the width value
      const parsedWidth = parseFloat(widthAttr);
      if (isNaN(parsedWidth)) {
        svg.removeAttribute('width');
      }
    }
    
    if (heightAttr && (heightAttr === 'small' || heightAttr === 'medium' || heightAttr === 'large' || heightAttr === 'auto' || heightAttr.includes('small') || heightAttr.includes('large'))) {
      svg.removeAttribute('height');
    } else if (heightAttr) {
      // Try to parse and validate the height value
      const parsedHeight = parseFloat(heightAttr);
      if (isNaN(parsedHeight)) {
        svg.removeAttribute('height');
      }
    }
    
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
    
    if (userMintCount > 0 && !lastMintedTokenId) {
      loadLastMintedNFT();
    }
  }).catch(err => {
    console.error('Error fetching user balance:', err);
    const history = JSON.parse(safeLocalStorage.getItem('mintHistory') || '[]');
    const userMints = history.filter(m => m.address === userAddress);
    userMintCount = userMints.length;
    if (yourMintsStat) {
      yourMintsStat.textContent = userMintCount;
    }
  });
}

async function loadLastMintedNFT() {
  if (!userAddress || !contractDetails) return;
  
  try {
    setStatus('Loading your NFTs... 🔍', 'info');
    
    const totalSupply = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'totalSupply'
    });
    
    const total = Number(totalSupply);
    if (total === 0) {
      setStatus('No NFTs minted yet', 'info');
      return;
    }
    
    const searchLimit = Math.min(50, total);
    let foundTokenId = null;
    
    for (let i = total; i > total - searchLimit && i > 0; i--) {
      try {
        const owner = await readContract(wagmiConfig, {
          address: contractDetails.address,
          abi: contractDetails.abi,
          functionName: 'ownerOf',
          args: [BigInt(i)]
        });
        
        if (owner.toLowerCase() === userAddress.toLowerCase()) {
          foundTokenId = i;
          break;
        }
      } catch (e) {
        console.log(`Token ${i} check failed:`, e.message);
      }
    }
    
    if (foundTokenId) {
      lastMintedTokenId = foundTokenId;
      safeLocalStorage.setItem('lastMintedTokenId', foundTokenId.toString());
      
      previewBtn.innerText = `Preview NFT #${foundTokenId}`;
      previewBtn.classList.remove('hidden');
      
      setStatus(`Found your NFT #${foundTokenId}! 🎉`, 'success');
      
      setTimeout(() => {
        previewNft(foundTokenId);
      }, 500);
    } else {
      setStatus('No recent NFTs found for your wallet', 'info');
    }
  } catch (e) {
    console.error('Error loading last minted NFT:', e);
    setStatus('Could not load your NFTs', 'warning');
  }
}

function saveMintToHistory(tokenId, txHash) {
  const history = JSON.parse(safeLocalStorage.getItem('mintHistory') || '[]');
  history.unshift({ 
    tokenId, 
    txHash, 
    timestamp: Date.now(), 
    address: userAddress 
  });
  
  if (history.length > 20) history.pop();
  
  safeLocalStorage.setItem('mintHistory', JSON.stringify(history));
  updateUserMintCount();
}

// Get actual minted token ID from transaction receipt
async function getTokenIdFromReceipt(receipt) {
  try {
    const transferEvent = receipt.logs.find(log => {
      try {
        return log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      } catch (e) {
        return false;
      }
    });
    
    if (transferEvent && transferEvent.topics[3]) {
      const tokenId = BigInt(transferEvent.topics[3]);
      return Number(tokenId);
    }
    
    const totalSupply = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'totalSupply'
    });
    return Number(totalSupply);
  } catch (e) {
    console.error('Error extracting token ID:', e);
    return null;
  }
}

// ===== PRICE PREDICTION GAME =====

// Show prediction result popup after airdrop
function showPredictionResultPopup(verifyResult, airdropResult) {
  console.log('showPredictionResultPopup called with:', { verifyResult, airdropResult });
  
  // Validate required data
  if (!verifyResult || !airdropResult) {
    console.error('Missing required data for popup:', { verifyResult, airdropResult });
    return;
  }
  
  const isCorrect = verifyResult.correct || false;
  const priceChange = parseFloat(verifyResult.priceChange || 0);
  const multiplier = verifyResult.multiplier || 1;
  const airdropAmount = airdropResult.amount || '0';
  
  const startPrice = parseFloat(verifyResult.startPrice) || 0;
  const endPrice = parseFloat(verifyResult.endPrice) || 0;
  const prediction = verifyResult.prediction || 'unknown';
  const priceChangePercent = verifyResult.priceChangePercent || '0';
  
  console.log('Popup data parsed:', { isCorrect, priceChange, multiplier, airdropAmount, startPrice, endPrice, prediction, priceChangePercent });
  
  const modal = document.createElement('div');
  modal.className = 'prediction-result-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    animation: fadeIn 0.3s;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: linear-gradient(135deg, ${isCorrect ? '#1e3a2f 0%, #0f1a0f 100%' : '#3a2e1e 0%, #1f1a0f 100%'});
    padding: 10px 25px;
    border-radius: 15px;
    max-width: 380px;
    width: 90%;
    border: 3px solid ${isCorrect ? '#10b981' : '#f59e0b'};
    box-shadow: 0 0 40px ${isCorrect ? 'rgba(16, 185, 129, 0.5)' : 'rgba(245, 158, 11, 0.5)'};
    animation: popIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    text-align: center;
    max-height: 90vh;
    overflow-y: auto;
  `;
  
  // Check if there are any bonuses
  const hasLucky = airdropResult.luckyMultiplier && airdropResult.luckyMultiplier > 1;
  const hasRarity = airdropResult.rarityMultiplier && airdropResult.rarityMultiplier > 1;
  const hasBonuses = hasLucky || hasRarity || airdropResult.bonusMessages;
  const isSkipped = prediction === 'skipped' || !verifyResult.stats;
  
  content.innerHTML = `
    <div style="font-size: 2rem; margin-bottom: 3px;">
      ${isSkipped ? '🎁' : (isCorrect ? '✅' : '🎲')}
    </div>
    
    <h2 style="color: ${isSkipped ? '#fbbf24' : (isCorrect ? '#10b981' : '#f59e0b')}; margin: 0 0 8px 0; font-size: 1.4rem;">
      ${isSkipped ? 'BONUS AIRDROP' : (isCorrect ? 'CORRECT PREDICTION' : 'WRONG PREDICTION')}
    </h2>
    
    ${!isSkipped ? `
      <div style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 14px;">
        ${prediction.toUpperCase()}: $${startPrice.toFixed(4)} → $${endPrice.toFixed(4)}
        <br>
        <span style="color: ${priceChange > 0 ? '#10b981' : '#ef4444'}; font-weight: 600;">
          ${priceChange > 0 ? '+' : ''}$${Math.abs(priceChange).toFixed(4)} (${priceChangePercent}%)
        </span>
      </div>
    ` : ''}
    
    <div style="background: rgba(15, 23, 42, 0.6); padding: 10px; border-radius: 10px; margin: 10px 0; border: 1px solid #334155;">
      <div style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 2px;">💰 Airdrop Breakdown</div>
      
      <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #e2e8f0; font-size: 0.85rem;">
        <span>Base Amount:</span>
        <span style="color: #94a3b8; font-weight: bold;">${airdropResult.baseAmount || '0.01'} CELO</span>
      </div>
      
      ${!isSkipped ? `
        <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #e2e8f0; font-size: 0.85rem;">
          <span>Prediction ${isCorrect ? 'Bonus' : 'Penalty'}:</span>
          <span style="color: ${isCorrect ? '#10b981' : '#f59e0b'}; font-weight: bold;">${multiplier}x</span>
        </div>
      ` : ''}
      
      ${hasLucky ? `
        <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #e2e8f0; font-size: 0.85rem;">
          <span>🍀 Lucky Bonus:</span>
          <span style="color: #fbbf24; font-weight: bold;">${airdropResult.luckyMultiplier}x</span>
        </div>
      ` : ''}
      
      ${hasRarity ? `
        <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #e2e8f0; font-size: 0.85rem;">
          <span>✨ ${airdropResult.rarity || 'Rarity'}:</span>
          <span style="color: #a855f7; font-weight: bold;">${airdropResult.rarityMultiplier}x</span>
        </div>
      ` : ''}
      
      <div style="border-top: 2px solid #334155; margin: 10px 0; padding-top: 10px;">
        <div style="font-size: 0.95rem; color: #94a3b8;">Total Airdrop</div>
        <div style="font-size: 1.2rem; font-weight: bold; color: ${hasBonuses ? '#fbbf24' : (isCorrect ? '#10b981' : '#f59e0b')}; margin-top: 4px;">
          ${airdropAmount} CELO
        </div>
      </div>
    </div>
    
    ${hasBonuses && airdropResult.bonusMessages && airdropResult.bonusMessages.length > 0 ? `
      <div style="background: rgba(251, 191, 36, 0.1); padding: 12px; border-radius: 8px; margin: 14px 0; border: 1px solid rgba(251, 191, 36, 0.3);">
        <div style="color: #fbbf24; font-size: 0.85rem; font-weight: 600; margin-bottom: 8px;">🎯 Bonus Details:</div>
        <div style="display: flex; flex-direction: column; gap: 4px; color: #e2e8f0; font-size: 0.75rem; text-align: left;">
          ${airdropResult.bonusMessages.map(msg => `<div>✨ ${msg}</div>`).join('')}
        </div>
      </div>
    ` : ''}
    
    ${verifyResult.stats && !isSkipped ? `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0;">
        <div style="background: rgba(15, 23, 42, 0.4); padding: 8px; border-radius: 6px; border: 1px solid #334155;">
          <div style="font-size: 1.1rem; font-weight: bold; color: #49dfb5;">${verifyResult.stats.winRate}%</div>
          <div style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase;">Win Rate</div>
        </div>
        <div style="background: rgba(15, 23, 42, 0.4); padding: 8px; border-radius: 6px; border: 1px solid #334155;">
          <div style="font-size: 1.1rem; font-weight: bold; color: #49dfb5;">${verifyResult.stats.currentStreak}</div>
          <div style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase;">Streak</div>
        </div>
        <div style="background: rgba(15, 23, 42, 0.4); padding: 8px; border-radius: 6px; border: 1px solid #334155;">
          <div style="font-size: 1.1rem; font-weight: bold; color: #49dfb5;">${verifyResult.stats.totalPredictions}</div>
          <div style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase;">Total</div>
        </div>
      </div>
    ` : ''}
    
    <button id="castAndClosePredictionResult" style="
      width: 100%;
      padding: 12px;
      background: linear-gradient(90deg, ${hasBonuses ? '#fbbf24, #f59e0b' : (isCorrect ? '#10b981, #059669' : '#8b5cf6, #6366f1')});
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: bold;
      cursor: pointer;
      font-family: 'Orbitron', sans-serif;
      margin-top: 8px;
      box-shadow: 0 4px 12px ${hasBonuses ? 'rgba(251, 191, 36, 0.4)' : (isCorrect ? 'rgba(16, 185, 129, 0.4)' : 'rgba(139, 92, 246, 0.4)')};
      transition: transform 0.2s, box-shadow 0.2s;
    " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px ${hasBonuses ? 'rgba(251, 191, 36, 0.5)' : (isCorrect ? 'rgba(16, 185, 129, 0.5)' : 'rgba(139, 92, 246, 0.5)')}';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px ${hasBonuses ? 'rgba(251, 191, 36, 0.4)' : (isCorrect ? 'rgba(16, 185, 129, 0.4)' : 'rgba(139, 92, 246, 0.4)')}';">
      ${hasBonuses ? '🎉 Amazing! Cast It!' : (isCorrect ? '🎉 Awesome! Cast It!' : '👍 Got It! Cast It!')}
    </button>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  console.log('Popup created and added to DOM');
  
  // Trigger confetti for correct predictions or bonuses
  if (isCorrect || hasBonuses) {
    setTimeout(() => {
      confetti({
        particleCount: hasBonuses ? 200 : 150,
        spread: hasBonuses ? 140 : 120,
        origin: { y: 0.6 },
        colors: hasBonuses 
          ? ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f59e0b']
          : ['#10b981', '#34d399', '#6ee7b7', '#fbbf24']
      });
    }, 300);
  }
  
  // Single button - Cast and close
  document.getElementById('castAndClosePredictionResult').onclick = async () => {
    // Cast to Farcaster with prediction result
    if (lastMintedInfo.tokenId) {
      await castToFarcaster(
        lastMintedInfo.tokenId,
        lastMintedInfo.rarity || 'Common',
        lastMintedInfo.price,
        airdropAmount,
        verifyResult
      );
    }
    
    // Close modal with animation
    modal.style.animation = 'fadeOut 0.3s';
    setTimeout(() => modal.remove(), 300);
  };
  
  // Click outside to close (without cast
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.animation = 'fadeOut 0.3s';
      setTimeout(() => modal.remove(), 300);
    }
  };
}

// Show prediction modal and return user's choice
async function showPredictionModal() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'prediction-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.95); display: flex; justify-content: center; align-items: center; z-index: 9999;';
    
    const content = document.createElement('div');
    content.className = 'prediction-content';
    content.innerHTML = `
      <div class="timer-display" id="predictionTimer">⏱️ <span id="timerSeconds">60</span>s</div>
      
      <div class="prediction-header">
        <div class="prediction-icon">📈</div>
        <h2 class="prediction-title">Price Prediction Game</h2>
        <p class="prediction-subtitle">Predict CELO price in 1 minute for 2x airdrop!</p>
      </div>
      
      <div class="current-price-box" id="currentPriceBox">
        <div class="price-label">Current CELO Price</div>
        <div class="price-value" id="currentPrice">
          <span class="spinner" style="width: 30px; height: 30px;"></span>
        </div>
      </div>
      
      <div class="prediction-info">
        <div class="info-item">
          <span class="info-label">✅ Correct Prediction:</span>
          <span class="info-value" style="color: #10b981;">2x Airdrop!</span>
        </div>
        <div class="info-item">
          <span class="info-label">❌ Wrong Prediction:</span>
          <span class="info-value" style="color: #f59e0b;">0.5x Consolation</span>
        </div>
        <div class="info-item">
          <span class="info-label">⏭️ Skip:</span>
          <span class="info-value" style="color: #94a3b8;">Standard Airdrop</span>
        </div>
      </div>
      
      <div class="prediction-buttons">
        <button class="predict-btn predict-up" id="predictUp" disabled>
          📈 UP
        </button>
        <button class="predict-btn predict-down" id="predictDown" disabled>
          📉 DOWN
        </button>
      </div>
      
      <button class="skip-btn" id="skipPrediction">
        ⏭️ Skip Prediction (Get Standard Airdrop)
      </button>
      
      <div class="user-stats" id="userStatsBox" style="display: none;">
        <div class="stat-box">
          <div class="stat-number" id="statWinRate">--%</div>
          <div class="stat-label">Win Rate</div>
        </div>
        <div class="stat-box">
          <div class="stat-number" id="statStreak">0</div>
          <div class="stat-label">Streak</div>
        </div>
        <div class="stat-box">
          <div class="stat-number" id="statTotal">0</div>
          <div class="stat-label">Total</div>
        </div>
      </div>
    `})};

    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    let currentPrice = null;
    let timestamp = null;
    let timerInterval = null;
    
    // Fetch current price
    (async () => {
      try {
        const priceData = await fetchCeloPrice();
        currentPrice = priceData.price;
        timestamp = Date.now();
        
        const priceElement = document.getElementById('currentPrice');
        priceElement.innerHTML = `$${currentPrice.toFixed(4)}`;
        
        // Enable buttons
        document.getElementById('predictUp').disabled = false;
        document.getElementById('predictDown').disabled = false;
        
        // Fetch user stats
        if (userAddress) {
          try {
            const response = await fetch(`/api/prediction?userAddress=${userAddress}`);
            if (response.ok) {
              const stats = await response.json();
              document.getElementById('statWinRate').textContent = `${stats.winRate || 0}%`;
              document.getElementById('statStreak').textContent = stats.currentStreak || 0;
              document.getElementById('statTotal').textContent = stats.totalPredictions || 0;
              document.getElementById('userStatsBox').style.display = 'grid';
            }
          } catch (e) {
            console.log('Could not fetch user stats:', e);
          }
        }
        
      } catch (error) {
        console.error('Failed to fetch price:', error);
        document.getElementById('currentPrice').innerHTML = '<span style="color: #ef4444; font-size: 1rem;">Failed to load</span>';
        document.getElementById('skipPrediction').textContent = '❌ Close';
      }
    })();
    
    // Cleanup function
    const cleanup = () => {
      if (timerInterval) clearInterval(timerInterval);
      modal.remove();
    };
    
    // Handle prediction
    const handlePrediction = async (prediction) => {
      if (!currentPrice || !timestamp) return;
      
      document.getElementById('predictUp').disabled = true;
      document.getElementById('predictDown').disabled = true;
      document.getElementById('skipPrediction').disabled = true;
      
      try {
        // Store prediction
        const response = await fetch('/api/prediction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'predict',
            userAddress,
            currentPrice,
            prediction
            // Removed timestamp - now using server-generated predictionId
          })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to store prediction');
        }
        
        const data = await response.json();
        
        // THIS IS THE CRITICAL FIX
        if (data.success) {
          localStorage.setItem('activePredictionId', data.predictionId);
          localStorage.setItem('predictionExpiresAt', data.expiresAt);
          
          setStatus('Prediction locked! 60 seconds starting...', 'success');
          // startCountdown(); // your existing timer function
        } else {
          setStatus(data.error || 'Failed to record prediction', 'error');
        }
        
        // Close modal and proceed to mint immediately
        cleanup();
        resolve({
          skip: false,
          prediction,
          startPrice: currentPrice
          // Removed timestamp and timeLeft - not needed with predictionId system
        });
        
      } catch (error) {
        console.error('Prediction error:', error);
        setStatus('Prediction failed: ' + error.message, 'error');
        cleanup();
        resolve({ skip: true });
      }
    
    // Event listeners
    document.getElementById('predictUp').onclick = () => handlePrediction('up');
    document.getElementById('predictDown').onclick = () => handlePrediction('down');
    document.getElementById('skipPrediction').onclick = () => {
      cleanup();
      resolve({ skip: true });
    };
    
    // Click outside to close (only on modal background, not content)
    modal.onclick = (e) => {
      if (e.target === modal) {
        cleanup();
        resolve({ skip: true });
      }
    };
  }

// Verify prediction after 60 seconds
async function verifyPredictionAndContinue(prediction, startPrice) {
  return new Promise(async (resolve) => {
    try {
      // Fetch fresh price
      const newPriceData = await fetchCeloPrice();
      const newPrice = newPriceData.price;

      // Get the server-generated predictionId
      const predictionId = localStorage.getItem('activePredictionId');
      if (!predictionId) {
        throw new Error('No active prediction found – treating as skip');
      }

      // Send verification
      const response = await fetch('/api/prediction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          userAddress,
          predictionId,
          newPrice
        })
      });

      // Always clean up localStorage first
      localStorage.removeItem('activePredictionId');
      localStorage.removeItem('predictionExpiresAt');

      // Handle HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Verify failed:', response.status, errorText);
        throw new Error('Server error during verification');
      }

      const result = await response.json();

      // Backend now returns { success: true, correct: true/false, ... }
      if (!result.success) {
        throw new Error(result.error || 'Verification failed');
      }

      // SUCCESS — everything worked perfectly
      resolve({
        skip: false,
        correct: !!result.correct,        // force boolean
        multiplier: result.multiplier || 1,
        startPrice,
        endPrice: newPrice,
        verifyResult: result               // full stats, streaks, etc.
      });

    } catch (error) {
      // ANY error = fallback to standard airdrop (safe & fair)
      console.error('Prediction verification failed:', error);

      // Make sure storage is clean
      localStorage.removeItem('activePredictionId');
      localStorage.removeItem('predictionExpiresAt');

      setStatus('Prediction result unavailable – standard airdrop applied', 'warning');

      resolve({
        skip: true
      });
    }
  });
}
// ⭐ AIRDROP CLAIMING FUNCTION ⭐
async function claimAirdrop(tokenId, txHash, predictionMultiplier = 1) {
  try {
    setStatus('Calculating your airdrop bonus...', 'info');
    
    const response = await fetch('/api/airdrop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tokenId: tokenId,
        userAddress: userAddress,
        mintTxHash: txHash,
        predictionMultiplier: predictionMultiplier
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Airdrop claim failed');
    }
    
    if (data.success) {
      const amountReceived = data.amount || '0.01';
      lastAirdropAmount = amountReceived;
      
      // Check if this was a bonus airdrop
      const isBonus = data.isBonus || (data.bonusMessages && data.bonusMessages.length > 0);
      
      if (isBonus) {
        // SUPER BONUS CELEBRATION! 🎉
        setStatus(`💸 BONUS AIRDROP! ${amountReceived} CELO! 🎉`, 'success');
        
        // Don't show separate bonus popup - it's merged with prediction result
        // showBonusBreakdown(data);
        
        // Epic confetti for bonuses
        launchBonusConfetti(parseFloat(amountReceived));
        
        // Play bonus sound (if you add sounds)
        if (typeof playSound === 'function') {
          playSound('bonus');
        }
      } else {
        setStatus(`Airdrop received! ${amountReceived} CELO sent to your wallet! 🎉`, 'success');
        
        // Normal confetti
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.7 },
          colors: ['#10b981', '#34d399', '#6ee7b7']
        });
      }
      
      // Add airdrop link to transaction container
      if (data.txHash && txLinksContainer) {
        const airdropLink = document.createElement('a');
        airdropLink.href = data.explorerUrl || `https://celoscan.io/tx/${data.txHash}`;
        airdropLink.target = '_blank';
        airdropLink.rel = 'noopener noreferrer';
        airdropLink.className = 'tx-link';
        airdropLink.textContent = isBonus 
          ? `💎 View Bonus (${amountReceived} CELO)` 
          : `View Airdrop (${amountReceived} CELO)`;
        airdropLink.style.background = isBonus 
          ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' 
          : 'linear-gradient(135deg, #10b981, #059669)';
        
        txLinksContainer.appendChild(airdropLink);
      }
      
      return data;
    }
  } catch (error) {
    console.error('Airdrop claim error:', error);
    
    const errorMsg = error.message || 'Airdrop claim failed';
    
    if (errorMsg.includes('Rate limit')) {
      setStatus(errorMsg, 'warning');
    } else if (errorMsg.includes('already claimed')) {
      setStatus('Airdrop already claimed for this mint', 'info');
    } else {
      setStatus('Airdrop claim failed: ' + errorMsg, 'warning');
    }
    
    return null;
  }
}

// Show bonus breakdown modal
function showBonusBreakdown(data) {
  const modal = document.createElement('div');
  modal.className = 'bonus-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    animation: fadeIn 0.3s;
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    padding: 20px;
    border-radius: 12px;
    max-width: 380px;
    width: 90%;
    border: 3px solid #fbbf24;
    box-shadow: 0 0 30px rgba(251, 191, 36, 0.5);
    animation: popIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    max-height: 85vh;
    overflow-y: auto;
  `;
  
  const bonusMessages = data.bonusMessages || [];
  const bonusesHTML = bonusMessages.map(msg => `<div class="bonus-item">✨ ${msg}</div>`).join('');
  
  content.innerHTML = `
    <div style="text-align: center;">
      <div style="font-size: 3rem; margin-bottom: 8px;">💎</div>
      <h2 style="color: #fbbf24; margin: 0 0 8px 0; font-size: 1.4rem;">BONUS AIRDROP!</h2>
      <div style="font-size: 2rem; font-weight: bold; color: #10b981; margin: 14px 0;">
        ${data.amount} CELO
      </div>
      
      <div style="background: rgba(15, 23, 42, 0.6); padding: 12px; border-radius: 8px; margin: 14px 0; border: 1px solid #334155;">
        <div style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 6px;">Breakdown:</div>
        <div style="color: #e2e8f0; font-size: 0.85rem; line-height: 1.5;">
          ${data.baseAmount ? `<div>Base: ${data.baseAmount} CELO</div>` : ''}
          ${data.luckyMultiplier > 1 ? `<div>Lucky: ${data.luckyMultiplier}x</div>` : ''}
          ${data.rarityMultiplier > 1 ? `<div>${data.rarity}: ${data.rarityMultiplier}x</div>` : ''}
        </div>
      </div>
      
      ${bonusesHTML ? `
        <div style="background: rgba(251, 191, 36, 0.1); padding: 12px; border-radius: 8px; margin: 14px 0; border: 1px solid rgba(251, 191, 36, 0.3);">
          <div style="color: #fbbf24; font-size: 0.85rem; font-weight: 600; margin-bottom: 8px;">🎯 Your Bonuses:</div>
          <div style="display: flex; flex-direction: column; gap: 6px; color: #e2e8f0; font-size: 0.8rem;">
            ${bonusesHTML}
          </div>
        </div>
      ` : ''}
      
      <button id="closeBonusModal" style="
        background: linear-gradient(90deg, #49dfb5, #10b981);
        color: #0f0f0f;
        border: none;
        padding: 10px 24px;
        border-radius: 8px;
        font-size: 0.95rem;
        font-weight: bold;
        cursor: pointer;
        margin-top: 14px;
        width: 100%;
        font-family: 'Orbitron', sans-serif;
      ">
        Awesome! 🎉
      </button>
    </div>
  `;
  
  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // Close modal
  document.getElementById('closeBonusModal').onclick = () => {
    modal.style.animation = 'fadeOut 0.3s';
    setTimeout(() => modal.remove(), 300);
  };
  
  // Click outside to close
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.animation = 'fadeOut 0.3s';
      setTimeout(() => modal.remove(), 300);
    }
  };
}

// Epic confetti for bonuses
function launchBonusConfetti(amount) {
  const duration = 5000;
  const end = Date.now() + duration;
  
  // Determine confetti intensity based on amount
  const intensity = amount > 0.1 ? 'mega' : amount > 0.05 ? 'super' : 'normal';
  
  const colors = intensity === 'mega' 
    ? ['#fbbf24', '#f59e0b', '#ec4899', '#a855f7', '#10b981']
    : intensity === 'super'
    ? ['#fbbf24', '#f59e0b', '#10b981', '#3b82f6']
    : ['#10b981', '#34d399', '#6ee7b7'];
  
  const frame = () => {
    confetti({
      particleCount: intensity === 'mega' ? 15 : intensity === 'super' ? 10 : 5,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors: colors
    });
    
    confetti({
      particleCount: intensity === 'mega' ? 15 : intensity === 'super' ? 10 : 5,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors: colors
    });
    
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  };
  
  frame();
  
  // Final burst
  setTimeout(() => {
    confetti({
      particleCount: intensity === 'mega' ? 300 : intensity === 'super' ? 200 : 150,
      spread: 180,
      origin: { y: 0.5 },
      colors: colors,
      ticks: 400
    });
  }, duration - 500);
}

// Add CSS animations for bonus modal
const bonusStyle = document.createElement('style');
bonusStyle.textContent = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  
  @keyframes popIn {
    0% {
      transform: scale(0.8);
      opacity: 0;
    }
    50% {
      transform: scale(1.05);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  
  .bonus-item {
    padding: 6px 12px;
    background: rgba(251, 191, 36, 0.1);
    border-radius: 6px;
    border: 1px solid rgba(251, 191, 36, 0.3);
  }
`;
document.head.appendChild(bonusStyle);

// ===== FARCASTER + WARPCAST CASTING =====
async function castToFarcaster(tokenId, rarity, price, airdropAmount = null, predictionResult = null) {
  let text;

  // 💸 If we have airdrop info, build the richer copy
  if (airdropAmount) {
    const airdropFormatted = Number(airdropAmount).toFixed(4);

    if (predictionResult && predictionResult.correct === true) {
      // Correct prediction - 2x airdrop
      text = `🎯 I predicted CELO price correctly and got 2x airdrop!

✨ Minted NFT #${tokenId} (${rarity}) at ${price}
💰 Earned ${airdropFormatted} CELO
🔥 Try your luck with price predictions!

Mint + Predict:`;
    } else if (predictionResult && predictionResult.correct === false) {
      // Wrong prediction but consolation airdrop
      text = `🎲 I played the CELO price prediction game!

✨ Minted NFT #${tokenId} (${rarity}) at ${price}
💰 Got ${airdropFormatted} CELO consolation prize
📈 Will you predict correctly?

Mint + Predict:`;
    } else {
      // Lucky / rarity bonus airdrops without explicit prediction result
      text = `💎 LUCKY MINT! Got bonus airdrop!

✨ Minted NFT #${tokenId} (${rarity}) at ${price}
🎁 Received ${airdropFormatted} CELO
🍀 Plus price prediction game!

Mint + Earn:`;
    }
  } else {
    // Plain mint copy if we don't have airdrop details
    text = `I just minted CELO NFT #${tokenId} (${rarity}) at ${price}! 🎨✨

Free mint + Airdrop + Price game:`;
  }

  const embedUrl = MINIAPP_URL;

  // ✅ Native Farcaster Mini App flow
  if (isFarcasterEnvironment && sdk?.actions?.composeCast) {
    try {
      setStatus('Opening cast composer... 📝', 'info');

      const result = await sdk.actions.composeCast({
        text,
        embeds: [embedUrl],
      });

      if (result?.cast) {
        setStatus(
          `✅ Cast posted! Hash: ${result.cast.hash.slice(0, 10)}...`,
          'success'
        );
        console.log('Cast hash:', result.cast.hash);
        if (result.cast.channelKey) {
          console.log('Posted to channel:', result.cast.channelKey);
        }
      } else {
        setStatus('Cast cancelled', 'info');
      }
    } catch (e) {
      console.error('Cast failed:', e);
      setStatus('Failed to create cast. Please try again.', 'error');
    }
  } else {
    // 🌐 Warpcast web fallback
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(
      text
    )}&embeds[]=${encodeURIComponent(embedUrl)}`;

    const popup = window.open(
      warpcastUrl,
      '_blank',
      'width=600,height=700'
    );

    if (popup) {
      setStatus('Opening Warpcast composer.', 'success');
      // Clear status after 5s
      setTimeout(() => {
        statusBox.innerHTML = '';
        statusBox.className = 'status-box';
      }, 5000);
    } else {
      setStatus('Please allow popups to share on Warpcast', 'warning');
    }
  }
}
async function downloadSVGFile() {
  if (!currentNFTData || !currentNFTData.svg) {
    setStatus('No NFT data available for download', 'error');
    return;
  }
  
  try {
    const svgData = currentNFTData.svg;
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: `celo-nft-${lastMintedTokenId}.svg`,
          types: [{
            description: 'SVG Image',
            accept: { 'image/svg+xml': ['.svg'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setStatus('SVG downloaded!', 'success');
        return;
      } catch (e) {
        if (e.name === 'AbortError') {
          // User cancelled - silently return without error
          return;
        }
        console.log('File picker failed, using fallback:', e);
      }
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `celo-nft-${lastMintedTokenId}.svg`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    setStatus('SVG downloaded!', 'success');
  } catch (e) {
    console.error('SVG download failed:', e);
    setStatus('Failed to download SVG: ' + e.message, 'error');
  }
}

async function downloadPNGFile() {
  if (!currentNFTData || !currentNFTData.svg) {
    setStatus('No NFT data available for download', 'error');
    return;
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  
  const img = new Image();
  const svgBlob = new Blob([currentNFTData.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  try {
    setStatus('Generating PNG... ⏳', 'info');
    
    await new Promise((resolve, reject) => {
      img.onload = async () => {
        try {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, 400, 400);
          ctx.drawImage(img, 0, 0, 400, 400);
          
          canvas.toBlob(async (blob) => {
            if (!blob) {
              reject(new Error('Failed to generate PNG blob'));
              return;
            }
            
            if (window.showSaveFilePicker) {
              try {
                const handle = await window.showSaveFilePicker({
                  suggestedName: `celo-nft-${lastMintedTokenId}.png`,
                  types: [{
                    description: 'PNG Image',
                    accept: { 'image/png': ['.png'] }
                  }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                setStatus('PNG downloaded!', 'success');
                resolve();
                return;
              } catch (e) {
                if (e.name === 'AbortError') {
                  // User cancelled - just use fallback
                  // Don't return, let it continue to fallback download
                } else {
                  console.log('File picker failed, using fallback:', e);
                }
              }
            }
            
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = downloadUrl;
            a.download = `celo-nft-${lastMintedTokenId}.png`;
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(downloadUrl);
            }, 100);
            
            setStatus('PNG downloaded!', 'success');
            resolve();
          }, 'image/png', 1.0);
        } catch (e) {
          reject(e);
        }
      };
      
      img.onerror = (e) => {
        console.error('Image load failed:', e);
        reject(new Error('Failed to load SVG image'));
      };
      
      img.src = url;
    });
  } catch (e) {
    console.error('PNG download failed:', e);
    setStatus('Failed to generate PNG: ' + e.message, 'error');
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function copyImageToClipboard() {
  if (!currentNFTData || !currentNFTData.svg) {
    setStatus('No NFT data available', 'error');
    return;
  }
  
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    setStatus('Copy not supported in this browser', 'warning');
    return;
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');
  
  const img = new Image();
  const svgBlob = new Blob([currentNFTData.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  
  try {
    setStatus('Copying to clipboard... ⏳', 'info');
    
    await new Promise((resolve, reject) => {
      img.onload = async () => {
        try {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, 400, 400);
          ctx.drawImage(img, 0, 0, 400, 400);
          
          canvas.toBlob(async (blob) => {
            if (!blob) {
              reject(new Error('Failed to generate image'));
              return;
            }
            
            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
              ]);
              setStatus('Image copied to clipboard!', 'success');
              resolve();
            } catch (e) {
              console.error('Clipboard write failed:', e);
              reject(e);
            }
          }, 'image/png');
        } catch (e) {
          reject(e);
        }
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = url;
    });
  } catch (e) {
    console.error('Copy failed:', e);
    setStatus('Failed to copy: ' + e.message, 'error');
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}

function shareToTwitter() {
  let text = '';
  const APP_URL = 'https://celo-nft-phi.vercel.app/';
  const HASHTAGS = 'CeloNFT,Celo,NFT,Web3'; // Twitter handles comma-separated hashtags perfectly

  // Re-use the exact same data sources as Farcaster version
  const tokenId = lastMintedInfo?.tokenId;
  const rarity = lastMintedInfo?.rarity;
  const price = lastMintedInfo?.price;
  const airdropAmount = lastAirdropAmount;
  let predictionResult = null;

  if (sessionStorage.getItem('lastPredictionResult')) {
    try {
      predictionResult = JSON.parse(sessionStorage.getItem('lastPredictionResult'));
    } catch (e) {
      console.warn('Failed to parse prediction result for Twitter share:', e);
    }
  }

  // === EXACT SAME MESSAGE LOGIC AS FARCASTER ===
  if (airdropAmount && tokenId && rarity && price) {
    const airdropFormatted = Number(airdropAmount).toFixed(4);

    if (predictionResult?.correct === true) {
      text = `🎯 I predicted CELO price correctly and got 2x airdrop!

✨ Minted NFT #${tokenId} (${rarity}) at ${price}
💰 Earned ${airdropFormatted} CELO
🔥 Try your luck with price predictions!

Mint + Predict:`;
    } else if (predictionResult?.correct === false) {
      text = `🎲 I played the CELO price prediction game!

✨ Minted NFT #${tokenId} (${rarity}) at ${price}
💰 Got ${airdropFormatted} CELO consolation prize
📈 Will you predict correctly?

Mint + Predict:`;
    } else {
      // Bonus airdrop (lucky mint or no prediction)
      text = `💎 LUCKY MINT! Got bonus airdrop!

✨ Minted NFT #${tokenId} (${rarity}) at ${price}
🎁 Received ${airdropFormatted} CELO
🍀 Plus price prediction game!

Mint + Earn:`;
    }
  } else if (tokenId && rarity && price) {
    // Only mint info available
    text = `I just minted CELO NFT #${tokenId} (${rarity}) at ${price}! 🎨✨

Free mint + Airdrop + Price game:`;
  } else {
    // Ultimate fallback
    text = `🎨 Minting CELO NFTs with live price snapshots!

Free mint + instant airdrop + price prediction game
Join now 👇`;
  }

  // Append app link at the end (Twitter will auto-card preview)
  text += `\n\n${APP_URL}`;

  // Build Twitter intent URL
  const twitterUrl = `https://twitter.com/intent/tweet?` +
    `text=${encodeURIComponent(text)}` +
    `&hashtags=${HASHTAGS}`;

  const popup = window.open(twitterUrl, '_blank', 'width=600,height=520');

  if (popup) {
    setStatus('Opening Twitter composer...', 'info');
  } else {
    setStatus('Popup blocked — please allow popups to share on Twitter', 'warning');
  }

  // Auto-clear status
  setTimeout(() => {
    if (statusBox) {
      statusBox.innerHTML = '';
      statusBox.className = 'status-box';
    }
  }, 5000);
}function showGiftModal() {
  if (!lastMintedTokenId) {
    setStatus('No NFT to gift. Please mint first!', 'warning');
    return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'gift-modal';
  modal.innerHTML = `
    <div class="gift-modal-content">
      <button class="close-modal" onclick="this.parentElement.parentElement.remove()">✕</button>
      <h2>🎁 Gift NFT #${lastMintedTokenId}</h2>
      <p style="color: #9ca3af; margin-bottom: 20px;">Send this NFT to another address</p>
      <input type="text" id="recipientAddress" placeholder="Recipient address (0x...)" />
      <textarea id="giftMessage" placeholder="Optional message (for display only)" rows="3"></textarea>
      <button id="sendGiftBtn" class="action-button" style="width: 100%; margin-top: 16px;">Send Gift</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  document.getElementById('sendGiftBtn').onclick = async () => {
    const recipient = document.getElementById('recipientAddress').value.trim();
    const message = document.getElementById('giftMessage').value.trim();
    
    if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
      setStatus('Please enter a valid Celo address', 'error');
      return;
    }
    
    await giftNFT(lastMintedTokenId, recipient, message);
    modal.remove();
  };
}

async function giftNFT(tokenId, recipient, message) {
  try {
    setStatus('Sending gift... 🎁', 'info');
    
    const hash = await writeContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'transferFrom',
      args: [userAddress, recipient, BigInt(tokenId)]
    });
    
    setStatus('Confirming transfer...', 'info');
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash });
    
    if (receipt.status === 'reverted') {
      throw new Error('Transfer was reverted.');
    }
    
    setStatus(`✅ NFT #${tokenId} gifted successfully!`, 'success');
    
    const gifts = JSON.parse(safeLocalStorage.getItem('giftHistory') || '[]');
    gifts.unshift({
      tokenId,
      recipient,
      message,
      timestamp: Date.now(),
      txHash: hash
    });
    safeLocalStorage.setItem('giftHistory', JSON.stringify(gifts));
    
    const celoscanUrl = `https://celoscan.io/tx/${hash}`;
    setTimeout(() => {
      setStatus(`Gift sent! View transaction: ${celoscanUrl}`, 'success');
    }, 2000);
    
    updateUserMintCount();
  } catch (e) {
    const errorMsg = getImprovedErrorMessage(e);
    setStatus(errorMsg, 'error');
    console.error('Gift Error:', e);
  }
}

let lastMintedInfo = { tokenId: null, txHash: null, rarity: null, price: null };

async function previewNft(tokenId, isNewMint = false) {
  if (!contractDetails) return;

  statusBox.innerHTML = '';
  statusBox.className = 'status-box';
  
  previewContainer.innerHTML = '<div style="display: flex; justify-content: center; align-items: center; height: 200px;"><span class="spinner" style="width: 40px; height: 40px; border-width: 4px;"></span></div>';
  previewContainer.classList.remove('hidden');
  
  previewBtn.disabled = true;
  previewBtn.innerHTML = '<span class="spinner"></span> Loading Preview…';
  previewContainer.classList.remove("sparkles", ...ALL_RARITY_CLASSES);
  nftActions.classList.add('hidden');
  
  if (!isNewMint) {
    txLinksContainer.classList.add('hidden');
  }
  
  const nftActionsRow2 = document.getElementById('nftActionsRow2');
  if (nftActionsRow2) nftActionsRow2.classList.add('hidden');

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
    const safeSvg = sanitizeSVG(svgString);

    currentNFTData = {
      svg: safeSvg,
      metadata: metadata,
      tokenId: tokenId
    };

    previewContainer.innerHTML = safeSvg;
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
    
    nftActions.classList.remove('hidden');
    if (nftActionsRow2) nftActionsRow2.classList.remove('hidden');
    
    if (isFarcasterEnvironment) {
      if (downloadSVG) downloadSVG.style.display = 'none';
      if (downloadGIF) downloadGIF.style.display = 'none';
    }
    
    if (!isNewMint && contractAddress) {
      const celoscanTokenUrl = `https://celoscan.io/token/${contractAddress}?a=${tokenId}`;

      txLinksContainer.innerHTML = `
        <a href="${celoscanTokenUrl}" target="_blank" rel="noopener noreferrer">View on Celoscan</a>
      `;
      
      // Check if txLinksContainer exists before appending
      if (txLinksContainer) {
        const castBtnElement = document.createElement('button');
        castBtnElement.id = 'castBtn';
        castBtnElement.className = 'tx-link cast-link';
        castBtnElement.innerHTML = '📣 Cast';
        castBtnElement.onclick = async () => {
          // Use stored airdrop amount if available
          await castToFarcaster(tokenId, rarityText, priceText, lastAirdropAmount, null);
        };
        txLinksContainer.appendChild(castBtnElement);
      }
      
      txLinksContainer.classList.remove('hidden');
    }

  } catch (e) {
    setStatus("Failed to load NFT preview. Check console for details.", 'error'); 
    previewBtn.innerText = 'Preview NFT Error';
    console.error(`NFT Preview Error for token ID ${tokenId}:`, e);
    previewContainer.classList.add('hidden');
    nftActions.classList.add('hidden');
    if (nftActionsRow2) nftActionsRow2.classList.add('hidden');
    txLinksContainer.classList.add('hidden');
  } finally {
    previewBtn.disabled = false;
  }
}

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

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      initTradingView();
      observer.disconnect();
    }
  }, { threshold: 0.1 });
  
  const chartContainer = document.querySelector('.tradingview-widget-container');
  if (chartContainer) {
    observer.observe(chartContainer);
  }
} else {
  initTradingView();
}

(async () => {
  try {
    await sdk.actions.ready({ disableNativeGestures: true });
    console.log('Farcaster SDK initialized successfully');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await sdk.actions.addMiniApp();
  } catch (e) {
    console.log('Farcaster SDK not available or failed to initialize:', e);
  }
})();

const wagmiAdapter = new WagmiAdapter({
  networks: [celo],
  projectId: PROJECT_ID,
  ssr: false
});

wagmiConfig = wagmiAdapter.wagmiConfig;

(async () => {
  try {
    lastMintedTokenId = safeLocalStorage.getItem("lastMintedTokenId");
    if (lastMintedTokenId) {
      previewBtn.innerText = `Preview NFT #${lastMintedTokenId}`;
      previewBtn.classList.remove('hidden');
    }

    isFarcasterEnvironment = await isFarcasterEmbed();
    
    console.log('=== ENVIRONMENT DETECTION ===');
    console.log('Detected as Farcaster:', isFarcasterEnvironment);
    console.log('Window location:', window.location.href);
    console.log('Is iframe:', window.self !== window.top);
    console.log('Has SDK:', typeof sdk !== 'undefined');
    console.log('SDK Context:', sdk?.context);
    console.log('============================');
    
    if (isFarcasterEnvironment) {
      externalBanner.href = 'https://celo-nft-phi.vercel.app/';
      externalBannerText.textContent = 'Open in Browser';
      externalBanner.classList.remove('hidden');
    } else {
      externalBanner.href = MINIAPP_URL;
      externalBannerText.textContent = 'Open in Farcaster';
      externalBanner.classList.remove('hidden');
    }

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
          
          const hasPromptedAddApp = safeLocalStorage.getItem('hasPromptedAddApp');
          if (!hasPromptedAddApp && sdk?.actions?.addMiniApp) {
            try {
              await sdk.actions.addMiniApp();
              safeLocalStorage.setItem('hasPromptedAddApp', 'true');
            } catch(e) {
              console.log('Add mini app prompt declined or failed:', e);
            }
          }
        }
      } catch (e) {
        console.log('Farcaster connection failed:', e);
      }
    }

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
        connectMethodsOrder: ["wallet"],
      },
      allWallets: 'SHOW',
      themeMode: 'dark',
      themeVariables: {
        '--w3m-accent': '#49dfb5',
        '--w3m-border-radius-master': '8px'
      }
    });

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
      setStatus("Missing contract details.", 'error'); 
      console.error('Contract load error:', e);
      
      const retryBtn = document.createElement('button');
      retryBtn.className = 'action-button';
      retryBtn.style.cssText = 'background: linear-gradient(90deg, #f59e0b, #f97316); padding: 0.8rem 1.5rem; font-size: 1rem; margin-top: 12px;';
      retryBtn.innerText = '🔄 Retry Load';
      retryBtn.onclick = () => window.location.reload();
      
      statusBox.appendChild(document.createElement('br'));
      statusBox.appendChild(retryBtn);
      
      mintBtn.disabled = true; 
      return;
    }

    if (!contractDetails) {
      mintBtn.disabled = true;
      return;
    }

    const currentAccount = getAccount(wagmiConfig);
    const chainId = currentAccount.chainId;

    if (chainId && chainId !== celo.id) {
      setStatus("Please switch to Celo Mainnet.", 'warning');
      mintBtn.disabled = true;
      mintBtn.title = "Switch to Celo Mainnet to mint.";
      return;
    } else {
      mintBtn.title = ""; 
    }
    
    try {
      const price = await readContract(wagmiConfig, {
        address: contractDetails.address,
        abi: contractDetails.abi,
        functionName: 'mintPrice'
      });
      
      mintPriceWei = BigInt(price);
      
      if (mintPriceWei > 0n) {
        const celoPrice = Number(mintPriceWei) / 1e18;
        mintBtn.innerText = `MINT (${celoPrice.toFixed(4)} CELO)`;
      }

      console.log('Contract settings:', { mintPriceWei: mintPriceWei.toString() });

    } catch (e) {
      setStatus(`Could not read contract settings. Assuming free mint.`, 'warning');
      mintPriceWei = 0n;
      console.warn(`Failed to read contract settings.`, e);
    }

    try {
      const maxSupply = await readContract(wagmiConfig, {
        address: contractDetails.address,
        abi: contractDetails.abi,
        functionName: MAX_SUPPLY_FUNCTION_NAME
      });
      MAX_SUPPLY = Number(maxSupply);
      console.log('Max supply:', MAX_SUPPLY);
    } catch (e) {
      console.log('No max supply set - unlimited minting');
      MAX_SUPPLY = 0;
    }

    if (connected) {
      await updateSupply(true);
      updateUserMintCount();
      
      // Show tabs and balance on initial connection
      const tabNav = document.getElementById('tabNavigation');
      if (tabNav) tabNav.classList.remove('hidden');
      updateWalletBalance();
      
      // Load achievements in bottom section
      setTimeout(() => loadAchievementsBottom(), 1500);
    }
  } catch (error) {
    console.error('Initialization error:', error);
    setStatus('Failed to initialize. Please refresh the page.', 'error');
  }
})();

watchAccount(wagmiConfig, {
  onChange(account) {
    clearTimeout(accountChangeTimeout);
    accountChangeTimeout = setTimeout(() => {
      try {
        if (account.address && account.isConnected) {
          console.log('Account changed to:', account.address);
          userAddress = account.address;
          showAddress(userAddress);
          setStatus('Wallet connected successfully!', 'success');
          mintBtn.disabled = false;
          
          updateSupply(true);
          updateUserMintCount();
          
          // Show tab navigation and update balance
          const tabNav = document.getElementById('tabNavigation');
          if (tabNav) tabNav.classList.remove('hidden');
          updateWalletBalance();
          
          // Load achievements in bottom section
          setTimeout(() => loadAchievementsBottom(), 1000);
          
          previewBtn.classList.add('hidden');
          previewContainer.classList.add('hidden');
          nftActions.classList.add('hidden');
          const nftActionsRow2 = document.getElementById('nftActionsRow2');
          if (nftActionsRow2) nftActionsRow2.classList.add('hidden');
          
          lastMintedTokenId = null;
          lastAirdropAmount = null;
          sessionStorage.removeItem('lastMintedTokenId');

        } else if (!account.isConnected && userAddress) {
          console.log('Wallet disconnected');
          
          // Clean up intervals to prevent memory leaks
          stopRecentMintsPolling();
          if (leaderboardInterval) {
            clearInterval(leaderboardInterval);
            leaderboardInterval = null;
          }
          
          userAddress = null;
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
          const nftActionsRow2 = document.getElementById('nftActionsRow2');
          if (nftActionsRow2) nftActionsRow2.classList.add('hidden');
          if (totalMintedStat) totalMintedStat.textContent = '--';
          if (yourMintsStat) yourMintsStat.textContent = '--';
          if (remainingStat) remainingStat.textContent = '--';
          sessionStorage.removeItem('lastMintedTokenId');
          lastMintedTokenId = null;
          lastAirdropAmount = null;
        }
      } catch (error) {
        console.error('Account change error:', error);
      }
    }, 300);
  },
});

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

// ⭐ MINT BUTTON WITH PREDICTION GAME & AUTOMATIC AIRDROP ⭐
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
    
    const currentAccount = getAccount(wagmiConfig);
    if (currentAccount.chainId !== celo.id) {
      setStatus("⚠️ Please switch to Celo Mainnet", "error");
      if (modal) {
        modal.open({ view: 'Networks' });
      }
      return;
    }
    
    // 🎯 STEP 1: SHOW PREDICTION MODAL
    setStatus('Ready to predict? 📈', 'info');
    const predictionResult = await showPredictionModal();
    
    console.log('Prediction result:', predictionResult);
    
    statusBox.innerHTML = '';
    statusBox.className = 'status-box';

    previewBtn.classList.add('hidden');
    previewContainer.classList.add('hidden');
    previewContainer.classList.remove('sparkles', ...ALL_RARITY_CLASSES);
    txLinksContainer.classList.add('hidden');
    nftActions.classList.add('hidden');

    mintBtn.disabled = true;
    mintBtn.innerHTML = '<span class="spinner"></span> Minting...';
    lastMintedTokenId = null;
    lastAirdropAmount = null; // Reset airdrop amount

    const { address, abi } = contractDetails;

    // 🎲 STEP 2: MINT NFT IMMEDIATELY
    const priceData = await fetchCeloPrice();
    const price = priceData.price;
    const priceForContract = Math.floor(price * 10000);

    const hash = await writeContract(wagmiConfig, {
      address,
      abi,
      functionName: 'mint',
      args: [priceForContract],
      value: mintPriceWei 
    });
    
    setStatus("Confirming transaction...", "info");
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, timeout: 30_000});

    if (receipt.status === 'reverted') {
      throw new Error('Transaction was reverted.');
    }

    const actualTokenId = await getTokenIdFromReceipt(receipt);
    
    if (!actualTokenId) {
      throw new Error('Failed to get token ID from receipt');
    }

    safeLocalStorage.setItem('lastMintedTokenId', actualTokenId.toString());
    
    celebrateMint();
    
    setStatus("🎉 Mint Successful!", "success");
    
    const priceText = (price).toFixed(4);
    lastMintedInfo = { tokenId: actualTokenId, txHash: hash, price: priceText, rarity: null };
    
    if (contractAddress) {
      const celoscanTokenUrl = `https://celoscan.io/token/${contractAddress}?a=${actualTokenId}`;

      txLinksContainer.innerHTML = `
        <a href="${celoscanTokenUrl}" target="_blank" rel="noopener noreferrer">View on Celoscan</a>
      `;
      
      // Check if txLinksContainer exists before appending
      if (txLinksContainer) {
        const castBtnElement = document.createElement('button');
        castBtnElement.id = 'castBtn';
        castBtnElement.className = 'tx-link cast-link';
        castBtnElement.innerHTML = '📣 Cast';
        castBtnElement.onclick = async () => {
          if (lastMintedInfo.tokenId) {
            await castToFarcaster(
              lastMintedInfo.tokenId, 
              lastMintedInfo.rarity || 'Common', 
              lastMintedInfo.price,
              lastAirdropAmount, // Include airdrop amount
              null // No prediction result in this context
            );
          }
        };
        txLinksContainer.appendChild(castBtnElement);
      }
      
      txLinksContainer.classList.remove('hidden');
    }

    lastMintedTokenId = actualTokenId;
    saveMintToHistory(actualTokenId, hash);

    await updateSupply();
    previewBtn.classList.remove('hidden');
    previewBtn.innerText = `Preview NFT #${actualTokenId}`;
    await previewNft(lastMintedTokenId, true);
    
    // Update wallet balance after mint
    updateWalletBalance();
    
    if (currentNFTData && currentNFTData.metadata) {
      const rarityAttr = currentNFTData.metadata.attributes?.find(attr => attr.trait_type === 'Rarity');
      if (rarityAttr) {
        lastMintedInfo.rarity = rarityAttr.value;
      }
    }

    // 🎯 STEP 3: HANDLE AIRDROP BASED ON PREDICTION
    if (predictionResult.skip) {
      // User skipped prediction - send standard airdrop immediately
      setTimeout(async () => {
        const airdropResult = await claimAirdrop(actualTokenId, hash, 1);
        
        console.log('Skip prediction - Airdrop result:', airdropResult);
        
        // Show bonus popup if user got lucky/rarity bonuses
        if (airdropResult && (airdropResult.luckyMultiplier > 1 || airdropResult.rarityMultiplier > 1 || airdropResult.bonusMessages)) {
          setTimeout(() => {
            // Create a fake verifyResult for skipped predictions
            const fakeVerifyResult = {
              success: true,
              correct: null,
              prediction: 'skipped',
              startPrice: 0,
              endPrice: 0,
              priceChange: '0',
              priceChangePercent: '0',
              multiplier: 1,
              stats: null
            };
            
            console.log('Showing bonus popup for skip user');
            showPredictionResultPopup(fakeVerifyResult, airdropResult);
          }, 2000);
        }
      }, 2000);
    } else {
      // User made a prediction - wait for verification
      setStatus(`⏳ Waiting for price verification... (60s remaining)`, 'info');
      
      // Fixed 60-second delay for prediction verification
      const safeDelay = 60000; // 60 seconds
      
      // Schedule airdrop after 60 seconds
      setTimeout(async () => {
        try {
          setStatus('🔍 Verifying prediction result...', 'info');
          
          // Fetch current price for verification
          const priceData = await fetchCeloPrice();
          console.log('Current price for verification:', priceData.price);
          
          // CRITICAL: get predictionId from localStorage
          const activeId = localStorage.getItem('activePredictionId');
          console.log('Verifying prediction with params:', {
            userAddress,
            predictionId: activeId,
            newPrice: priceData.price
          });
          
          let verifyResult = null;
          let useClientSideVerification = false;
          
          // Try server-side verification first
          try {
            const verifyResponse = await fetch('/api/prediction', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'verify',
                userAddress,
                predictionId: activeId,      // ← send this instead of timestamp
                newPrice: priceData.price
              })
            });
            
            console.log('Verify response status:', verifyResponse.status);
            
            if (!verifyResponse.ok) {
              const errorData = await verifyResponse.json();
              console.error('Verification API error:', errorData);
              console.log('⚠️ API verification failed, using client-side verification');
              useClientSideVerification = true;
            } else {
              verifyResult = await verifyResponse.json();
              
              // Ensure all required fields exist
              if (!verifyResult.success) {
                console.log('⚠️ API returned unsuccessful, using client-side verification');
                useClientSideVerification = true;
              }
            }
          } catch (apiError) {
            console.error('API verification error:', apiError);
            console.log('⚠️ API error, using client-side verification');
            useClientSideVerification = true;
          }
          
          // Clean up localStorage after verification attempt
          localStorage.removeItem('activePredictionId');
          localStorage.removeItem('predictionExpiresAt');
          // Fallback to client-side verification
          if (useClientSideVerification) {
            const priceChange = priceData.price - predictionResult.startPrice;
            const predictedUp = predictionResult.prediction === 'up';
            const actuallyWentUp = priceChange > 0;
            const correct = predictedUp === actuallyWentUp;
            const multiplier = correct ? 2 : 0.5;
            
            console.log('Client-side verification:', {
              startPrice: predictionResult.startPrice,
              endPrice: priceData.price,
              priceChange,
              predictedUp,
              actuallyWentUp,
              correct,
              multiplier
            });
            
            verifyResult = {
              success: true,
              correct,
              prediction: predictionResult.prediction,
              startPrice: predictionResult.startPrice,
              endPrice: priceData.price,
              priceChange: priceChange.toFixed(4),
              priceChangePercent: ((priceChange / predictionResult.startPrice) * 100).toFixed(2),
              multiplier,
              stats: userStats || {
                totalPredictions: 0,
                correctPredictions: 0,
                currentStreak: 0,
                bestStreak: 0,
                winRate: 0
              }
            };
          } else if (verifyResult && !verifyResult.stats) {
            verifyResult.stats = userStats || {
              totalPredictions: 0,
              correctPredictions: 0,
              currentStreak: 0,
              bestStreak: 0,
              winRate: 0
            };
          }
          
          const multiplier = verifyResult.multiplier || 1;
          
          console.log('Prediction verification result:', verifyResult);
          
          if (verifyResult.correct) {
            setStatus('🎯 Correct prediction! Claiming 2x airdrop...', 'success');
          } else {
            setStatus('🎲 Wrong prediction. Claiming 0.5x consolation airdrop...', 'info');
          }
          
          // Claim airdrop with verified multiplier
          const airdropResult = await claimAirdrop(actualTokenId, hash, multiplier);
          
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
              showPredictionResultPopup(verifyResult, airdropResult);
            }, 2000);
          } else {
            console.log('Popup not shown - missing data:', { airdropResult, verifyResult });
          }
          
        } catch (error) {
          console.error('Prediction verification failed:', error);
          // Fallback to standard airdrop if verification fails
          setStatus('⚠️ Verification failed. Sending standard airdrop...', 'warning');
          await claimAirdrop(actualTokenId, hash, 1);
        }
      }, safeDelay);
    }

  } catch (e) {
    const errorMsg = getImprovedErrorMessage(e);
    setStatus(errorMsg, "error");
    console.error('Mint Error:', e);
    
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
    nftActions.classList.add('hidden');
    sessionStorage.removeItem('lastMintedTokenId');
    lastMintedTokenId = null;
    lastAirdropAmount = null;
    lastMintedInfo = { tokenId: null, txHash: null, rarity: null, price: null };
  } finally {
    if (mintBtn.innerText !== "SOLD OUT") {
      mintBtn.disabled = false;
      const celoPrice = Number(mintPriceWei) / 1e18;
      mintBtn.innerText = mintPriceWei > 0n ? `MINT (${celoPrice.toFixed(4)} CELO)` : 'MINT';
    }
  }
});

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

downloadSVG.addEventListener('click', downloadSVGFile);
downloadGIF.addEventListener('click', downloadPNGFile);
giftBtn.addEventListener('click', showGiftModal);

const copyImageBtn = document.getElementById('copyImageBtn');
if (copyImageBtn) {
  copyImageBtn.addEventListener('click', copyImageToClipboard);
}

const twitterBtn = document.getElementById('twitterBtn');
if (twitterBtn) {
  twitterBtn.addEventListener('click', shareToTwitter);
}

// ===== RECENT MINTS FEED =====

let recentMintsInterval = null;

async function fetchRecentMints(limit = 5) {
  try {
    if (!contractDetails || !wagmiConfig) {
      console.log('Contract details or wagmi config not ready');
      return [];
    }
    
    const totalSupply = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'totalSupply'
    });
    
    const total = Number(totalSupply);
    if (total === 0) return [];
    
    const start = Math.max(1, total - limit + 1);
    const mints = [];
    
    // Batch all requests together for better performance
    const tokenIds = [];
    for (let i = total; i >= start; i--) {
      tokenIds.push(i);
    }
    
    const promises = tokenIds.map(tokenId => 
      Promise.all([
        readContract(wagmiConfig, {
          address: contractDetails.address,
          abi: contractDetails.abi,
          functionName: 'ownerOf',
          args: [BigInt(tokenId)]
        }),
        readContract(wagmiConfig, {
          address: contractDetails.address,
          abi: contractDetails.abi,
          functionName: 'tokenTraits',
          args: [BigInt(tokenId)]
        })
      ]).then(([owner, traits]) => ({
        tokenId,
        owner,
        traits
      })).catch(e => {
        console.log(`Failed to fetch token #${tokenId}:`, e.message);
        return null;
      })
    );
    
    const results = await Promise.all(promises);
    
    const rarityLabels = ['Common', 'Rare', 'Legendary', 'Mythic'];
    const rarityColors = ['#9ca3af', '#3b82f6', '#f59e0b', '#ec4899'];
    
    results.forEach(result => {
      if (result) {
        const rarity = Number(result.traits[1]);
        mints.push({
          tokenId: result.tokenId,
          owner: result.owner,
          ownerShort: `${result.owner.slice(0, 6)}...${result.owner.slice(-4)}`,
          rarity: rarityLabels[rarity] || 'Common',
          rarityColor: rarityColors[rarity] || '#9ca3af',
          timestamp: Number(result.traits[2]) * 1000
        });
      }
    });
    
    return mints;
  } catch (e) {
    console.error('Failed to fetch recent mints:', e);
    return [];
  }
}

function renderRecentMints(mints) {
  const container = document.getElementById('recentMintsContainer');
  if (!container) return;
  
  if (mints.length === 0) {
    if (!contractDetails) {
      container.innerHTML = '<div class="empty-state">Loading... ⏳</div>';
    } else {
      container.innerHTML = '<div class="empty-state">No mints yet. Be the first! 🚀</div>';
    }
    return;
  }
  
  const now = Date.now();
  
  container.innerHTML = mints.map(mint => {
    const timeAgo = getTimeAgo(now - mint.timestamp);
    const isYours = userAddress && mint.owner.toLowerCase() === userAddress.toLowerCase();
    
    return `
      <div class="mint-item ${isYours ? 'your-mint' : ''}" style="animation: slideIn 0.3s ease-out;">
        <div class="mint-info">
          <span class="token-id">#${mint.tokenId}</span>
          <span class="rarity-badge" style="color: ${mint.rarityColor}; border-color: ${mint.rarityColor};">
            ${mint.rarity}
          </span>
        </div>
        <div class="mint-meta">
          <span class="owner">${isYours ? 'You' : mint.ownerShort}</span>
          <span class="time">${timeAgo}</span>
        </div>
      </div>
    `;
  }).join('');
}

function getTimeAgo(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function startRecentMintsPolling() {
  if (recentMintsInterval) return;
  
  const updateFeed = async () => {
    if (!contractDetails || !wagmiConfig) {
      console.log('Waiting for contract initialization...');
      return;
    }
    const mints = await fetchRecentMints(5);
    renderRecentMints(mints);
  };
  
  // Initial load with delay to ensure contract is ready
  setTimeout(updateFeed, 1000);
  recentMintsInterval = setInterval(updateFeed, 15000); // Update every 15s
}

function stopRecentMintsPolling() {
  if (recentMintsInterval) {
    clearInterval(recentMintsInterval);
    recentMintsInterval = null;
  }
}

// Start polling when page loads
document.addEventListener('DOMContentLoaded', () => {
  startRecentMintsPolling();
});

// Stop polling when page unloads
window.addEventListener('beforeunload', () => {
  stopRecentMintsPolling();
});

// ===== LEADERBOARD SYSTEM =====
let leaderboardCache = null;
let leaderboardLastFetch = 0;
const LEADERBOARD_CACHE_TTL = 120000; // 2 minutes (matches polling interval)

async function fetchLeaderboard() {
  try {
    // Return cached data if fresh
    const now = Date.now();
    if (leaderboardCache && (now - leaderboardLastFetch) < LEADERBOARD_CACHE_TTL) {
      return leaderboardCache;
    }
    
    if (!contractDetails || !wagmiConfig) {
      console.log('Contract details or wagmi config not ready for leaderboard');
      return [];
    }
    
    console.log('Fetching leaderboard data from Celoscan API...');
    
    // Use Celoscan API proxy to get all NFT transfers (keeps API key secure)
    const apiUrl = `/api/celoscan?module=account&action=tokennfttx&contractaddress=${contractDetails.address}&page=1&offset=10000&sort=desc`;
    
    try {
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      if (data.status === '1' && data.result && Array.isArray(data.result)) {
        console.log(`Celoscan API returned ${data.result.length} transfer events`);
        
        // Build holder map from transfer events
        const holderMap = new Map();
        const tokenOwners = new Map(); // Track current owner of each token
        
        // Process transfers in chronological order (oldest first)
        const transfers = [...data.result].reverse();
        
        transfers.forEach(tx => {
          const tokenId = tx.tokenID;
          const from = tx.from.toLowerCase();
          const to = tx.to.toLowerCase();
          const zeroAddress = '0x0000000000000000000000000000000000000000';
          
          // Update token ownership
          if (from !== zeroAddress && tokenOwners.get(tokenId) === from) {
            // Remove from previous owner
            holderMap.set(from, (holderMap.get(from) || 1) - 1);
            if (holderMap.get(from) <= 0) holderMap.delete(from);
          }
          
          if (to !== zeroAddress) {
            // Add to new owner
            tokenOwners.set(tokenId, to);
            holderMap.set(to, (holderMap.get(to) || 0) + 1);
          }
        });
        
        console.log(`Found ${holderMap.size} unique holders`);
        
        // Now fetch rarity data for top holders
        const topHolders = Array.from(holderMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15); // Get top 15 to filter down to 10 after rarity fetch
        
        // Fetch rarity data for each holder's tokens
        const holderData = await Promise.all(
          topHolders.map(async ([address, count]) => {
            const rarities = { mythic: 0, legendary: 0, rare: 0, common: 0 };
            
            // Get all tokens owned by this address
            const ownedTokens = [];
            for (const [tokenId, owner] of tokenOwners.entries()) {
              if (owner === address) {
                ownedTokens.push(tokenId);
              }
            }
            
            // Fetch rarity for each token (in batches)
            const rarityPromises = ownedTokens.slice(0, 50).map(tokenId => // Limit to 50 to avoid timeout
              readContract(wagmiConfig, {
                address: contractDetails.address,
                abi: contractDetails.abi,
                functionName: 'tokenTraits',
                args: [BigInt(tokenId)]
              })
              .then(traits => Number(traits[1]))
              .catch(() => 0) // Default to common on error
            );
            
            const rarityValues = await Promise.all(rarityPromises);
            
            rarityValues.forEach(rarity => {
              if (rarity === 3) rarities.mythic++;
              else if (rarity === 2) rarities.legendary++;
              else if (rarity === 1) rarities.rare++;
              else rarities.common++;
            });
            
            return {
              address,
              shortAddress: `${address.slice(0, 6)}...${address.slice(-4)}`,
              count,
              rarities
            };
          })
        );
        
        // Final sort with rarity tiebreakers
        const leaderboard = holderData
          .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            if (b.rarities.mythic !== a.rarities.mythic) return b.rarities.mythic - a.rarities.mythic;
            return b.rarities.legendary - a.rarities.legendary;
          })
          .slice(0, 10);
        
        leaderboardCache = leaderboard;
        leaderboardLastFetch = now;
        
        console.log(`Leaderboard updated: ${leaderboard.length} collectors`);
        return leaderboard;
        
      } else {
        console.warn('Celoscan API returned no data, falling back to blockchain scan');
        return await fetchLeaderboardFromBlockchain();
      }
    } catch (apiError) {
      console.warn('Celoscan API failed, falling back to blockchain scan:', apiError);
      return await fetchLeaderboardFromBlockchain();
    }
    
  } catch (e) {
    console.error('Leaderboard fetch error:', e);
    return [];
  }
}

// Fallback method: scan blockchain directly
async function fetchLeaderboardFromBlockchain() {
  try {
    if (!contractDetails || !wagmiConfig) return [];
    
    const totalSupply = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'totalSupply'
    });
    
    const total = Number(totalSupply);
    if (total === 0) return [];
    
    console.log(`Scanning all ${total} tokens from blockchain...`);
    
    const holderMap = new Map();
    const rarityMap = new Map();
    
    // Process ALL tokens, not just last 200
    const chunkSize = 20;
    const totalChunks = Math.ceil(total / chunkSize);
    
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize + 1;
      const end = Math.min((chunkIndex + 1) * chunkSize, total);
      
      const tokenIds = [];
      for (let i = start; i <= end; i++) {
        tokenIds.push(i);
      }
      
      const promises = tokenIds.map(tokenId =>
        Promise.all([
          readContract(wagmiConfig, {
            address: contractDetails.address,
            abi: contractDetails.abi,
            functionName: 'ownerOf',
            args: [BigInt(tokenId)]
          }),
          readContract(wagmiConfig, {
            address: contractDetails.address,
            abi: contractDetails.abi,
            functionName: 'tokenTraits',
            args: [BigInt(tokenId)]
          })
        ]).then(([owner, traits]) => ({ owner, rarity: Number(traits[1]) }))
        .catch(e => {
          console.log(`Token ${tokenId} fetch failed:`, e.message);
          return null;
        })
      );
      
      const results = await Promise.all(promises);
      
      results.forEach(result => {
        if (result && result.owner) {
          const { owner, rarity } = result;
          const ownerLower = owner.toLowerCase();
          
          holderMap.set(ownerLower, (holderMap.get(ownerLower) || 0) + 1);
          
          if (!rarityMap.has(ownerLower)) {
            rarityMap.set(ownerLower, { mythic: 0, legendary: 0, rare: 0, common: 0 });
          }
          const rarities = rarityMap.get(ownerLower);
          if (rarity === 3) rarities.mythic++;
          else if (rarity === 2) rarities.legendary++;
          else if (rarity === 1) rarities.rare++;
          else rarities.common++;
        }
      });
      
      console.log(`Processed chunk ${chunkIndex + 1}/${totalChunks}`);
    }
    
    const leaderboard = Array.from(holderMap.entries())
      .map(([address, count]) => ({
        address,
        shortAddress: `${address.slice(0, 6)}...${address.slice(-4)}`,
        count,
        rarities: rarityMap.get(address) || { mythic: 0, legendary: 0, rare: 0, common: 0 }
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        if (b.rarities.mythic !== a.rarities.mythic) return b.rarities.mythic - a.rarities.mythic;
        return b.rarities.legendary - a.rarities.legendary;
      })
      .slice(0, 10);
    
    console.log(`Blockchain scan complete: ${leaderboard.length} collectors`);
    return leaderboard;
    
  } catch (e) {
    console.error('Blockchain scan error:', e);
    return [];
  }
}

function renderLeaderboard(leaderboard) {
  const container = document.getElementById('leaderboardContainer');
  if (!container) return;
  
  if (leaderboard.length === 0) {
    container.innerHTML = '<div class="empty-state">No data yet. Be the first collector! 🎯</div>';
    return;
  }
  
  const medals = ['🥇', '🥈', '🥉'];
  
  container.innerHTML = leaderboard.map((holder, index) => {
    const rank = index + 1;
    const medal = medals[index] || `#${rank}`;
    const isYou = userAddress && holder.address === userAddress.toLowerCase();
    
    return `
      <div class="leaderboard-item ${isYou ? 'your-rank' : ''}" style="animation: slideUp ${0.1 * (index + 1)}s ease-out;">
        <div class="rank-badge">${medal}</div>
        <div class="holder-info">
          <div class="holder-address">${isYou ? '👑 You' : holder.shortAddress}</div>
          <div class="holder-rarities">
            ${holder.rarities.mythic > 0 ? `<span class="rarity-count mythic" title="Mythic">${holder.rarities.mythic}M</span>` : ''}
            ${holder.rarities.legendary > 0 ? `<span class="rarity-count legendary" title="Legendary">${holder.rarities.legendary}L</span>` : ''}
            ${holder.rarities.rare > 0 ? `<span class="rarity-count rare" title="Rare">${holder.rarities.rare}R</span>` : ''}
          </div>
        </div>
        <div class="holder-count">${holder.count} NFTs</div>
      </div>
    `;
  }).join('');
}

async function updateLeaderboard() {
  const leaderboard = await fetchLeaderboard();
  renderLeaderboard(leaderboard);
}

// Auto-refresh leaderboard every 2 minutes
let leaderboardInterval = null;

function startLeaderboardPolling() {
  if (leaderboardInterval) return;
  
  // Initial load with delay to ensure contract is ready
  setTimeout(() => {
    updateLeaderboard();
  }, 2000);
  
  leaderboardInterval = setInterval(updateLeaderboard, 120000); // Every 2 minutes
}

function stopLeaderboardPolling() {
  if (leaderboardInterval) {
    clearInterval(leaderboardInterval);
    leaderboardInterval = null;
  }
}

// Start on page load
document.addEventListener('DOMContentLoaded', () => {
  startLeaderboardPolling();
});

window.addEventListener('beforeunload', () => {
  stopLeaderboardPolling();
});

// ===== WALLET BALANCE DISPLAY =====
let celoPrice = 0;

async function updateWalletBalance() {
  const balanceBox = document.getElementById('walletBalanceBox');
  const celoBalanceEl = document.getElementById('celoBalance');
  const celoBalanceUSDEl = document.getElementById('celoBalanceUSD');
  
  if (!userAddress || !balanceBox || !wagmiConfig) return;
  
  try {
    // Get CELO balance
    // --- FIX 2: Use getBalance from wagmi/core, not non-existent publicClient ---
    const balanceData = await getBalance(wagmiConfig, {
      address: userAddress,
      chainId: celo.id // Explicitly check balance on Celo
    });
    const balance = balanceData.value; // getBalance returns an object, we need the .value
    // --- END FIX ---
    
    const balanceInCelo = Number(balance) / 1e18;
    celoBalanceEl.textContent = balanceInCelo.toFixed(4) + ' CELO';
    
    // Get CELO price if not already fetched
    if (celoPrice === 0) {
      try {
        const priceData = await fetchCeloPrice();
        celoPrice = priceData.price; // Extract price from object
      } catch (e) {
        console.log('Could not fetch CELO price for USD conversion');
      }
    }
    
    // Calculate USD value
    const usdValue = balanceInCelo * celoPrice;
    celoBalanceUSDEl.textContent = `≈ $${usdValue.toFixed(2)} USD`;
    
    balanceBox.classList.remove('hidden');
  } catch (e) {
    console.error('Failed to fetch wallet balance:', e);
  }
}

// ===== TAB NAVIGATION =====
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

function switchTab(tabName) {
  // Update buttons
  tabButtons.forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Update content
  tabContents.forEach(content => {
    if (content.id === tabName + 'Tab') {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
  
  // Show/hide sections based on tab
  const recentSection = document.getElementById('recentMintsSection');
  const leaderboardSection = document.getElementById('leaderboardSection');
  const achievementsSection = document.getElementById('achievementsSection');
  
  if (tabName === 'gallery') {
    // Hide all three sections in gallery tab
    if (recentSection) recentSection.style.display = 'none';
    if (leaderboardSection) leaderboardSection.style.display = 'none';
    if (achievementsSection) achievementsSection.style.display = 'none';
  } else {
    // Show only recent mints by default in mint tab
    if (recentSection) recentSection.style.display = 'block';
    if (leaderboardSection) leaderboardSection.style.display = 'none';
    if (achievementsSection) achievementsSection.style.display = 'none';
    
    // Reset toggle buttons to show only Recent active
    const recentBtn = document.getElementById('toggleRecentBtn');
    const leaderboardBtn = document.getElementById('toggleLeaderboardBtn');
    const achievementsBtn = document.getElementById('toggleAchievementsBtn');
    
    if (recentBtn) recentBtn.classList.add('active');
    if (leaderboardBtn) leaderboardBtn.classList.remove('active');
    if (achievementsBtn) achievementsBtn.classList.remove('active');
  }
  
  // Load content based on tab
  if (tabName === 'gallery') {
    loadGallery();
  }
}

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
  });
});

// ===== SECTION TOGGLE BUTTONS =====
const toggleButtons = document.querySelectorAll('.toggle-btn');

toggleButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const section = btn.dataset.section;
    
    // Remove active from all buttons
    toggleButtons.forEach(b => b.classList.remove('active'));
    // Add active to clicked button
    btn.classList.add('active');
    
    // Hide all sections
    const recentSection = document.getElementById('recentMintsSection');
    const leaderboardSection = document.getElementById('leaderboardSection');
    const achievementsSection = document.getElementById('achievementsSection');
    
    if (recentSection) recentSection.style.display = 'none';
    if (leaderboardSection) leaderboardSection.style.display = 'none';
    if (achievementsSection) achievementsSection.style.display = 'none';
    
    // Show selected section
    if (section === 'recent' && recentSection) {
      recentSection.style.display = 'block';
    } else if (section === 'leaderboard' && leaderboardSection) {
      leaderboardSection.style.display = 'block';
    } else if (section === 'achievements' && achievementsSection) {
      achievementsSection.style.display = 'block';
      loadAchievementsBottom();
    }
  });
});

// ===== GALLERY SYSTEM =====
let userNFTs = [];

async function loadGallery() {
  const galleryGrid = document.getElementById('galleryGrid');
  
  if (!userAddress || !contractDetails) {
    galleryGrid.innerHTML = '<div class="empty-state">Connect wallet to view your NFTs</div>';
    return;
  }
  
  galleryGrid.innerHTML = '<div class="empty-state">Loading your NFTs... ⏳</div>';
  
  try {
    // Get user's NFT count
    const balance = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'balanceOf',
      args: [userAddress]
    });
    
    const nftCount = Number(balance);
    
    if (nftCount === 0) {
      galleryGrid.innerHTML = '<div class="empty-state">You don\'t own any NFTs yet. Mint your first one! 🎨</div>';
      return;
    }
    
    // Get total supply to scan
    const totalSupply = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'totalSupply'
    });
    
    const total = Number(totalSupply);
    userNFTs = [];
    
    // Scan for user's NFTs
    const promises = [];
    for (let i = 1; i <= total && userNFTs.length < nftCount; i++) {
      promises.push(
        readContract(wagmiConfig, {
          address: contractDetails.address,
          abi: contractDetails.abi,
          functionName: 'ownerOf',
          args: [BigInt(i)]
        }).then(owner => {
          if (owner.toLowerCase() === userAddress.toLowerCase()) {
            return readContract(wagmiConfig, {
              address: contractDetails.address,
              abi: contractDetails.abi,
              functionName: 'tokenTraits',
              args: [BigInt(i)]
            }).then(traits => ({
              tokenId: i,
              owner,
              rarity: Number(traits[1]),
              timestamp: Number(traits[2])
            }));
          }
          return null;
        }).catch(() => null)
      );
    }
    
    const results = await Promise.all(promises);
    userNFTs = results.filter(nft => nft !== null);
    
    renderGallery(userNFTs);
  } catch (e) {
    console.error('Failed to load gallery:', e);
    galleryGrid.innerHTML = '<div class="empty-state">Failed to load NFTs. Please try again.</div>';
  }
}

function renderGallery(nfts) {
  const galleryGrid = document.getElementById('galleryGrid');
  const rarityFilter = document.getElementById('rarityFilter').value;
  const sortFilter = document.getElementById('sortFilter').value;
  
  // Filter by rarity
  let filtered = nfts;
  if (rarityFilter !== 'all') {
    const rarityMap = { 'common': 0, 'rare': 1, 'legendary': 2, 'mythic': 3 };
    filtered = nfts.filter(nft => nft.rarity === rarityMap[rarityFilter]);
  }
  
  // Sort
  filtered.sort((a, b) => {
    if (sortFilter === 'newest') return b.timestamp - a.timestamp;
    if (sortFilter === 'oldest') return a.timestamp - b.timestamp;
    if (sortFilter === 'rarity') return b.rarity - a.rarity;
    if (sortFilter === 'tokenId') return a.tokenId - b.tokenId;
    return 0;
  });
  
  if (filtered.length === 0) {
    galleryGrid.innerHTML = '<div class="empty-state">No NFTs match your filters</div>';
    return;
  }
  
  const rarityLabels = ['Common', 'Rare', 'Legendary', 'Mythic'];
  const rarityColors = ['#9ca3af', '#3b82f6', '#f59e0b', '#ec4899'];
  
  galleryGrid.innerHTML = filtered.map(nft => `
    <div class="gallery-item" onclick="viewNFTDetails(${nft.tokenId})">
      <div class="gallery-item-image">
        <div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: #000; color: #49dfb5; font-size: 2rem;">
          #${nft.tokenId}
        </div>
      </div>
      <div class="gallery-item-info">
        <div class="gallery-token-id">#${nft.tokenId}</div>
        <div class="gallery-rarity" style="color: ${rarityColors[nft.rarity]}; border: 1px solid ${rarityColors[nft.rarity]};">
          ${rarityLabels[nft.rarity]}
        </div>
      </div>
    </div>
  `).join('');
}

function viewNFTDetails(tokenId) {
  // Switch to mint tab and preview this NFT
  switchTab('mint');
  lastMintedTokenId = tokenId;
  previewNft(tokenId);
}

// Add filter listeners
document.getElementById('rarityFilter')?.addEventListener('change', () => {
  renderGallery(userNFTs);
});

document.getElementById('sortFilter')?.addEventListener('change', () => {
  renderGallery(userNFTs);
});

// ===== ACHIEVEMENTS SYSTEM =====
const achievements = [
  {
    id: 'first_mint',
    icon: '🎯',
    title: 'First Steps',
    description: 'Mint your first CELO NFT',
    check: () => userMintCount >= 1
  },
  {
    id: 'five_mints',
    icon: '🔥',
    title: 'Getting Started',
    description: 'Mint 5 NFTs',
    check: () => userMintCount >= 5
  },
  {
    id: 'ten_mints',
    icon: '💎',
    title: 'Collector',
    description: 'Mint 10 NFTs',
    check: () => userMintCount >= 10
  },
  {
    id: 'rare_pull',
    icon: '💙',
    title: 'Rare Find',
    description: 'Own a Rare NFT',
    check: () => userNFTs.some(nft => nft.rarity >= 1)
  },
  {
    id: 'legendary_pull',
    icon: '⭐',
    title: 'Legendary!',
    description: 'Own a Legendary NFT',
    check: () => userNFTs.some(nft => nft.rarity >= 2)
  },
  {
    id: 'mythic_pull',
    icon: '👑',
    title: 'Mythic Master',
    description: 'Own a Mythic NFT',
    check: () => userNFTs.some(nft => nft.rarity === 3)
  },
  {
    id: 'early_adopter',
    icon: '🚀',
    title: 'Early Adopter',
    description: 'Minted in the first 100',
    check: () => userNFTs.some(nft => nft.tokenId <= 100)
  },
  {
    id: 'lucky_token',
    icon: '🍀',
    title: 'Lucky Number',
    description: 'Own a lucky token (77, 111, 222, etc.)',
    check: () => {
      const luckyNumbers = [77, 111, 222, 333, 444, 555, 666, 777, 888, 999];
      return userNFTs.some(nft => luckyNumbers.includes(nft.tokenId));
    }
  },
  {
    id: 'milestone_token',
    icon: '🎯',
    title: 'Milestone Collector',
    description: 'Own a milestone token (100, 250, 500, 1000)',
    check: () => {
      const milestones = [100, 250, 500, 1000, 2500, 5000];
      return userNFTs.some(nft => milestones.includes(nft.tokenId));
    }
  },
  {
    id: 'top_collector',
    icon: '🏆',
    title: 'Top Collector',
    description: 'Be in the top 10 leaderboard',
    check: () => {
      // This would need leaderboard data
      return userMintCount >= 20;
    }
  }
];

// Load achievements in bottom section
async function loadAchievementsBottom() {
  const achievementsGrid = document.getElementById('achievementsGrid2');
  const achievementCount = document.getElementById('achievementCount2');
  const totalAchievements = document.getElementById('totalAchievements2');
  
  if (!achievementsGrid) return;
  
  // Ensure userNFTs are loaded for accurate achievement checking
  if (userNFTs.length === 0 && userAddress && contractDetails) {
    try {
      const balance = await readContract(wagmiConfig, {
        address: contractDetails.address,
        abi: contractDetails.abi,
        functionName: 'balanceOf',
        args: [userAddress]
      });
      
      const nftCount = Number(balance);
      
      if (nftCount > 0) {
        const totalSupply = await readContract(wagmiConfig, {
          address: contractDetails.address,
          abi: contractDetails.abi,
          functionName: 'totalSupply'
        });
        
        const total = Number(totalSupply);
        const promises = [];
        
        for (let i = 1; i <= total; i++) {
          promises.push(
            readContract(wagmiConfig, {
              address: contractDetails.address,
              abi: contractDetails.abi,
              functionName: 'ownerOf',
              args: [BigInt(i)]
            }).then(owner => {
              if (owner.toLowerCase() === userAddress.toLowerCase()) {
                return readContract(wagmiConfig, {
                  address: contractDetails.address,
                  abi: contractDetails.abi,
                  functionName: 'tokenTraits',
                  args: [BigInt(i)]
                }).then(traits => ({
                  tokenId: i,
                  owner,
                  rarity: Number(traits[1]),
                  timestamp: Number(traits[2])
                }));
              }
              return null;
            }).catch(() => null)
          );
        }
        
        const results = await Promise.all(promises);
        userNFTs = results.filter(nft => nft !== null);
      }
    } catch (e) {
      console.error('Failed to load NFTs for achievements:', e);
    }
  }
  
  let unlockedCount = 0;
  
  const html = achievements.map(achievement => {
    const unlocked = achievement.check();
    if (unlocked) unlockedCount++;
    
    return `
      <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
        <div class="achievement-icon">${achievement.icon}</div>
        <div class="achievement-title">${achievement.title}</div>
        <div class="achievement-description">${achievement.description}</div>
        ${unlocked ? '<div class="achievement-reward">✅ Unlocked!</div>' : '<div class="achievement-reward" style="color: #6b7280;">🔒 Locked</div>'}
      </div>
    `;
  }).join('');
  
  achievementsGrid.innerHTML = html;
  if (achievementCount) achievementCount.textContent = unlockedCount;
  if (totalAchievements) totalAchievements.textContent = achievements.length;
  
  // Save achievements to localStorage
  safeLocalStorage.setItem('achievements', JSON.stringify({
    unlocked: unlockedCount,
    total: achievements.length,
    timestamp: Date.now()
  }));
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
