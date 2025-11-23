// ===== ENHANCED GALLERY SYSTEM =====

import { readContract } from '@wagmi/core';

export class EnhancedGallery {
  constructor(wagmiConfig, contractDetails) {
    this.wagmiConfig = wagmiConfig;
    this.contractDetails = contractDetails;
    this.userNFTs = [];
    this.allNFTsCache = new Map();
    this.isLoading = false;
    this.currentPage = 1;
    this.itemsPerPage = 12;
    this.totalPages = 0;
    this.currentFilters = {
      rarity: 'all',
      sort: 'newest',
      search: ''
    };
  }

  /**
   * Load user's NFT gallery with improved performance
   */
  async loadUserGallery(userAddress) {
    if (this.isLoading) return this.userNFTs;
    
    const galleryGrid = document.getElementById('galleryGrid');
    if (!userAddress || !this.contractDetails) {
      galleryGrid.innerHTML = '<div class="empty-state">Connect wallet to view your NFTs</div>';
      return [];
    }

    this.isLoading = true;
    this.showLoadingState();

    try {
      // Get user's NFT balance
      const balance = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'balanceOf',
        args: [userAddress]
      });

      const nftCount = Number(balance);
      
      if (nftCount === 0) {
        galleryGrid.innerHTML = `
          <div class="empty-state-card">
            <div class="empty-icon">🎨</div>
            <h3>No NFTs Yet</h3>
            <p>You haven't minted any NFTs. Start your collection now!</p>
            <button onclick="switchTab('mint')" class="action-button" style="margin-top: 16px;">
              Mint Your First NFT
            </button>
          </div>
        `;
        this.isLoading = false;
        return [];
      }

      // Show progress indicator
      this.updateLoadingProgress(0, nftCount);

