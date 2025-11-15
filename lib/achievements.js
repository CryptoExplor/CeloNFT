/**
 * Achievements Module
 * Handles NFT achievement tracking and display
 * Reusable for any gamified dApp
 */

import { readContract } from '@wagmi/core';

export class AchievementsManager {
  constructor(wagmiConfig, contractDetails) {
    this.wagmiConfig = wagmiConfig;
    this.contractDetails = contractDetails;
    this.achievements = [
      {
        id: 'first_mint',
        icon: '🎯',
        title: 'First Steps',
        description: 'Mint your first CELO NFT',
        check: (userMintCount) => userMintCount >= 1
      },
      {
        id: 'five_mints',
        icon: '🔥',
        title: 'Getting Started',
        description: 'Mint 5 NFTs',
        check: (userMintCount) => userMintCount >= 5
      },
      {
        id: 'ten_mints',
        icon: '💎',
        title: 'Collector',
        description: 'Mint 10 NFTs',
        check: (userMintCount) => userMintCount >= 10
      },
      {
        id: 'rare_pull',
        icon: '💙',
        title: 'Rare Find',
        description: 'Own a Rare NFT',
        check: (userNFTs) => userNFTs.some(nft => nft.rarity >= 1)
      },
      {
        id: 'legendary_pull',
        icon: '⭐',
        title: 'Legendary!',
        description: 'Own a Legendary NFT',
        check: (userNFTs) => userNFTs.some(nft => nft.rarity >= 2)
      },
      {
        id: 'mythic_pull',
        icon: '👑',
        title: 'Mythic Master',
        description: 'Own a Mythic NFT',
        check: (userNFTs) => userNFTs.some(nft => nft.rarity === 3)
      },
      {
        id: 'early_adopter',
        icon: '🚀',
        title: 'Early Adopter',
        description: 'Minted in the first 100',
        check: (userNFTs) => userNFTs.some(nft => nft.tokenId <= 100)
      },
      {
        id: 'lucky_token',
        icon: '🍀',
        title: 'Lucky Number',
        description: 'Own a lucky token (77, 111, 222, etc.)',
        check: (userNFTs) => {
          const luckyNumbers = [77, 111, 222, 333, 444, 555, 666, 777, 888, 999];
          return userNFTs.some(nft => luckyNumbers.includes(nft.tokenId));
        }
      },
      {
        id: 'milestone_token',
        icon: '🎯',
        title: 'Milestone Collector',
        description: 'Own a milestone token (100, 250, 500, 1000)',
        check: (userNFTs) => {
          const milestones = [100, 250, 500, 1000, 2500, 5000];
          return userNFTs.some(nft => milestones.includes(nft.tokenId));
        }
      },
      {
        id: 'top_collector',
        icon: '🏆',
        title: 'Top Collector',
        description: 'Be in the top 10 leaderboard',
        check: (userMintCount) => {
          // This would need leaderboard data
          return userMintCount >= 20;
        }
      }
    ];
  }

  /**
   * Check if number is palindrome
   */
  isPalindrome(num) {
    const str = num.toString();
    return str.length > 1 && str === str.split('').reverse().join('');
  }

  /**
   * Check if number is sequential
   */
  isSequential(num) {
    const str = num.toString();
    if (str.length < 3) return false;

    let isAscending = true;
    for (let i = 1; i < str.length; i++) {
      if (parseInt(str[i]) !== parseInt(str[i - 1]) + 1) {
        isAscending = false;
        break;
      }
    }

    let isDescending = true;
    for (let i = 1; i < str.length; i++) {
      if (parseInt(str[i]) !== parseInt(str[i - 1]) - 1) {
        isDescending = false;
        break;
      }
    }

    return isAscending || isDescending;
  }

  /**
   * Check if number has repeating digits
   */
  isRepeatingDigits(num) {
    const str = num.toString();
    if (str.length < 2) return false;

    const firstDigit = str[0];
    return str.split('').every((d) => d === firstDigit);
  }

  /**
   * Get user achievements
   */
  async getUserAchievements(userAddress, userMintCount, userNFTs = []) {
    try {
      // If we don't have userNFTs, fetch them
      let nfts = userNFTs;
      if (!nfts || nfts.length === 0) {
        nfts = await this.fetchUserNFTs(userAddress);
      }

      // Check each achievement
      const earned = this.achievements
        .filter((achievement) => {
          // ✅ FIX: Pass correct parameters based on achievement type
          if (['first_mint', 'five_mints', 'ten_mints', 'top_collector'].includes(achievement.id)) {
            return achievement.check(userMintCount);
          }
          return achievement.check(nfts);
        })
        .map((achievement) => ({
          ...achievement,
          earned: true,
          earnedAt: Date.now(),
        }));

      return earned;
    } catch (error) {
      console.error('Failed to get achievements:', error);
      return [];
    }
  }

