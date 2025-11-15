/**
 * Predictions Module - FIXED TIMER VERSION
 * ✅ FIX: Timer cleanup, urgent styling, auto-skip on timeout
 */

import { apiClient } from './api-client.js';
import confetti from 'canvas-confetti';

export class PredictionManager {
  constructor() {
    this.currentPrediction = null;
    this.predictionWindow = 60000; // 1 minute
  }

  async showPredictionModal(userAddress, getCurrentPrice) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'prediction-modal';
      modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.95); display: flex; justify-content: center; align-items: center; z-index: 9999;';

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
        
        <div class="current-price-box">
          <div class="price-label">Current CELO Price</div>
          <div class="price-value" id="currentPrice">
            <span class="spinner" style="width: 30px; height: 30px;"></span>
          </div>
        </div>
        
        <div class="prediction-info">
          <div class="info-item">
            <span class="info-label">✅ Correct:</span>
            <span class="info-value" style="color: #10b981;">2x Airdrop!</span>
          </div>
          <div class="info-item">
            <span class="info-label">❌ Wrong:</span>
            <span class="info-value" style="color: #f59e0b;">0.5x Prize</span>
          </div>
          <div class="info-item">
            <span class="info-label">⏭️ Skip:</span>
            <span class="info-value" style="color: #94a3b8;">Standard</span>
          </div>
        </div>
        
        <div class="prediction-buttons">
          <button class="predict-btn predict-up" id="predictUp" disabled>📈 UP</button>
          <button class="predict-btn predict-down" id="predictDown" disabled>📉 DOWN</button>
        </div>
        
        <button class="skip-btn" id="skipPrediction">⏭️ Skip Prediction</button>
        
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

      // ✅ FIX: Proper cleanup with null check
      const cleanup = () => {
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null; // ✅ CRITICAL
        }
        modal.remove();
      };

      // Fetch price and start timer
      (async () => {
        try {
          const priceData = await getCurrentPrice();
          currentPrice = priceData.price;
          timestamp = Date.now();

          document.getElementById('currentPrice').innerHTML = `$${currentPrice.toFixed(4)}`;
          document.getElementById('predictUp').disabled = false;
          document.getElementById('predictDown').disabled = false;

          // ✅ FIX: Timer with urgent styling and auto-skip
          let timeLeft = 60;
          const timerSecondsEl = document.getElementById('timerSeconds');
          const timerDisplay = document.getElementById('predictionTimer');

          timerInterval = setInterval(() => {
            timeLeft--;
            if (timerSecondsEl) timerSecondsEl.textContent = timeLeft;

            // ✅ ADD URGENT STYLING
            if (timeLeft <= 10 && timerDisplay) {
              timerDisplay.classList.add('timer-urgent');
            }

            // ✅ AUTO-SKIP ON TIMEOUT
            if (timeLeft <= 0) {
              clearInterval(timerInterval);
              timerInterval = null;
              cleanup();
              resolve({ skip: true, reason: 'timeout' });
            }
          }, 1000);

          // Fetch stats
          if (userAddress) {
            try {
              const stats = await apiClient.getUserStats(userAddress);
              document.getElementById('statWinRate').textContent = `${stats.winRate || 0}%`;
              document.getElementById('statStreak').textContent = stats.currentStreak || 0;
              document.getElementById('statTotal').textContent = stats.totalPredictions || 0;
              document.getElementById('userStatsBox').style.display = 'grid';
            } catch (e) {
              console.log('Stats fetch failed:', e);
            }
          }
        } catch (error) {
          console.error('Price fetch failed:', error);
          cleanup();
          resolve({ skip: true });
        }
      })();

      // Handle prediction
      const handlePrediction = async (prediction) => {
        try {
          if (!currentPrice || !timestamp) {
            throw new Error('Price not ready');
          }

          await apiClient.storePrediction(userAddress, currentPrice, prediction, timestamp);

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
   * Verify prediction (API then fallback)
   */
  async verifyPrediction(userAddress, predictionData, getCurrentPrice) {
    try {
      const priceData = await getCurrentPrice();
      const newPrice = priceData.price;

      // Try API first
      try {
        const result = await apiClient.verifyPrediction(
          userAddress,
          predictionData.timestamp,
          newPrice
        );
        if (result.success) return result;
      } catch (apiError) {
        console.warn('API failed, using client-side:', apiError);
      }

      // Fallback
      return this.clientSideVerification(predictionData, newPrice);
    } catch (error) {
      console.error('Verification failed:', error);
      throw error;
    }
  }

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

  // (showPredictionResultPopup stays the same - already in your files)
  showPredictionResultPopup(verifyResult, airdropResult) {
    // ... existing implementation from your lib/predictions.js ...
    // (Too long to repeat here - use the one from document index 38)
  }
}
