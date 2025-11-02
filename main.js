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

// Farcaster detection - FIXED VERSION
async function isFarcasterEmbed() {
  // Critical checks in priority order:
  
  // 1. Must be in an iframe (Farcaster apps run in iframes)
  const isIframe = window.self !== window.top;
  
  // 2. SDK must exist
  const hasSDK = typeof sdk !== 'undefined';
  
  // 3. MOST IMPORTANT: Check if SDK is actually ready (only true inside Farcaster)
  let isSdkReady = false;
  if (hasSDK) {
    try {
      // Wait briefly for SDK to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      isSdkReady = sdk.context !== undefined && sdk.context !== null;
    } catch (e) {
      isSdkReady = false;
    }
  }
  
  const checks = {
    isIframe,
    hasSDK,
    isSdkReady,
    hasValidContext: hasSDK && sdk.context?.user?.fid !== undefined
  };

  console.log('Farcaster Detection Checks:', checks);
  
  // Only return true if we're in iframe AND SDK is properly initialized with context
  return isIframe && hasSDK && isSdkReady;
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
    
    // Auto-load last minted NFT if user has any
    if (userMintCount > 0 && !lastMintedTokenId) {
      loadLastMintedNFT();
    }
  }).catch(err => {
    console.error('Error fetching user balance:', err);
    const history = JSON.parse(sessionStorage.getItem('mintHistory') || '[]');
    const userMints = history.filter(m => m.address === userAddress);
    userMintCount = userMints.length;
    if (yourMintsStat) {
      yourMintsStat.textContent = userMintCount;
    }
  });
}

// Load last minted NFT for connected wallet
async function loadLastMintedNFT() {
  if (!userAddress || !contractDetails) return;
  
  try {
    setStatus('Loading your NFTs... 🔍', 'info');
    
    // Get total supply first
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
    
    // Search backwards from most recent tokens to find user's last mint
    // Check last 50 tokens for performance
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
        // Token might not exist or error, continue
        console.log(`Token ${i} check failed:`, e.message);
      }
    }
    
    if (foundTokenId) {
      lastMintedTokenId = foundTokenId;
      sessionStorage.setItem('lastMintedTokenId', foundTokenId.toString());
      
      previewBtn.innerText = `Preview NFT #${foundTokenId}`;
      previewBtn.classList.remove('hidden');
      
      setStatus(`Found your NFT #${foundTokenId}! 🎉`, 'success');
      
      // Auto-preview after a short delay
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
  const history = JSON.parse(sessionStorage.getItem('mintHistory') || '[]');
  history.unshift({ 
    tokenId, 
    txHash, 
    timestamp: Date.now(), 
    address: userAddress 
  });
  
  if (history.length > 20) history.pop();
  
  sessionStorage.setItem('mintHistory', JSON.stringify(history));
  updateUserMintCount();
}

