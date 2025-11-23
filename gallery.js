/**
 * Gallery & Leaderboard Module
 * Handles NFT gallery display and collector leaderboard
 * Reusable for any NFT collection
 */

import { readContract } from '@wagmi/core';
import { apiClient } from './api-client.js';

export class GalleryManager {
  constructor(wagmiConfig, contractDetails) {
    this.wagmiConfig = wagmiConfig;
    this.contractDetails = contractDetails;
    this.userNFTs = [];
    this.leaderboardCache = null;
    this.leaderboardLastFetch = 0;
    this.leaderboardCacheTTL = 120000; // 2 minutes
  }

  /**
   * Load user's NFT gallery with improved error handling and performance
   */
  async loadUserGallery(userAddress) {
    try {
      if (!userAddress || !this.wagmiConfig || !this.contractDetails) {
        console.warn('Missing required parameters for loading gallery');
        return [];
      }

      // Get user's NFT count
      const balance = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'balanceOf',
        args: [userAddress],
      });

      const nftCount = Number(balance);
      if (nftCount === 0) {
        return [];
      }

      // Get total supply to scan
      const totalSupply = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'totalSupply',
      });

      const total = Number(totalSupply);
      this.userNFTs = [];

      // Optimized: Scan from newest to oldest (reverse order) with batch processing
      const batchSize = 20; // Process in batches to avoid overwhelming the RPC
      let tokenId = total;
      
      while (tokenId >= 1 && this.userNFTs.length < nftCount) {
        const batchEnd = Math.max(1, tokenId - batchSize + 1);
        const batchPromises = [];
        
        // Create batch of promises
        for (let i = tokenId; i >= batchEnd && this.userNFTs.length < nftCount; i--) {
          batchPromises.push(
            readContract(this.wagmiConfig, {
              address: this.contractDetails.address,
              abi: this.contractDetails.abi,
              functionName: 'ownerOf',
              args: [BigInt(i)],
            })
              .then((owner) => {
                if (owner.toLowerCase() === userAddress.toLowerCase()) {
                  return readContract(this.wagmiConfig, {
                    address: this.contractDetails.address,
                    abi: this.contractDetails.abi,
                    functionName: 'tokenTraits',
                    args: [BigInt(i)],
                  }).then((traits) => ({
                    tokenId: i,
                    owner,
                    rarity: Number(traits[1]),
                    timestamp: Number(traits[2]),
                  }));
                }
                return null;
              })
              .catch(() => null)
          );
        }
        
        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter((nft) => nft !== null);
        this.userNFTs.push(...validResults);
        
        // Move to next batch
        tokenId = batchEnd - 1;
      }

      // Sort by token ID descending (newest first)
      this.userNFTs.sort((a, b) => b.tokenId - a.tokenId);

      return this.userNFTs;
    } catch (error) {
      console.error('Failed to load gallery:', error);
      return [];
    }
  }

  /**
   * Fetch recent mints with improved error handling
   */
  async fetchRecentMints(limit = 5) {
    try {
      if (!this.wagmiConfig || !this.contractDetails) {
        console.warn('Missing required parameters for fetching recent mints');
        return [];
      }

      const totalSupply = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'totalSupply',
      });

      const total = Number(totalSupply);
      if (total === 0) return [];

      const start = Math.max(1, total - limit + 1);
      const mints = [];

      const tokenIds = [];
      for (let i = total; i >= start; i--) {
        tokenIds.push(i);
      }

      // Batch process to improve performance
      const batchSize = 10;
      for (let i = 0; i < tokenIds.length; i += batchSize) {
        const batch = tokenIds.slice(i, i + batchSize);
        const promises = batch.map((tokenId) =>
          Promise.all([
            readContract(this.wagmiConfig, {
              address: this.contractDetails.address,
              abi: this.contractDetails.abi,
              functionName: 'ownerOf',
              args: [BigInt(tokenId)],
            }),
            readContract(this.wagmiConfig, {
              address: this.contractDetails.address,
              abi: this.contractDetails.abi,
              functionName: 'tokenTraits',
              args: [BigInt(tokenId)],
            }),
          ])
            .then(([owner, traits]) => ({
              tokenId,
              owner,
              traits,
            }))
            .catch((error) => {
              console.log(`Failed to fetch token #${tokenId}:`, error.message);
              return null;
            })
        );

        const results = await Promise.all(promises);
        results.forEach((result) => {
          if (result) {
            const rarity = Number(result.traits[1]);
            const rarityLabels = ['Common', 'Rare', 'Legendary', 'Mythic'];
            const rarityColors = ['#9ca3af', '#3b82f6', '#f59e0b', '#ec4899'];
            
            mints.push({
              tokenId: result.tokenId,
              owner: result.owner,
              ownerShort: `${result.owner.slice(0, 6)}...${result.owner.slice(-4)}`,
              rarity: rarityLabels[rarity] || 'Common',
              rarityColor: rarityColors[rarity] || '#9ca3af',
              timestamp: Number(result.traits[2]) * 1000,
            });
          }
        });
      }

      return mints;
    } catch (error) {
      console.error('Failed to fetch recent mints:', error);
      return [];
    }
  }

  /**
   * Fetch leaderboard with improved caching and error handling
   */
  async fetchLeaderboard() {
    try {
      // Return cached data if fresh
      const now = Date.now();
      if (
        this.leaderboardCache &&
        now - this.leaderboardLastFetch < this.leaderboardCacheTTL
      ) {
        return this.leaderboardCache;
      }

      console.log('Fetching leaderboard data from Celoscan API...');

      try {
        const data = await apiClient.fetchNFTTransfers(this.contractDetails.address);

        // If Celoscan returns an error status or missing result, fall back to on-chain scan
        if (!data || data.status !== '1' || !Array.isArray(data.result)) {
          console.warn('Celoscan returned invalid or empty data, falling back to blockchain scan:', data);
          return await this.fetchLeaderboardFromBlockchain();
        }

        console.log(`Celoscan API returned ${data.result.length} transfer events`);

        // Build holder map from transfer events
        const holderMap = new Map();
        const tokenOwners = new Map();

        // Process transfers in chronological order (oldest first)
        const transfers = [...data.result].reverse();

        transfers.forEach((tx) => {
          const tokenId = tx.tokenID;
          const from = tx.from.toLowerCase();
          const to = tx.to.toLowerCase();
          const zeroAddress = '0x0000000000000000000000000000000000000000';

          // Update token ownership
          if (from !== zeroAddress && tokenOwners.get(tokenId) === from) {
            holderMap.set(from, (holderMap.get(from) || 1) - 1);
            if (holderMap.get(from) <= 0) holderMap.delete(from);
          }

          if (to !== zeroAddress) {
            tokenOwners.set(tokenId, to);
            holderMap.set(to, (holderMap.get(to) || 0) + 1);
          }
        });

        console.log(`Found ${holderMap.size} unique holders`);

        // Get top holders
        const topHolders = Array.from(holderMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15);

        // Fetch rarity data for each holder with improved batching
        const holderData = [];
        const batchSize = 5; // Process holders in smaller batches
        
        for (let i = 0; i < topHolders.length; i += batchSize) {
          const batch = topHolders.slice(i, i + batchSize);
          const batchPromises = batch.map(async ([address, count]) => {
            const rarities = { mythic: 0, legendary: 0, rare: 0, common: 0 };

            // Get all tokens owned by this address
            const ownedTokens = [];
            for (const [tokenId, owner] of tokenOwners.entries()) {
              if (owner === address) {
                ownedTokens.push(tokenId);
              }
            }

            // Fetch rarity for each token (limited to 50)
            const rarityPromises = ownedTokens.slice(0, 50).map((tokenId) =>
              readContract(this.wagmiConfig, {
                address: this.contractDetails.address,
                abi: this.contractDetails.abi,
                functionName: 'tokenTraits',
                args: [BigInt(tokenId)],
              })
                .then((traits) => Number(traits[1]))
                .catch(() => 0)
            );

            const rarityValues = await Promise.all(rarityPromises);

            rarityValues.forEach((rarity) => {
              if (rarity === 3) rarities.mythic++;
              else if (rarity === 2) rarities.legendary++;
              else if (rarity === 1) rarities.rare++;
              else rarities.common++;
            });

            return {
              address,
              shortAddress: `${address.slice(0, 6)}...${address.slice(-4)}`,
              count,
              rarities,
            };
          });

          const batchResults = await Promise.all(batchPromises);
          holderData.push(...batchResults);
        }

        // Final sort with rarity tiebreakers
        const leaderboard = holderData
          .sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            if (b.rarities.mythic !== a.rarities.mythic)
              return b.rarities.mythic - a.rarities.mythic;
            return b.rarities.legendary - a.rarities.legendary;
          })
          .slice(0, 10);

        this.leaderboardCache = leaderboard;
        this.leaderboardLastFetch = now;

        console.log(`Leaderboard updated: ${leaderboard.length} collectors`);
        return leaderboard;
      } catch (apiError) {
        console.warn('Celoscan API failed, falling back to blockchain scan:', apiError);
        return await this.fetchLeaderboardFromBlockchain();
      }
    } catch (error) {
      console.error('Leaderboard fetch error:', error);
      return [];
    }
  }

  /**
   * Fallback: Scan blockchain directly with improved performance
   */
  async fetchLeaderboardFromBlockchain() {
    try {
      if (!this.wagmiConfig || !this.contractDetails) {
        console.warn('Missing required parameters for blockchain scan');
        return [];
      }

      const totalSupply = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'totalSupply',
      });

      const total = Number(totalSupply);
      if (total === 0) return [];

      console.log(`Scanning ${total} tokens from blockchain...`);

      const holderMap = new Map();
      const rarityMap = new Map();

      // Scan all tokens with improved batching
      const batchSize = 50;
      for (let start = 1; start <= total; start += batchSize) {
        const end = Math.min(start + batchSize - 1, total);
        const promises = [];
        
        for (let i = start; i <= end; i++) {
          promises.push(
            Promise.all([
              readContract(this.wagmiConfig, {
                address: this.contractDetails.address,
                abi: this.contractDetails.abi,
                functionName: 'ownerOf',
                args: [BigInt(i)],
              }),
              readContract(this.wagmiConfig, {
                address: this.contractDetails.address,
                abi: this.contractDetails.abi,
                functionName: 'tokenTraits',
                args: [BigInt(i)],
              }),
            ])
              .then(([owner, traits]) => {
                const addr = owner.toLowerCase();
                holderMap.set(addr, (holderMap.get(addr) || 0) + 1);

                if (!rarityMap.has(addr)) {
                  rarityMap.set(addr, { mythic: 0, legendary: 0, rare: 0, common: 0 });
                }

                const rarity = Number(traits[1]);
                const rarities = rarityMap.get(addr);
                if (rarity === 3) rarities.mythic++;
                else if (rarity === 2) rarities.legendary++;
                else if (rarity === 1) rarities.rare++;
                else rarities.common++;
              })
              .catch(() => null)
          );
        }

        await Promise.all(promises);
      }

      const leaderboard = Array.from(holderMap.entries())
        .map(([address, count]) => ({
          address,
          shortAddress: `${address.slice(0, 6)}...${address.slice(-4)}`,
          count,
          rarities: rarityMap.get(address),
        }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          if (b.rarities.mythic !== a.rarities.mythic)
            return b.rarities.mythic - a.rarities.mythic;
          return b.rarities.legendary - a.rarities.legendary;
        })
        .slice(0, 10);

      this.leaderboardCache = leaderboard;
      this.leaderboardLastFetch = Date.now();

      return leaderboard;
    } catch (error) {
      console.error('Blockchain scan failed:', error);
      return [];
    }
  }

  /**
   * Render gallery with filtering and sorting
   */
  renderGallery(nfts, containerId = 'galleryGrid') {
    const galleryGrid = document.getElementById(containerId);
    const rarityFilter = document.getElementById('rarityFilter')?.value || 'all';
    const sortFilter = document.getElementById('sortFilter')?.value || 'newest';
    
    if (!galleryGrid) return;
    
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

  /**
   * View NFT details
   */
  viewNFTDetails(tokenId) {
    // This would need to be handled by the main app
    console.log('View NFT details:', tokenId);
    return tokenId;
  }
}
