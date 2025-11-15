/**
 * Predictions Module
 * Handles price prediction game logic
 * Reusable for any prediction-based mini game
 */

import { apiClient } from './api-client.js';
import confetti from 'canvas-confetti';

export class PredictionManager {
  constructor() {
    this.currentPrediction = null;
    this.predictionWindow = 60000; // 1 minute
  }

  /**
   * Show prediction modal
   * @returns {Promise} - Resolves with prediction result
   */
  async showPredictionModal(userAddress, getCurrentPrice) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'prediction-modal';
      modal.style.cssText =
        'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.95); display: flex; justify-content: center; align-items: center; z-index: 9999;';

      const content = document.createElement('div');
      content.className = 'prediction-content';
      content.innerHTML = `
        <div class="timer-display" id="predictionTimer">
          ⏱️ <span id="timerSeconds">60</span>s
        </div>
        
        <div class="prediction-header">
          <div class="prediction-icon">📈</div>
          <h2 class="prediction-title">Price Prediction Game</h2>
          <p class="prediction-subtitle">Predict CELO price in 1 minute for 2x airdrop!</p>
        </div>
        
        <div class="current-price-box" id="currentPriceBox">
          <div class="price-label">Current CELO Price</div>
          <div class="price-value" id="currentPrice">
            <span class="spinner" style="width: 30px; height: 30px;"></span>
          </div>
        </div>
        
        <div class="prediction-info">
          <div class="info-item">
            <span class="info-label">✅ Correct Prediction:</span>
            <span class="info-value" style="color: #10b981;">2x Airdrop!</span>
          </div>
          <div class="info-item">
            <span class="info-label">❌ Wrong Prediction:</span>
            <span class="info-value" style="color: #f59e0b;">0.5x Consolation</span>
          </div>
          <div class="info-item">
            <span class="info-label">⏭️ Skip:</span>
            <span class="info-value" style="color: #94a3b8;">Standard Airdrop</span>
          </div>
        </div>
        
        <div class="prediction-buttons">
          <button class="predict-btn predict-up" id="predictUp" disabled>
            📈 UP
          </button>
          <button class="predict-btn predict-down" id="predictDown" disabled>
            📉 DOWN
          </button>
        </div>
        
        <button class="skip-btn" id="skipPrediction">
          ⏭️ Skip Prediction (Get Standard Airdrop)
        </button>
        
        <div class="user-stats" id="userStatsBox" style="display: none;">
          <div class="stat-box">
            <div class="stat-number" id="statWinRate">--%</div>
            <div class="stat-label">Win Rate</div>
          </div>
          <div class="stat-box">
            <div class="stat-number" id="statStreak">0</div>
            <div class="stat-label">Streak</div>
          </div>
          <div class="stat-box">
            <div class="stat-number" id="statTotal">0</div>
            <div class="stat-label">Total</div>
          </div>
        </div>
      `;

      modal.appendChild(content);
      document.body.appendChild(modal);

      let currentPrice = null;
      let timestamp = null;
      let timerInterval = null;

      const cleanup = () => {
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        modal.remove();
      };

      // Fetch current price and user stats
      (async () => {
        try {
          const priceData = await getCurrentPrice();
          currentPrice = priceData.price;
          timestamp = Date.now();

          const priceElement = document.getElementById('currentPrice');
          priceElement.innerHTML = `$${currentPrice.toFixed(4)}`;

          // Enable buttons
          const upBtn = document.getElementById('predictUp');
          const downBtn = document.getElementById('predictDown');
          if (upBtn) upBtn.disabled = false;
          if (downBtn) downBtn.disabled = false;

          // Start countdown
          let timeLeft = 60;
          const timerSecondsEl = document.getElementById('timerSeconds');
          const timerDisplay = document.getElementById('predictionTimer');

          timerInterval = setInterval(() => {
            timeLeft--;
            if (timerSecondsEl) timerSecondsEl.textContent = timeLeft;

            // Urgent styling in last 10 seconds
            if (timeLeft <= 10 && timerDisplay) {
              timerDisplay.classList.add('timer-urgent');
            }

            if (timeLeft <= 0) {
              clearInterval(timerInterval);
              timerInterval = null;
              // Auto-skip when timer runs out
              cleanup();
              resolve({ skip: true, reason: 'timeout' });
            }
          }, 1000);

          // Fetch user stats
          if (userAddress) {
            try {
              const stats = await apiClient.getUserStats(userAddress);
              document.getElementById('statWinRate').textContent = `${stats.winRate || 0}%`;
              document.getElementById('statStreak').textContent = stats.currentStreak || 0;
              document.getElementById('statTotal').textContent = stats.totalPredictions || 0;
              document.getElementById('userStatsBox').style.display = 'grid';
            } catch (error) {
              console.log('Could not fetch user stats:', error);
            }
          }
        } catch (error) {
          console.error('Failed to fetch price:', error);
          cleanup();
          resolve({ skip: true });
        }
      })();

