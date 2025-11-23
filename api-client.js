/**
 * API Client for external services
 * Handles communication with backend APIs and third-party services
 */

class ApiClient {
  /**
   * Fetch NFT transfers from Celoscan API
   * @param {string} contractAddress - The NFT contract address
   * @returns {Promise<Object>} - The API response
   */
  async fetchNFTTransfers(contractAddress) {
    try {
      // Use the Vercel API proxy endpoint
      const response = await fetch(`/api/celoscan?module=account&action=tokennfttx&contractaddress=${contractAddress}&page=1&offset=10000&sort=desc`);
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch NFT transfers:', error);
      throw error;
    }
  }
  
  /**
   * Fetch CELO price data
   * @returns {Promise<Object>} - The price data
   */
  async fetchCeloPrice() {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=celo&vs_currencies=usd&include_24hr_change=true');
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to fetch CELO price:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();