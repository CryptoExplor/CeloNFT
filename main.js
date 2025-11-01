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

// Configuration
const MAX_SUPPLY_FUNCTION_NAME = 'maxSupply';
const PROJECT_ID = 'e0dd881bad824ac3418617434a79f917';

// DOM Elements
const statusBox = document.getElementById('statusBox');
const supplyBox = document.getElementById('totalSupply');
const mintBtn = document.getElementById('mintBtn');
const previewBtn = document.getElementById('previewBtn');
const connectBtn = document.getElementById('connectBtn');
const userAddrBox = document.getElementById('userAddressBox');
const previewContainer = document.getElementById('nft-preview-container');
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

// Helper Functions
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

function showAddress(addr) {
  const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  userAddrBox.textContent = `Your address: ${shortAddr}`;
  userAddrBox.classList.remove('hidden');
  connectBtn.classList.add('hidden');
  mintBtn.classList.remove('hidden');
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
  if (initialLoad) {
    supplyBox.innerHTML = '<span class="spinner"></span> Loading supply...';
  }

  try {
    if (!initialLoad) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const total = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'totalSupply'
    });

    const totalNumber = Number(total);

    if (MAX_SUPPLY > 0) {
      supplyBox.textContent = `Minted: ${totalNumber}/${MAX_SUPPLY}`;

      if (totalNumber >= MAX_SUPPLY) {
        mintBtn.disabled = true;
        mintBtn.innerText = "SOLD OUT";
        mintBtn.title = "The maximum supply has been reached.";
        supplyBox.className = "status-box status-error";
        
        if (!initialLoad) {
          setStatus(`All ${MAX_SUPPLY} NFTs have been minted!`, "warning");
        }
      } else if (!initialLoad) {
        mintBtn.disabled = false;
        const celoPrice = Number(mintPriceWei) / 1e18;
        mintBtn.innerText = mintPriceWei > 0n ? `MINT (${celoPrice.toFixed(4)} CELO)` : 'MINT';
        mintBtn.title = '';
        supplyBox.className = "status-box status-warning";
      }
    } else {
      supplyBox.textContent = `Total Minted: ${totalNumber}`;
      supplyBox.className = "status-box status-info";
      
      if (!initialLoad) {
        mintBtn.disabled = false;
        const celoPrice = Number(mintPriceWei) / 1e18;
        mintBtn.innerText = mintPriceWei > 0n ? `MINT (${celoPrice.toFixed(4)} CELO)` : 'MINT';
      }
    }

    return total;
  } catch (e) {
    supplyBox.textContent = "Total Minted: N/A";
    console.error('Error updating supply:', e);
    return 0;
  }
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

    const buttonLabel = `Preview NFT #${tokenId} (${rarityText} / $${priceText})`;
    previewBtn.innerText = buttonLabel;

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

    // Check if running in Farcaster environment
    try {
      if (typeof sdk !== 'undefined' && sdk.context) {
        isFarcasterEnvironment = true;
        console.log('Running in Farcaster environment');
      }
    } catch (e) {
      console.log('Not in Farcaster environment:', e);
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

    // Load contract details
    try {
      const response = await fetch('./contract.json');
      contractDetails = await response.json();
      contractAddress = contractDetails.address;
      console.log('Contract loaded:', contractAddress);
    } catch (e) { 
      setStatus("Missing contract details. Ensure 'contract.json' is deployed.", 'error'); 
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
        supplyBox.textContent = 'Connect wallet to see supply';
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
    setStatus("Mint Successful! ", "success");
    
    if (contractAddress) {
      const celoscanTokenUrl = `https://celoscan.io/token/${contractAddress}?a=${nextTokenId}`;
      const celoscanTxUrl = `https://celoscan.io/tx/${hash}`;

      const txLink = document.createElement('a');
      txLink.href = celoscanTxUrl;
      txLink.target = '_blank';
      txLink.rel = 'noopener noreferrer';
      txLink.textContent = 'View Tx';
      txLink.style.cssText = 'color:#fff;text-decoration:underline;margin-left:8px;';

      const tokenLink = document.createElement('a');
      tokenLink.href = celoscanTokenUrl;
      tokenLink.target = '_blank';
      tokenLink.rel = 'noopener noreferrer';
      tokenLink.textContent = 'View on Celoscan';
      tokenLink.style.cssText = 'color:#fff;text-decoration:underline;margin-left:8px;';

      statusBox.appendChild(txLink);
      statusBox.insertAdjacentText('beforeend', ' | ');
      statusBox.appendChild(tokenLink);
    }

    lastMintedTokenId = nextTokenId;

    await updateSupply();
    previewBtn.classList.remove('hidden');
    previewBtn.innerText = `Preview NFT #${nextTokenId}`;
    await previewNft(lastMintedTokenId);

  } catch (e) {
    let errorMsg = e.shortMessage || "Mint failed.";
    
    if (e.message && (e.message.includes("Invalid parameters were provided to the RPC method") || e.message.includes("RPC"))) {
      errorMsg = "Mint failed due to a connection error. Please reload/refresh the miniapp and try again.";
    } else if (e.message && e.message.includes("User rejected")) {
      errorMsg = "Transaction was rejected.";
    } else if (!e.shortMessage) {
      errorMsg = "Mint failed. This may be caused by a stale connection. Please reload/refresh the miniapp and try again.";
    }
    
    setStatus(errorMsg, "error");
    console.error('Mint Error:', e);
    
    previewBtn.classList.add('hidden');
    previewContainer.classList.add('hidden');
    previewContainer.classList.remove('sparkles', ...ALL_RARITY_CLASSES);
    sessionStorage.removeItem('lastMintedTokenId');
    lastMintedTokenId = null;
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
