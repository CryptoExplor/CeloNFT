/**
 * Minting Module
 * Handles NFT minting logic and transaction processing
 * Reusable for any ERC-721 minting dApp
 */

import { writeContract, readContract, waitForTransactionReceipt } from '@wagmi/core';
import confetti from 'canvas-confetti';

export class MintingManager {
  constructor(wagmiConfig, contractDetails) {
    this.wagmiConfig = wagmiConfig;
    this.contractDetails = contractDetails;
    this.maxSupply = 0;
    this.mintPrice = 0n;
  }

  /**
   * Load contract configuration
   */
  async loadContractConfig() {
    try {
      // Read mint price
      const price = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'mintPrice',
      });
      this.mintPrice = BigInt(price);

      // Read max supply (if available)
      try {
        const supply = await readContract(this.wagmiConfig, {
          address: this.contractDetails.address,
          abi: this.contractDetails.abi,
          functionName: 'maxSupply',
        });
        this.maxSupply = Number(supply);
      } catch (error) {
        console.log('No max supply function');
        this.maxSupply = 0;
      }

      return {
        mintPrice: this.mintPrice,
        maxSupply: this.maxSupply,
      };
    } catch (error) {
      console.error('Failed to load contract config:', error);
      throw error;
    }
  }

  /**
   * Get total supply
   */
  async getTotalSupply() {
    try {
      const total = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'totalSupply',
      });
      return Number(total);
    } catch (error) {
      console.error('Failed to get total supply:', error);
      return 0;
    }
  }

  /**
   * Get user's NFT balance
   */
  async getUserBalance(userAddress) {
    try {
      const balance = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'balanceOf',
        args: [userAddress],
      });
      return Number(balance);
    } catch (error) {
      console.error('Failed to get user balance:', error);
      return 0;
    }
  }

  /**
   * Check if supply is exhausted
   */
  async isSoldOut() {
    if (this.maxSupply === 0) return false;
    const total = await this.getTotalSupply();
    return total >= this.maxSupply;
  }

  /**
   * Mint NFT
   * @param {number} priceSnapshot - Current price snapshot to embed in NFT
   * @param {bigint} value - Amount of native currency to send
   * @returns {Object} - Transaction hash and receipt
   */
  async mint(priceSnapshot, value = null) {
    try {
      const hash = await writeContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'mint',
        args: [priceSnapshot],
        value: value || this.mintPrice,
      });

      console.log('Mint transaction submitted:', hash);
      return { hash };
    } catch (error) {
      console.error('Mint transaction failed:', error);
      throw error;
    }
  }

  /**
   * Wait for mint transaction confirmation
   */
  async waitForMint(hash, timeout = 30000) {
    try {
      const receipt = await waitForTransactionReceipt(this.wagmiConfig, {
        hash,
        timeout,
      });

      if (receipt.status === 'reverted') {
        throw new Error('Transaction was reverted');
      }

      return receipt;
    } catch (error) {
      console.error('Transaction wait failed:', error);
      throw error;
    }
  }

  /**
   * Extract token ID from mint receipt
   */
  getTokenIdFromReceipt(receipt) {
    try {
      // Look for Minted event
      const mintedEvent = receipt.logs.find((log) => {
        try {
          // Check if this is a Minted event (has 3 topics for indexed params)
          return log.topics.length >= 2;
        } catch {
          return false;
        }
      });

      if (mintedEvent && mintedEvent.topics[1]) {
        const tokenId = parseInt(mintedEvent.topics[1], 16);
        console.log('Extracted token ID:', tokenId);
        return tokenId;
      }

      // Fallback: try to get from Transfer event
      const transferEvent = receipt.logs.find((log) => log.topics.length === 4);
      if (transferEvent && transferEvent.topics[3]) {
        const tokenId = parseInt(transferEvent.topics[3], 16);
        console.log('Extracted token ID from Transfer:', tokenId);
        return tokenId;
      }

      throw new Error('Could not find token ID in receipt');
    } catch (error) {
      console.error('Failed to extract token ID:', error);
      return null;
    }
  }

  /**
   * Get NFT owner
   */
  async getOwner(tokenId) {
    try {
      const owner = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      });
      return owner;
    } catch (error) {
      console.error('Failed to get owner:', error);
      return null;
    }
  }

  /**
   * Get token traits/metadata
   */
  async getTokenTraits(tokenId) {
    try {
      const traits = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'tokenTraits',
        args: [BigInt(tokenId)],
      });
      return {
        priceSnapshot: Number(traits[0]),
        rarity: Number(traits[1]),
        mintedAt: Number(traits[2]),
      };
    } catch (error) {
      console.error('Failed to get token traits:', error);
      return null;
    }
  }

  /**
   * Get token URI
   */
  async getTokenURI(tokenId) {
    try {
      const uri = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'tokenURI',
        args: [BigInt(tokenId)],
      });
      return uri;
    } catch (error) {
      console.error('Failed to get token URI:', error);
      return null;
    }
  }

  /**
   * Transfer NFT to another address
   */
  async transfer(from, to, tokenId) {
    try {
      const hash = await writeContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'transferFrom',
        args: [from, to, BigInt(tokenId)],
      });

      const receipt = await this.waitForMint(hash);
      return { hash, receipt };
    } catch (error) {
      console.error('Transfer failed:', error);
      throw error;
    }
  }
}

/**
 * Celebration effects
 */
export function celebrateMint(intensity = 'normal') {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#49dfb5', '#7dd3fc', '#fcd34d'],
  });

  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ['#49dfb5', '#7dd3fc'],
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ['#fcd34d', '#f97316'],
    });
  }, 200);

  if (intensity === 'epic') {
    setTimeout(() => {
      confetti({
        particleCount: 200,
        spread: 140,
        origin: { y: 0.6 },
        colors: ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f59e0b'],
      });
    }, 500);
  }
}

/**
 * Error message helper
 */
export function getImprovedErrorMessage(error) {
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

/**
 * Extract token ID from mint receipt
 */
export function getTokenIdFromReceipt(receipt) {
  try {
    // Look for Minted event
    const mintedEvent = receipt.logs.find((log) => {
      try {
        // Check if this is a Minted event (has 3 topics for indexed params)
        return log.topics.length >= 2;
      } catch {
        return false;
      }
    });

    if (mintedEvent && mintedEvent.topics[1]) {
      const tokenId = parseInt(mintedEvent.topics[1], 16);
      console.log('Extracted token ID:', tokenId);
      return tokenId;
    }

    // Fallback: try to get from Transfer event
    const transferEvent = receipt.logs.find((log) => log.topics.length === 4);
    if (transferEvent && transferEvent.topics[3]) {
      const tokenId = parseInt(transferEvent.topics[3], 16);
      console.log('Extracted token ID from Transfer:', tokenId);
      return tokenId;
    }

    throw new Error('Could not find token ID in receipt');
  } catch (error) {
    console.error('Failed to extract token ID:', error);
    return null;
  }
}

/**
 * Load last minted NFT for user
 */
export async function loadLastMintedNFT(wagmiConfig, contractDetails, userAddress) {
  if (!userAddress || !contractDetails) return;

  try {
    const totalSupply = await readContract(wagmiConfig, {
      address: contractDetails.address,
      abi: contractDetails.abi,
      functionName: 'totalSupply'
    });

    const total = Number(totalSupply);
    if (total === 0) return;

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

    return foundTokenId;
  } catch (error) {
    console.error('Failed to load last minted NFT:', error);
    return null;
  }
}



