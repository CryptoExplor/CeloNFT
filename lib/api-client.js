/**
 * API Client - Centralized API calls with error handling
 * Reusable across different applications
 */

export class APIClient {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
  }

  /**
   * Generic fetch wrapper with error handling
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  /**
   * GET request
   */
  async get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;
    return this.request(url, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // ===== CELO NFT SPECIFIC ENDPOINTS =====

  /**
   * Fetch CELO price from CoinGecko
   */
  async fetchCeloPrice() {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=celo&vs_currencies=usd&include_24hr_change=true'
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (!data?.celo?.usd) {
        throw new Error('Invalid response structure from CoinGecko');
      }
      return {
        price: data.celo.usd,
        change24h: data.celo.usd_24h_change || 0,
      };
    } catch (error) {
      console.error('Failed to fetch CELO price:', error);
      throw new Error('Failed to fetch CELO price. Please try again.');
    }
  }

  /**
   * Claim airdrop after minting
   */
  async claimAirdrop(tokenId, userAddress, mintTxHash, predictionMultiplier = 1) {
    return this.post('/api/airdrop', {
      tokenId,
      userAddress,
      mintTxHash,
      predictionMultiplier,
    });
  }

  /**
   * Store price prediction
   */
  async storePrediction(userAddress, currentPrice, prediction, timestamp) {
    return this.post('/api/prediction', {
      action: 'predict',
      userAddress,
      currentPrice,
      prediction,
      timestamp,
    });
  }

  /**
   * Verify price prediction
   */
  async verifyPrediction(userAddress, timestamp, newPrice) {
    return this.post('/api/prediction', {
      action: 'verify',
      userAddress,
      timestamp,
      newPrice,
    });
  }

  /**
   * Get user prediction stats
   */
  async getUserStats(userAddress) {
    return this.get('/api/prediction', { userAddress });
  }

  /**
   * Fetch NFT transfers from Celoscan API (proxied through backend)
   */
  async fetchNFTTransfers(contractAddress, page = 1, offset = 10000, sort = 'desc') {
    return this.get('/api/celoscan', {
      module: 'account',
      action: 'tokennfttx',
      contractaddress: contractAddress,
      page,
      offset,
      sort,
    });
  }
}

// Singleton instance
export const apiClient = new APIClient();
