import { apiClient } from './api-client.js';
import { formatTimeAgo } from './utils.js';

class FeedManager {
  constructor(wagmiConfig, contractDetails) {
    this.wagmiConfig = wagmiConfig;
    this.contractDetails = contractDetails;
    this.recentMintsInterval = null;
    this.leaderboardInterval = null;
  }

  async fetchRecentMints(limit = 5) {
    try {
      const transfers = await apiClient.fetchNFTTransfers(
        this.contractDetails.address,
        1,
        limit,
        'desc'
      );

      // Filter for mint transactions (to address is the zero address or contract creator)
      const mintTransactions = transfers.result
        .filter(tx => tx.from.toLowerCase() === '0x0000000000000000000000000000000000000000')
        .slice(0, limit);

      return mintTransactions.map(tx => ({
        tokenId: parseInt(tx.tokenID),
        timestamp: tx.timeStamp * 1000, // Convert to milliseconds
        owner: tx.to,
        transactionHash: tx.hash
      }));
    } catch (error) {
      console.error('Error fetching recent mints:', error);
      throw new Error(`Failed to fetch recent mints: ${error.message}`);
    }
  }

  renderRecentMints(mints) {
    const container = document.getElementById('recent-mints-container');
    if (!container) return;

    if (!mints || mints.length === 0) {
      container.innerHTML = '<p>No recent mints found</p>';
      return;
    }

    const html = mints.map(mint => `
      <div class="recent-mint-item" data-token-id="${mint.tokenId}">
        <div class="mint-info">
          <span class="token-id">NFT #${mint.tokenId}</span>
          <span class="time-ago">${formatTimeAgo(mint.timestamp)}</span>
        </div>
        <div class="owner-address">
          ${mint.owner.substring(0, 6)}...${mint.owner.substring(mint.owner.length - 4)}
        </div>
      </div>
    `).join('');

    container.innerHTML = html;

    // Add click listeners to mint items
    container.querySelectorAll('.recent-mint-item').forEach(item => {
      item.addEventListener('click', () => {
        const tokenId = item.getAttribute('data-token-id');
        // You would call a function to view this NFT details
        // viewNFTDetails(tokenId);
      });
    });
  }

  async startRecentMintsPolling(intervalMs = 30000) {
    // Clear any existing interval
    if (this.recentMintsInterval) {
      clearInterval(this.recentMintsInterval);
    }

    // Fetch and display initial data
    try {
      const mints = await this.fetchRecentMints();
      this.renderRecentMints(mints);
    } catch (error) {
      console.error('Error in initial recent mints fetch:', error);
    }

    // Start polling
    this.recentMintsInterval = setInterval(async () => {
      try {
        const mints = await this.fetchRecentMints();
        this.renderRecentMints(mints);
      } catch (error) {
        console.error('Error in recent mints polling:', error);
      }
    }, intervalMs);
  }

  stopRecentMintsPolling() {
    if (this.recentMintsInterval) {
      clearInterval(this.recentMintsInterval);
      this.recentMintsInterval = null;
    }
  }

  async startLeaderboardPolling(intervalMs = 120000) {
    // Clear any existing interval
    if (this.leaderboardInterval) {
      clearInterval(this.leaderboardInterval);
    }
    
    // Fetch and display initial data
    try {
      // We'll need to implement this in the gallery manager
      // For now, we'll just log that it's starting
      console.log('Starting leaderboard polling');
    } catch (error) {
      console.error('Error in initial leaderboard fetch:', error);
    }
    
    // Start polling
    this.leaderboardInterval = setInterval(async () => {
      try {
        // We'll need to implement this in the gallery manager
        // For now, we'll just log that it's polling
        console.log('Polling leaderboard');
      } catch (error) {
        console.error('Error in leaderboard polling:', error);
      }
    }, intervalMs);
  }
  
  stopLeaderboardPolling() {
    if (this.leaderboardInterval) {
      clearInterval(this.leaderboardInterval);
      this.leaderboardInterval = null;
    }
  }
}

export default FeedManager;