      // Get total supply for efficient scanning
      const totalSupply = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'totalSupply'
      });

      const total = Number(totalSupply);
      this.userNFTs = [];

      // Optimized scanning: Check from newest to oldest
      const batchSize = 20;
      let processed = 0;
      
      for (let start = total; start >= 1 && this.userNFTs.length < nftCount; start -= batchSize) {
        const end = Math.max(1, start - batchSize + 1);
        const tokenIds = [];
        
        for (let i = start; i >= end; i--) {
          tokenIds.push(i);
        }

        // Batch fetch ownership and traits
        const promises = tokenIds.map(tokenId =>
          Promise.all([
            readContract(this.wagmiConfig, {
              address: this.contractDetails.address,
              abi: this.contractDetails.abi,
              functionName: 'ownerOf',
              args: [BigInt(tokenId)]
            }),
            readContract(this.wagmiConfig, {
              address: this.contractDetails.address,
              abi: this.contractDetails.abi,
              functionName: 'tokenTraits',
              args: [BigInt(tokenId)]
            }),
            // Fetch tokenURI for thumbnail preview
            readContract(this.wagmiConfig, {
              address: this.contractDetails.address,
              abi: this.contractDetails.abi,
              functionName: 'tokenURI',
              args: [BigInt(tokenId)]
            })
          ])
          .then(([owner, traits, tokenURI]) => {
            if (owner.toLowerCase() === userAddress.toLowerCase()) {
              // Parse metadata for price info
              let priceSnapshot = 'N/A';
              try {
                const base64Json = tokenURI.split(',')[1];
                const jsonString = atob(decodeURIComponent(base64Json));
                const metadata = JSON.parse(jsonString);
                const priceAttr = metadata.attributes?.find(attr => attr.trait_type === 'CELO Price Snapshot');
                if (priceAttr) priceSnapshot = priceAttr.value;
              } catch (e) {
                console.log(`Failed to parse metadata for token ${tokenId}`);
              }

              return {
                tokenId,
                owner,
                rarity: Number(traits[1]),
                timestamp: Number(traits[2]),
                priceSnapshot,
                tokenURI
              };
            }
            return null;
          })
          .catch(() => null)
        );

        const results = await Promise.all(promises);
        this.userNFTs.push(...results.filter(nft => nft !== null));

        processed += tokenIds.length;
        this.updateLoadingProgress(this.userNFTs.length, nftCount);

        // Break early if we found all user's NFTs
        if (this.userNFTs.length >= nftCount) break;
      }

      // Sort by token ID descending (newest first)
      this.userNFTs.sort((a, b) => b.tokenId - a.tokenId);

      // Calculate total pages
      this.totalPages = Math.ceil(this.userNFTs.length / this.itemsPerPage);
      this.currentPage = 1;

      // Render gallery
      this.renderGallery();
      this.updateGalleryStats();

    } catch (error) {
      console.error('Failed to load gallery:', error);
      galleryGrid.innerHTML = `
        <div class="empty-state-card error">
          <div class="empty-icon">⚠️</div>
          <h3>Failed to Load NFTs</h3>
          <p>${error.message || 'Please try again later'}</p>
          <button onclick="loadGallery()" class="action-button" style="margin-top: 16px;">
            Retry
          </button>
        </div>
      `;
    } finally {
      this.isLoading = false;
    }

    return this.userNFTs;
  }

  /**
   * Show loading state with skeleton cards
   */
  showLoadingState() {
    const galleryGrid = document.getElementById('galleryGrid');
    galleryGrid.innerHTML = `
      <div class="gallery-loading">
        <div class="loading-message">
          <span class="spinner" style="width: 40px; height: 40px; border-width: 4px;"></span>
          <p>Loading your NFT collection...</p>
          <div class="loading-progress">
            <div class="progress-bar">
              <div class="progress-fill" id="loadingProgress" style="width: 0%"></div>
            </div>
            <span id="loadingText">Scanning blockchain...</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Update loading progress
   */
  updateLoadingProgress(found, total) {
    const progressFill = document.getElementById('loadingProgress');
    const loadingText = document.getElementById('loadingText');
    
    if (progressFill && loadingText) {
      const percentage = (found / total) * 100;
      progressFill.style.width = `${percentage}%`;
      loadingText.textContent = `Found ${found} of ${total} NFTs...`;
    }
  }

  /**
   * Render gallery with pagination and filters
   */
  renderGallery() {
    const galleryGrid = document.getElementById('galleryGrid');
    
    // Apply filters
    let filtered = this.applyFilters(this.userNFTs);
    
    // Update total pages after filtering
    this.totalPages = Math.ceil(filtered.length / this.itemsPerPage);
    
    // Ensure current page is valid
    if (this.currentPage > this.totalPages) {
      this.currentPage = Math.max(1, this.totalPages);
    }
    
    // Paginate
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    const paginatedNFTs = filtered.slice(startIndex, endIndex);

    if (filtered.length === 0) {
      galleryGrid.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-icon">🔍</div>
          <h3>No NFTs Found</h3>
          <p>Try adjusting your filters</p>
          <button onclick="galleryManager.resetFilters()" class="action-button" style="margin-top: 16px;">
            Reset Filters
          </button>
        </div>
      `;
      this.updatePagination(0);
      return;
    }

    const rarityLabels = ['Common', 'Rare', 'Legendary', 'Mythic'];
    const rarityColors = ['#9ca3af', '#3b82f6', '#f59e0b', '#ec4899'];
    const rarityGradients = [
      'linear-gradient(135deg, #6b7280, #4b5563)',
      'linear-gradient(135deg, #3b82f6, #2563eb)',
      'linear-gradient(135deg, #f59e0b, #d97706)',
      'linear-gradient(135deg, #ec4899, #be185d)'
    ];

    galleryGrid.innerHTML = paginatedNFTs.map((nft, index) => `
      <div class="gallery-item" onclick="viewNFTDetails(${nft.tokenId})" style="animation-delay: ${index * 0.05}s">
        <div class="gallery-item-badge" style="background: ${rarityGradients[nft.rarity]};">
          #${nft.tokenId}
        </div>
        <div class="gallery-item-image rarity-${rarityLabels[nft.rarity].toLowerCase()}">
          <div class="nft-placeholder">
            <div class="placeholder-icon">${this.getRarityIcon(nft.rarity)}</div>
            <div class="placeholder-token">#${nft.tokenId}</div>
          </div>
        </div>
        <div class="gallery-item-info">
          <div class="gallery-item-header">
            <div class="gallery-token-id">Token #${nft.tokenId}</div>
            <div class="gallery-rarity" style="color: ${rarityColors[nft.rarity]}; border-color: ${rarityColors[nft.rarity]};">
              ${rarityLabels[nft.rarity]}
            </div>
          </div>
          <div class="gallery-item-price">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
            </svg>
            ${nft.priceSnapshot}
          </div>
          <div class="gallery-item-date">
            ${this.formatTimestamp(nft.timestamp)}
          </div>
        </div>
      </div>
    `).join('');

    // Update pagination
    this.updatePagination(filtered.length);
  }

  /**
   * Apply filters to NFT list
   */
  applyFilters(nfts) {
    let filtered = [...nfts];

    // Rarity filter
    if (this.currentFilters.rarity !== 'all') {
      const rarityMap = { 'common': 0, 'rare': 1, 'legendary': 2, 'mythic': 3 };
      filtered = filtered.filter(nft => nft.rarity === rarityMap[this.currentFilters.rarity]);
    }

    // Search filter
    if (this.currentFilters.search) {
      const search = this.currentFilters.search.toLowerCase();
      filtered = filtered.filter(nft => 
        nft.tokenId.toString().includes(search) ||
        nft.priceSnapshot.toLowerCase().includes(search)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (this.currentFilters.sort) {
        case 'newest':
          return b.timestamp - a.timestamp;
        case 'oldest':
          return a.timestamp - b.timestamp;
        case 'rarity':
          return b.rarity - a.rarity || b.tokenId - a.tokenId;
        case 'tokenId':
          return b.tokenId - a.tokenId;
        case 'price':
          const priceA = parseFloat(a.priceSnapshot.replace('$', '')) || 0;
          const priceB = parseFloat(b.priceSnapshot.replace('$', '')) || 0;
          return priceB - priceA;
        default:
          return 0;
      }
    });

    return filtered;
  }

  /**
   * Update pagination controls
   */
  updatePagination(totalItems) {
    const paginationContainer = document.getElementById('galleryPagination');
    if (!paginationContainer) return;

    if (totalItems <= this.itemsPerPage) {
      paginationContainer.innerHTML = '';
      return;
    }

    const maxVisiblePages = 5;
    const startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
    const endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

    let paginationHTML = `
      <div class="pagination-info">
        Showing ${(this.currentPage - 1) * this.itemsPerPage + 1}-${Math.min(this.currentPage * this.itemsPerPage, totalItems)} of ${totalItems}
      </div>
      <div class="pagination-controls">
    `;

    // Previous button
    paginationHTML += `
      <button class="pagination-btn ${this.currentPage === 1 ? 'disabled' : ''}" 
        onclick="galleryManager.goToPage(${this.currentPage - 1})"
        ${this.currentPage === 1 ? 'disabled' : ''}>
        ‹
      </button>
    `;

    // First page
    if (startPage > 1) {
      paginationHTML += `
        <button class="pagination-btn" onclick="galleryManager.goToPage(1)">1</button>
        ${startPage > 2 ? '<span class="pagination-ellipsis">...</span>' : ''}
      `;
    }

    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
      paginationHTML += `
        <button class="pagination-btn ${i === this.currentPage ? 'active' : ''}" 
          onclick="galleryManager.goToPage(${i})">
          ${i}
        </button>
      `;
    }

    // Last page
    if (endPage < this.totalPages) {
      paginationHTML += `
        ${endPage < this.totalPages - 1 ? '<span class="pagination-ellipsis">...</span>' : ''}
        <button class="pagination-btn" onclick="galleryManager.goToPage(${this.totalPages})">${this.totalPages}</button>
      `;
    }

    // Next button
    paginationHTML += `
      <button class="pagination-btn ${this.currentPage === this.totalPages ? 'disabled' : ''}" 
        onclick="galleryManager.goToPage(${this.currentPage + 1})"
        ${this.currentPage === this.totalPages ? 'disabled' : ''}>
        ›
      </button>
    `;

    paginationHTML += '</div>';
    paginationContainer.innerHTML = paginationHTML;
  }

  /**
   * Go to specific page
   */
  goToPage(page) {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.renderGallery();
    
    // Scroll to top of gallery
    const galleryHeader = document.querySelector('.gallery-header');
    if (galleryHeader) {
      galleryHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Update filters
   */
  updateFilter(filterType, value) {
    this.currentFilters[filterType] = value;
    this.currentPage = 1; // Reset to first page
    this.renderGallery();
    this.updateGalleryStats();
  }

  /**
   * Reset all filters
   */
  resetFilters() {
    this.currentFilters = {
      rarity: 'all',
      sort: 'newest',
      search: ''
    };
    this.currentPage = 1;
    
    // Reset UI
    const rarityFilter = document.getElementById('rarityFilter');
    const sortFilter = document.getElementById('sortFilter');
    const searchInput = document.getElementById('searchInput');
    
    if (rarityFilter) rarityFilter.value = 'all';
    if (sortFilter) sortFilter.value = 'newest';
    if (searchInput) searchInput.value = '';
    
    this.renderGallery();
    this.updateGalleryStats();
  }

  /**
   * Update gallery statistics
   */
  updateGalleryStats() {
    const statsContainer = document.getElementById('galleryStats');
    if (!statsContainer) return;

    const filtered = this.applyFilters(this.userNFTs);
    const rarityCount = { common: 0, rare: 0, legendary: 0, mythic: 0 };
    
    filtered.forEach(nft => {
      const rarityLabels = ['common', 'rare', 'legendary', 'mythic'];
      rarityCount[rarityLabels[nft.rarity]]++;
    });

    statsContainer.innerHTML = `
      <div class="gallery-stat">
        <div class="stat-value">${filtered.length}</div>
        <div class="stat-label">Total NFTs</div>
      </div>
      <div class="gallery-stat">
        <div class="stat-value" style="color: #ec4899;">${rarityCount.mythic}</div>
        <div class="stat-label">Mythic</div>
      </div>
      <div class="gallery-stat">
        <div class="stat-value" style="color: #f59e0b;">${rarityCount.legendary}</div>
        <div class="stat-label">Legendary</div>
      </div>
      <div class="gallery-stat">
        <div class="stat-value" style="color: #3b82f6;">${rarityCount.rare}</div>
        <div class="stat-label">Rare</div>
      </div>
    `;
  }

  /**
   * Get rarity icon
   */
  getRarityIcon(rarity) {
    const icons = ['💎', '💠', '⭐', '👑'];
    return icons[rarity] || '💎';
  }

  /**
   * Format timestamp to readable date
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /**
   * Export gallery data
   */
  exportGalleryData() {
    const data = this.userNFTs.map(nft => ({
      tokenId: nft.tokenId,
      rarity: ['Common', 'Rare', 'Legendary', 'Mythic'][nft.rarity],
      priceSnapshot: nft.priceSnapshot,
      mintDate: new Date(nft.timestamp * 1000).toISOString()
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `celo-nft-collection-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
