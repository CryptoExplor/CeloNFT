/**
 * AppKit/Wallet Connection Module - FIXED
 * Now properly includes Farcaster connector
 */

import {
  createConfig,
  connect,
  getAccount,
  watchAccount,
  http,
} from '@wagmi/core';
import { celo } from '@wagmi/core/chains';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { createPublicClient } from 'viem';

export class WalletManager {
  constructor(config = {}) {
    this.projectId = config.projectId;
    this.appName = config.appName || 'Web3 App';
    this.appDescription = config.appDescription || 'Web3 Application';
    this.appUrl = config.appUrl || window.location.origin;
    this.appIcon = config.appIcon || `${window.location.origin}/icon.png`;
    this.chains = config.chains || [celo];
    
    this.wagmiConfig = null;
    this.modal = null;
    this.userAddress = null;
    this.accountChangeCallbacks = [];
    this.publicClient = null;
  }

  /**
   * Initialize wagmi config and AppKit with Farcaster support
   */
  async initialize() {
    console.log('🔧 Initializing WalletManager...');
    
    // Create WagmiAdapter with Farcaster connector - FIX
    const wagmiAdapter = new WagmiAdapter({
      networks: this.chains,
      projectId: this.projectId,
      ssr: false,
      connectors: [
        farcasterMiniApp() // Add Farcaster connector
      ]
    });

    this.wagmiConfig = wagmiAdapter.wagmiConfig;
    console.log('✅ Wagmi config created with', this.wagmiConfig.connectors.length, 'connectors');

    // Log available connectors
    this.wagmiConfig.connectors.forEach(connector => {
      console.log('  - Connector:', connector.id, connector.name);
    });

    // Initialize public client for reading blockchain data
    this.publicClient = createPublicClient({
      chain: this.chains[0],
      transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org'),
    });
    console.log('✅ Public client created');

    // Create AppKit modal
    this.modal = createAppKit({
      adapters: [wagmiAdapter],
      networks: this.chains,
      projectId: this.projectId,
      metadata: {
        name: this.appName,
        description: this.appDescription,
        url: this.appUrl,
        icons: [this.appIcon],
      },
      features: {
        analytics: true,
        connectMethodsOrder: ['wallet'],
      },
      allWallets: 'SHOW',
      themeMode: 'dark',
      themeVariables: {
        '--w3m-accent': '#49dfb5',
        '--w3m-border-radius-master': '8px',
      },
    });
    console.log('✅ AppKit modal created');

    return this.wagmiConfig;
  }

  /**
   * Connect to Farcaster wallet if in Farcaster environment
   */
  async connectFarcaster() {
    try {
      console.log('🔌 Attempting Farcaster connection...');
      
      const farcasterConnector = this.wagmiConfig.connectors.find(
        (c) => c.id === 'farcasterMiniApp' || c.name?.includes('Farcaster')
      );
      
      if (farcasterConnector) {
        console.log('✅ Found Farcaster connector:', farcasterConnector.name);
        const conn = await connect(this.wagmiConfig, {
          connector: farcasterConnector,
        });
        this.userAddress = conn.accounts[0];
        console.log('✅ Connected via Farcaster:', this.userAddress);
        return this.userAddress;
      } else {
        console.warn('⚠️ Farcaster connector not found');
        console.log('Available connectors:', this.wagmiConfig.connectors.map(c => c.id));
      }
    } catch (error) {
      console.error('❌ Farcaster connection failed:', error);
      throw error;
    }
  }

  /**
   * Get current account
   */
  getAccount() {
    return getAccount(this.wagmiConfig);
  }

  /**
   * Check if wallet is connected
   */
  isConnected() {
    const account = this.getAccount();
    return account.isConnected && !!account.address;
  }

  /**
   * Get current address
   */
  getAddress() {
    const account = this.getAccount();
    return account.address || null;
  }

  /**
   * Watch account changes
   */
  watchAccountChanges(onChange) {
    this.accountChangeCallbacks.push(onChange);
    
    watchAccount(this.wagmiConfig, {
      onChange: (account) => {
        console.log('👤 Account changed:', account.address ? 'Connected' : 'Disconnected');
        this.userAddress = account.address || null;
        // Call all registered callbacks
        this.accountChangeCallbacks.forEach((callback) => callback(account));
      },
    });
  }

  /**
   * Open wallet connection modal
   */
  openModal(view = null) {
    if (this.modal) {
      if (view) {
        this.modal.open({ view });
      } else {
        this.modal.open();
      }
    }
  }

  /**
   * Get wallet balance in native currency
   */
  async getBalance(address = null) {
    const addr = address || this.userAddress;
    if (!addr || !this.publicClient) return null;

    try {
      const balance = await this.publicClient.getBalance({
        address: addr,
      });
      return balance;
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      return null;
    }
  }

  /**
   * Format balance from wei to readable format
   */
  formatBalance(balance, decimals = 4) {
    if (!balance) return '0';
    return (Number(balance) / 1e18).toFixed(decimals);
  }

  /**
   * Disconnect wallet
   */
  async disconnect() {
    if (this.modal) {
      await this.modal.disconnect();
      this.userAddress = null;
    }
  }

  /**
   * Get public client for reading blockchain data
   */
  getPublicClient() {
    return this.publicClient;
  }
}

/**
 * Safe LocalStorage wrapper
 */
export const safeLocalStorage = {
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn('Failed to save to localStorage:', error);
      return false;
    }
  },
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('Failed to read from localStorage:', error);
      return null;
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
      return false;
    }
  },
};