// Cast to Farcaster
async function castToFarcaster(tokenId, rarity, price) {
  const text = `I just minted CELO NFT #${tokenId} (${rarity}) at ${price}! 🎨✨\n\nMint yours now:`;
  const embedUrl = MINIAPP_URL;
  
  // Check if we're in Farcaster environment with SDK
  if (isFarcasterEnvironment && sdk?.actions?.composeCast) {
    try {
      setStatus('Opening cast composer... 📝', 'info');
      
      const result = await sdk.actions.composeCast({
        text: text,
        embeds: [embedUrl]
      });
      
      if (result?.cast) {
        setStatus(`✅ Cast posted! Hash: ${result.cast.hash.slice(0, 10)}...`, 'success');
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
    // Outside Farcaster - open Warpcast composer in new window
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(embedUrl)}`;
    const popup = window.open(warpcastUrl, '_blank', 'width=600,height=700');
    
    if (popup) {
      setStatus('✅ Opening Warpcast composer...', 'success');
    } else {
      setStatus('⚠️ Please allow popups to share on Warpcast', 'warning');
    }
  }
}

// Download SVG
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
        setStatus('✅ SVG downloaded!', 'success');
        return;
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.log('File picker failed, using fallback:', e);
        }
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
    
    setStatus('✅ SVG downloaded!', 'success');
  } catch (e) {
    console.error('SVG download failed:', e);
    setStatus('Failed to download SVG: ' + e.message, 'error');
  }
}

// Download PNG
async function downloadPNGFile() {
  if (!currentNFTData || !currentNFTData.svg) {
    setStatus('No NFT data available for download', 'error');
    return;
  }
  
  try {
    setStatus('Generating PNG... ⏳', 'info');
    
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      
      const img = new Image();
      const svgBlob = new Blob([currentNFTData.svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      
      img.onload = async () => {
        try {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, 400, 400);
          ctx.drawImage(img, 0, 0, 400, 400);
          URL.revokeObjectURL(url);
          
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
                setStatus('✅ PNG downloaded!', 'success');
                resolve();
                return;
              } catch (e) {
                if (e.name !== 'AbortError') {
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
            
            setStatus('✅ PNG downloaded!', 'success');
            resolve();
          }, 'image/png', 1.0);
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      
      img.onerror = (e) => {
        console.error('Image load failed:', e);
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG image'));
      };
      
      img.src = url;
    });
  } catch (e) {
    console.error('PNG download failed:', e);
    setStatus('Failed to generate PNG: ' + e.message, 'error');
  }
}

// Copy image to clipboard
async function copyImageToClipboard() {
  if (!currentNFTData || !currentNFTData.svg) {
    setStatus('No NFT data available', 'error');
    return;
  }
  
  try {
    setStatus('Copying to clipboard... ⏳', 'info');
    
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    const svgBlob = new Blob([currentNFTData.svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = async () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 400, 400);
      ctx.drawImage(img, 0, 0, 400, 400);
      URL.revokeObjectURL(url);
      
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setStatus('Failed to copy image', 'error');
          return;
        }
        
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
          ]);
          setStatus('✅ Image copied to clipboard!', 'success');
        } catch (e) {
          console.error('Clipboard write failed:', e);
          setStatus('Failed to copy: ' + e.message, 'error');
        }
      }, 'image/png');
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus('Failed to copy image', 'error');
    };
    
    img.src = url;
  } catch (e) {
    console.error('Copy failed:', e);
    setStatus('Failed to copy image', 'error');
  }
}

// Share to Twitter
function shareToTwitter() {
  const text = `I just minted a CELO NFT with live price snapshot! 🎨✨\n\nMint yours:`;
  const appUrl = 'https://celo-nft-phi.vercel.app/';
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(appUrl)}&hashtags=CeloNFT,Celo`;
  
  window.open(twitterUrl, '_blank', 'width=550,height=420');
  setStatus('Opening Twitter...', 'info');
}

// Gift Modal
function showGiftModal() {
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

// Gift NFT
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
    
    const gifts = JSON.parse(sessionStorage.getItem('giftHistory') || '[]');
    gifts.unshift({
      tokenId,
      recipient,
      message,
      timestamp: Date.now(),
      txHash: hash
    });
    sessionStorage.setItem('giftHistory', JSON.stringify(gifts));
    
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
  
  previewBtn.disabled = true;
  previewBtn.innerHTML = '<span class="spinner"></span> Loading Preview…';
  previewContainer.classList.add('hidden');
  previewContainer.innerHTML = '';
  previewContainer.classList.remove("sparkles", ...ALL_RARITY_CLASSES);
  nftActions.classList.add('hidden');
  
  // Don't hide transaction links for new mints
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
    const safeSvg = svgString.replace(/<script.*?>.*?<\/script>/g, '');

    currentNFTData = {
      svg: safeSvg,
      metadata: metadata,
      tokenId: tokenId
    };

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
    
    // Show action buttons
    nftActions.classList.remove('hidden');
    if (nftActionsRow2) nftActionsRow2.classList.remove('hidden');
    
    // Only show Cast button for previously loaded NFTs (not newly minted)
    if (!isNewMint && contractAddress) {
      const celoscanTokenUrl = `https://celoscan.io/token/${contractAddress}?a=${tokenId}`;

      txLinksContainer.innerHTML = `
        <a href="${celoscanTokenUrl}" target="_blank" rel="noopener noreferrer">View on Celoscan</a>
      `;
      
      const castBtnElement = document.createElement('button');
      castBtnElement.id = 'castBtn';
      castBtnElement.className = 'tx-link cast-link';
      castBtnElement.innerHTML = '📣 Cast Minted NFT';
      castBtnElement.onclick = async () => {
        await castToFarcaster(tokenId, rarityText, priceText);
      };
      txLinksContainer.appendChild(castBtnElement);
      
      txLinksContainer.classList.remove('hidden');
    }
    // For new mints, the Cast button is already created by the mint handler

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

// Initialize Farcaster SDK
(async () => {
  try {
    await sdk.actions.ready({ disableNativeGestures: true });
    console.log('Farcaster SDK initialized successfully');
  } catch (e) {
    console.log('Farcaster SDK not available or failed to initialize:', e);
  }
})();

// Setup Wagmi Config
const wagmiAdapter = new WagmiAdapter({
  networks: [celo],
  projectId: PROJECT_ID,
  ssr: false
});

wagmiConfig = wagmiAdapter.wagmiConfig;

// Initialize App
(async () => {
  try {
    lastMintedTokenId = sessionStorage.getItem("lastMintedTokenId");
    if (lastMintedTokenId) {
      previewBtn.innerText = `Preview NFT #${lastMintedTokenId}`;
      previewBtn.classList.remove('hidden');
    }

    // IMPORTANT: Await the detection to ensure proper initialization
    isFarcasterEnvironment = await isFarcasterEmbed();
    
    console.log('=== ENVIRONMENT DETECTION ===');
    console.log('Detected as Farcaster:', isFarcasterEnvironment);
    console.log('Window location:', window.location.href);
    console.log('Is iframe:', window.self !== window.top);
    console.log('Has SDK:', typeof sdk !== 'undefined');
    console.log('SDK Context:', sdk?.context);
    console.log('User Agent:', navigator.userAgent);
    console.log('Referrer:', document.referrer);
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
      setStatus("Missing contract details. Ensure 'contract.json' is in the public folder.", 'error'); 
      console.error('Contract load error:', e); 
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
        
        // Clear previous NFT preview when switching wallets
        previewBtn.classList.add('hidden');
        previewContainer.classList.add('hidden');
        nftActions.classList.add('hidden');
        const nftActionsRow2 = document.getElementById('nftActionsRow2');
        if (nftActionsRow2) nftActionsRow2.classList.add('hidden');
        
        lastMintedTokenId = null;
        sessionStorage.removeItem('lastMintedTokenId');

      } else if (!account.isConnected && userAddress) {
        console.log('Wallet disconnected');
        userAddress = null;
        userAddrBox.classList.add('hidden');
        showConnectButton();
        setStatus('Wallet disconnected. Please connect again.', 'warning');
        mintBtn.disabled = true;
        
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
    nftActions.classList.add('hidden');

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
    
    celebrateMint();
    
    setStatus("🎉 Mint Successful!", "success");
    
    const priceText = (price).toFixed(4);
    lastMintedInfo = { tokenId: nextTokenId, txHash: hash, price: priceText, rarity: null };
    
    // Show transaction links for newly minted NFT
    if (contractAddress) {
      const celoscanTokenUrl = `https://celoscan.io/token/${contractAddress}?a=${nextTokenId}`;

      txLinksContainer.innerHTML = `
        <a href="${celoscanTokenUrl}" target="_blank" rel="noopener noreferrer">View on Celoscan</a>
      `;
      
      const castBtnElement = document.createElement('button');
      castBtnElement.id = 'castBtn';
      castBtnElement.className = 'tx-link cast-link';
      castBtnElement.innerHTML = '📣 Cast';
      castBtnElement.onclick = async () => {
        if (lastMintedInfo.tokenId) {
          await castToFarcaster(
            lastMintedInfo.tokenId, 
            lastMintedInfo.rarity || 'Common', 
            lastMintedInfo.price
          );
        }
      };
      txLinksContainer.appendChild(castBtnElement);
      
      txLinksContainer.classList.remove('hidden');
    }

    lastMintedTokenId = nextTokenId;
    saveMintToHistory(nextTokenId, hash);

    await updateSupply();
    previewBtn.classList.remove('hidden');
    previewBtn.innerText = `Preview NFT #${nextTokenId}`;
    await previewNft(lastMintedTokenId, true); // Pass true for isNewMint
    
    if (currentNFTData && currentNFTData.metadata) {
      const rarityAttr = currentNFTData.metadata.attributes?.find(attr => attr.trait_type === 'Rarity');
      if (rarityAttr) {
        lastMintedInfo.rarity = rarityAttr.value;
      }
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
    lastMintedInfo = { tokenId: null, txHash: null, rarity: null, price: null };
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

// Event Listeners
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