      // Handle prediction
      const handlePrediction = async (prediction) => {
        try {
          if (!currentPrice || !timestamp) {
            throw new Error('Price not loaded yet');
          }

          // Store prediction
          await apiClient.storePrediction(userAddress, currentPrice, prediction, timestamp);

          // Calculate remaining time
          const elapsedTime = Date.now() - timestamp;
          const remainingTime = Math.max(0, this.predictionWindow - elapsedTime);

          cleanup();
          resolve({
            skip: false,
            prediction,
            timestamp,
            startPrice: currentPrice,
            timeLeft: remainingTime,
          });
        } catch (error) {
          console.error('Prediction error:', error);
          cleanup();
          resolve({ skip: true });
        }
      };

      // Event listeners
      document.getElementById('predictUp').onclick = () => handlePrediction('up');
      document.getElementById('predictDown').onclick = () => handlePrediction('down');
      document.getElementById('skipPrediction').onclick = () => {
        cleanup();
        resolve({ skip: true });
      };

      // Click outside to close
      modal.onclick = (e) => {
        if (e.target === modal) {
          cleanup();
          resolve({ skip: true });
        }
      };
    });
  }

  /**
   * Verify prediction after time window
   * Mirrors main.old.js behavior: try backend verification, then fallback client-side.
   */
  async verifyPrediction(userAddress, predictionData, getCurrentPrice) {
    try {
      const priceData = await getCurrentPrice();
      const newPrice = priceData.price;

      console.log('Verifying prediction:', {
        userAddress,
        timestamp: predictionData.timestamp,
        newPrice,
      });

      // Try API verification first
      try {
        const result = await apiClient.verifyPrediction(
          userAddress,
          predictionData.timestamp,
          newPrice
        );
        if (result.success) {
          return result;
        }
      } catch (apiError) {
        console.warn('API verification failed, using client-side:', apiError);
      }

      // Fallback: client-side verification using local prediction data
      return this.clientSideVerification(predictionData, newPrice);
    } catch (error) {
      console.error('Prediction verification failed:', error);
      throw error;
    }
  }

  /**
   * Client-side prediction verification (fallback)
   * Uses the same rules as in main.old.js (2x for correct, 0.5x for wrong).
   */
  clientSideVerification(predictionData, newPrice) {
    const priceChange = newPrice - predictionData.startPrice;
    const predictedUp = predictionData.prediction === 'up';
    const actuallyWentUp = priceChange > 0;
    const correct = predictedUp === actuallyWentUp;
    const multiplier = correct ? 2 : 0.5;

    return {
      success: true,
      correct,
      prediction: predictionData.prediction,
      startPrice: predictionData.startPrice,
      endPrice: newPrice,
      priceChange: priceChange.toFixed(4),
      priceChangePercent: ((priceChange / predictionData.startPrice) * 100).toFixed(2),
      multiplier,
      stats: null,
    };
  }

  /**
   * Show prediction result popup after airdrop
   */
  showPredictionResultPopup(verifyResult, airdropResult) {
    console.log('showPredictionResultPopup called with:', { verifyResult, airdropResult });
    
    // Validate required data
    if (!verifyResult || !airdropResult) {
      console.error('Missing required data for popup:', { verifyResult, airdropResult });
      return;
    }
    
    const isCorrect = verifyResult.correct || false;
    const priceChange = parseFloat(verifyResult.priceChange || 0);
    const multiplier = verifyResult.multiplier || 1;
    const airdropAmount = airdropResult.amount || '0';
    
    const startPrice = parseFloat(verifyResult.startPrice) || 0;
    const endPrice = parseFloat(verifyResult.endPrice) || 0;
    const prediction = verifyResult.prediction || 'unknown';
    const priceChangePercent = verifyResult.priceChangePercent || '0';
    
    console.log('Popup data parsed:', { isCorrect, priceChange, multiplier, airdropAmount, startPrice, endPrice, prediction, priceChangePercent });
    
    const modal = document.createElement('div');
    modal.className = 'prediction-result-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      animation: fadeIn 0.3s;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: linear-gradient(135deg, ${isCorrect ? '#1e3a2f 0%, #0f1f1a 100%' : '#3a2e1e 0%, #1f1a0f 100%'});
      padding: 20px;
      border-radius: 12px;
      max-width: 380px;
      width: 90%;
      border: 3px solid ${isCorrect ? '#10b981' : '#f59e0b'};
      box-shadow: 0 0 40px ${isCorrect ? 'rgba(16, 185, 129, 0.5)' : 'rgba(245, 158, 11, 0.5)'};
      animation: popIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      text-align: center;
      max-height: 90vh;
      overflow-y: auto;
    `;
    
    // Check if there are any bonuses
    const hasLucky = airdropResult.luckyMultiplier && airdropResult.luckyMultiplier > 1;
    const hasRarity = airdropResult.rarityMultiplier && airdropResult.rarityMultiplier > 1;
    const hasBonuses = hasLucky || hasRarity || airdropResult.bonusMessages;
    const isSkipped = prediction === 'skipped' || !verifyResult.stats;
    
    content.innerHTML = `
      <div style="font-size: 3rem; margin-bottom: 10px;">
        ${isSkipped ? '🎁' : (isCorrect ? '✅' : '🎲')}
      </div>
      
      <h2 style="color: ${isSkipped ? '#fbbf24' : (isCorrect ? '#10b981' : '#f59e0b')}; margin: 0 0 8px 0; font-size: 1.4rem;">
        ${isSkipped ? 'BONUS AIRDROP!' : (isCorrect ? 'CORRECT PREDICTION!' : 'WRONG PREDICTION')}
      </h2>
      
      ${!isSkipped ? `
        <div style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 14px;">
          ${prediction.toUpperCase()}: $${startPrice.toFixed(4)} → $${endPrice.toFixed(4)}
          <br>
          <span style="color: ${priceChange > 0 ? '#10b981' : '#ef4444'}; font-weight: 600;">
            ${priceChange > 0 ? '+' : ''}$${Math.abs(priceChange).toFixed(4)} (${priceChangePercent}%)
          </span>
        </div>
      ` : ''}
      
      <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: 10px; margin: 14px 0; border: 1px solid #334155;">
        <div style="color: #94a3b8; font-size: 0.85rem; margin-bottom: 8px;">💰 Airdrop Breakdown</div>
        
        <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #e2e8f0; font-size: 0.85rem;">
          <span>Base Amount:</span>
          <span style="color: #94a3b8; font-weight: bold;">${airdropResult.baseAmount || '0.01'} CELO</span>
        </div>
        
        ${!isSkipped ? `
          <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #e2e8f0; font-size: 0.85rem;">
            <span>Prediction ${isCorrect ? 'Bonus' : 'Penalty'}:</span>
            <span style="color: ${isCorrect ? '#10b981' : '#f59e0b'}; font-weight: bold;">${multiplier}x</span>
          </div>
        ` : ''}
        
        ${hasLucky ? `
          <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #e2e8f0; font-size: 0.85rem;">
            <span>🍀 Lucky Bonus:</span>
            <span style="color: #fbbf24; font-weight: bold;">${airdropResult.luckyMultiplier}x</span>
          </div>
        ` : ''}
        
        ${hasRarity ? `
          <div style="display: flex; justify-content: space-between; margin: 6px 0; color: #e2e8f0; font-size: 0.85rem;">
            <span>✨ ${airdropResult.rarity || 'Rarity'}:</span>
            <span style="color: #a855f7; font-weight: bold;">${airdropResult.rarityMultiplier}x</span>
          </div>
        ` : ''}
        
        <div style="border-top: 2px solid #334155; margin: 10px 0; padding-top: 10px;">
          <div style="font-size: 0.95rem; color: #94a3b8;">Total Airdrop</div>
          <div style="font-size: 2rem; font-weight: bold; color: ${hasBonuses ? '#fbbf24' : (isCorrect ? '#10b981' : '#f59e0b')}; margin-top: 4px;">
            ${airdropAmount} CELO
          </div>
        </div>
      </div>
      
      ${hasBonuses && airdropResult.bonusMessages && airdropResult.bonusMessages.length > 0 ? `
        <div style="background: rgba(251, 191, 36, 0.1); padding: 12px; border-radius: 8px; margin: 14px 0; border: 1px solid rgba(251, 191, 36, 0.3);">
          <div style="color: #fbbf24; font-size: 0.85rem; font-weight: 600; margin-bottom: 8px;">🎯 Bonus Details:</div>
          <div style="display: flex; flex-direction: column; gap: 4px; color: #e2e8f0; font-size: 0.75rem; text-align: left;">
            ${airdropResult.bonusMessages.map(msg => `<div>✨ ${msg}</div>`).join('')}
          </div>
        </div>
      ` : ''}
      
      ${verifyResult.stats && !isSkipped ? `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0;">
          <div style="background: rgba(15, 23, 42, 0.4); padding: 8px; border-radius: 6px; border: 1px solid #334155;">
            <div style="font-size: 1.1rem; font-weight: bold; color: #49dfb5;">${verifyResult.stats.winRate}%</div>
            <div style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase;">Win Rate</div>
          </div>
          <div style="background: rgba(15, 23, 42, 0.4); padding: 8px; border-radius: 6px; border: 1px solid #334155;">
            <div style="font-size: 1.1rem; font-weight: bold; color: #49dfb5;">${verifyResult.stats.currentStreak}</div>
            <div style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase;">Streak</div>
          </div>
          <div style="background: rgba(15, 23, 42, 0.4); padding: 8px; border-radius: 6px; border: 1px solid #334155;">
            <div style="font-size: 1.1rem; font-weight: bold; color: #49dfb5;">${verifyResult.stats.totalPredictions}</div>
            <div style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase;">Total</div>
          </div>
        </div>
      ` : ''}
      
      <button id="closePredictionResult" style="
        width: 100%;
        padding: 10px;
        background: linear-gradient(90deg, #49dfb5, #10b981);
        color: #0f0f0f;
        border: none;
        border-radius: 8px;
        font-size: 0.95rem;
        font-weight: bold;
        cursor: pointer;
        font-family: 'Orbitron', sans-serif;
        margin-top: 8px;
      ">
        ${hasBonuses ? '🎉 Amazing!' : (isCorrect ? '🎉 Awesome!' : '👍 Got It!')}
      </button>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    console.log('Popup created and added to DOM');
    
    // Trigger confetti for correct predictions or bonuses
    if (isCorrect || hasBonuses) {
      setTimeout(() => {
        confetti({
          particleCount: hasBonuses ? 200 : 150,
          spread: hasBonuses ? 140 : 120,
          origin: { y: 0.6 },
          colors: hasBonuses 
            ? ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f59e0b']
            : ['#10b981', '#34d399', '#6ee7b7', '#fbbf24']
        });
      }, 300);
    }
    
    // Close button
    document.getElementById('closePredictionResult').onclick = () => {
      modal.style.animation = 'fadeOut 0.3s';
      setTimeout(() => modal.remove(), 300);
    };
    
    // Click outside to close
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.style.animation = 'fadeOut 0.3s';
        setTimeout(() => modal.remove(), 300);
      }
    };
  }
}