  /**
   * Fetch user's NFTs with traits
   */
  async fetchUserNFTs(userAddress) {
    try {
      const balance = await readContract(this.wagmiConfig, {
        address: this.contractDetails.address,
        abi: this.contractDetails.abi,
        functionName: 'balanceOf',
        args: [userAddress],
      });

      const count = Number(balance);
      if (count === 0) return [];

      const nfts = [];
      const promises = [];

      // Get all token IDs owned by user
      for (let i = 0; i < count; i++) {
        promises.push(
          readContract(this.wagmiConfig, {
            address: this.contractDetails.address,
            abi: this.contractDetails.abi,
            functionName: 'tokenOfOwnerByIndex',
            args: [userAddress, BigInt(i)],
          })
            .then((tokenId) => {
              return readContract(this.wagmiConfig, {
                address: this.contractDetails.address,
                abi: this.contractDetails.abi,
                functionName: 'tokenTraits',
                args: [tokenId],
              }).then((traits) => ({
                tokenId: Number(tokenId),
                rarity: Number(traits[1]),
                timestamp: Number(traits[2]),
              }));
            })
            .catch(() => null)
        );
      }

      const results = await Promise.all(promises);
      return results.filter((nft) => nft !== null);
    } catch (error) {
      console.error('Failed to fetch user NFTs:', error);
      return [];
    }
  }

  /**
   * Get all achievements with earned status
   */
  getAllAchievements(earnedAchievements = []) {
    return this.achievements.map((achievement) => {
      const earned = earnedAchievements.find((ea) => ea.id === achievement.id);
      return {
        ...achievement,
        earned: !!earned,
        earnedAt: earned ? earned.earnedAt : null,
      };
    });
  }

  /**
   * Get achievement rarity color
   */
  getRarityColor(rarity) {
    const colors = {
      common: '#9ca3af',
      rare: '#3b82f6',
      legendary: '#f59e0b',
      mythic: '#ec4899',
    };
    return colors[rarity] || colors.common;
  }

  /**
   * Load achievements in bottom section
   */
  async loadAchievementsBottom(userAddress, contractDetails, userMintCount, userNFTs = []) {
    const achievementsGrid = document.getElementById('achievementsGrid2');
    const achievementCount = document.getElementById('achievementCount2');
    const totalAchievements = document.getElementById('totalAchievements2');
    
    if (!achievementsGrid) return;
    
    // Always ensure we have up-to-date NFT data for accurate achievements
    let loadedNFTs = userNFTs;
    if ((!loadedNFTs || loadedNFTs.length === 0) && userAddress && this.contractDetails) {
      try {
        loadedNFTs = await this.fetchUserNFTs(userAddress);
        console.log('✅ Loaded NFTs for achievements:', loadedNFTs.length);
      } catch (e) {
        console.error('Failed to load NFTs for achievements:', e);
        loadedNFTs = [];
      }
    }
    
    let unlockedCount = 0;
    
    const html = this.achievements.map(achievement => {
      // Fix the check logic - pass the correct parameters based on achievement type
      let unlocked = false;
      if (achievement.id === 'first_mint' || achievement.id === 'five_mints' || achievement.id === 'ten_mints' || achievement.id === 'top_collector') {
        unlocked = achievement.check(userMintCount);
      } else {
        unlocked = achievement.check(loadedNFTs);
      }
      
      if (unlocked) unlockedCount++;
      
      return `
        <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
          <div class="achievement-icon">${achievement.icon}</div>
          <div class="achievement-title">${achievement.title}</div>
          <div class="achievement-description">${achievement.description}</div>
          ${unlocked ? '<div class="achievement-reward">✅ Unlocked!</div>' : '<div class="achievement-reward" style="color: #6b7280;">🔒 Locked</div>'}
        </div>
      `;
    }).join('');
    
    achievementsGrid.innerHTML = html;
    if (achievementCount) achievementCount.textContent = unlockedCount;
    if (totalAchievements) totalAchievements.textContent = this.achievements.length;
    
    // Save achievements to localStorage
    try {
      localStorage.setItem('achievements', JSON.stringify({
        unlocked: unlockedCount,
        total: this.achievements.length,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Failed to save achievements to localStorage:', e);
    }
    
    return { unlockedCount, total: this.achievements.length };
  }
}



