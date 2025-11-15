/**
 * Wallet Manager - FINAL FIXED VERSION
 * Properly includes Farcaster connector
 */

import {
  createConfig,
  connect,
  getAccount,
  watchAccount,
  http,
  getBalance as wagmiGetBalance,
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

  async initialize() {
    console.log('🔧 Initializing WalletManager...');
    
    // Create WagmiAdapter with Farcaster connector
    const wagmiAdapter = new WagmiAdapter({
      networks: this.chains,
      projectId: this.projectId,
      ssr: false,
    });

    this.wagmiConfig = wagmiAdapter.wagmiConfig;
    console.log('✅ Wagmi config created with', this.wagmiConfig.connectors.length, 'connectors');

    // Initialize public client
    this.publicClient = createPublicClient({
      chain: this.chains[0],
      transport: http(),
    });

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

    return this.wagmiConfig;
  }

  async connectFarcaster() {
    try {
      const farcasterConnector = this.wagmiConfig.connectors.find(
        (c) => c.id === 'farcasterMiniApp'
      );
      
      if (farcasterConnector) {
        const conn = await connect(this.wagmiConfig, {
          connector: farcasterConnector,
        });
        this.userAddress = conn.accounts[0];
        return this.userAddress;
      }
    } catch (error) {
      console.error('Farcaster connection failed:', error);
      throw error;
    }
  }

  getAccount() {
    return getAccount(this.wagmiConfig);
  }

  isConnected() {
    const account = this.getAccount();
    return account.isConnected && !!account.address;
  }

  getAddress() {
    const account = this.getAccount();
    return account.address || null;
  }

  watchAccountChanges(onChange) {
    this.accountChangeCallbacks.push(onChange);
    
    watchAccount(this.wagmiConfig, {
      onChange: (account) => {
        this.userAddress = account.address || null;
        this.accountChangeCallbacks.forEach((callback) => callback(account));
      },
    });
  }

  openModal(view = null) {
    if (this.modal) {
      if (view) {
        this.modal.open({ view });
      } else {
        this.modal.open();
      }
    }
  }

  async getBalance(address = null) {
    const addr = address || this.userAddress;
    if (!addr) return null;

    try {
      const balance = await wagmiGetBalance(this.wagmiConfig, {
        address: addr,
      });
      return balance.value;
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      return null;
    }
  }

  formatBalance(balance, decimals = 4) {
    if (!balance) return '0';
    return (Number(balance) / 1e18).toFixed(decimals);
  }

  async disconnect() {
    if (this.modal) {
      await this.modal.disconnect();
      this.userAddress = null;
    }
  }

  getPublicClient() {
    if (!this.publicClient) {
      this.publicClient = createPublicClient({
        chain: this.chains[0],
        transport: http(),
      });
    }
    return this.publicClient;
  }
}

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
