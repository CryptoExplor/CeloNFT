import { setStatus } from './utils.js';

class GiftManager {
  constructor(mintingManager, safeLocalStorage) {
    this.mintingManager = mintingManager;
    this.safeLocalStorage = safeLocalStorage;
    this.giftModal = null;
  }

  showGiftModal(tokenId) {
    if (!tokenId) {
      setStatus('No token ID provided for gifting', 'error');
      return;
    }

    // Create or show the gift modal
    this.createGiftModal(tokenId);
    this.giftModal.style.display = 'block';
  }

  createGiftModal(tokenId) {
    // If modal already exists, update it
    if (this.giftModal) {
      this.updateGiftModalContent(tokenId);
      return;
    }

    // Create the modal HTML
    this.giftModal = document.createElement('div');
    this.giftModal.className = 'modal';
    this.giftModal.id = 'giftModal';
    this.giftModal.innerHTML = `
      <div class="modal-content">
        <span class="close">&times;</span>
        <h2>Gift NFT #${tokenId}</h2>
        <form id="giftForm">
          <div class="form-group">
            <label for="recipientAddress">Recipient Address:</label>
            <input type="text" id="recipientAddress" placeholder="0x..." required>
          </div>
          <div class="form-group">
            <label for="giftMessage">Message (Optional):</label>
            <textarea id="giftMessage" placeholder="A special message for the recipient"></textarea>
          </div>
          <button type="submit" class="btn-primary">Gift NFT</button>
        </form>
      </div>
    `;

    document.body.appendChild(this.giftModal);

    // Add event listeners
    const closeBtn = this.giftModal.querySelector('.close');
    closeBtn.addEventListener('click', () => {
      this.giftModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
      if (event.target === this.giftModal) {
        this.giftModal.style.display = 'none';
      }
    });

    const form = this.giftModal.querySelector('#giftForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const recipient = document.getElementById('recipientAddress').value;
      const message = document.getElementById('giftMessage').value;
      await this.giftNFT(tokenId, recipient, message);
    });

    this.updateGiftModalContent(tokenId);
  }

  updateGiftModalContent(tokenId) {
    const title = this.giftModal.querySelector('h2');
    if (title) {
      title.textContent = `Gift NFT #${tokenId}`;
    }
  }

  async giftNFT(tokenId, recipient, message) {
    try {
      // Validate recipient address
      if (!recipient || !recipient.startsWith('0x') || recipient.length !== 42) {
        setStatus('Please enter a valid recipient address', 'error');
        return;
      }

      // Get current user address
      const userAddress = this.mintingManager.wagmiConfig.publicClient.account?.address;
      if (!userAddress) {
        throw new Error('No wallet connected');
      }

      setStatus(`Gifting NFT #${tokenId} to ${recipient}...`, 'info');

      // Transfer NFT using minting manager
      const result = await this.mintingManager.transfer(userAddress, recipient, tokenId);
      
      // Save to gift history
      const gifts = JSON.parse(this.safeLocalStorage.getItem('giftHistory') || '[]');
      gifts.unshift({
        tokenId,
        recipient,
        message,
        timestamp: Date.now(),
        txHash: result.hash
      });
      this.safeLocalStorage.setItem('giftHistory', JSON.stringify(gifts));

      setStatus(`✅ NFT #${tokenId} gifted successfully!`, 'success');
      this.giftModal.style.display = 'none';

      // You might want to trigger some UI updates here
    } catch (error) {
      console.error('Error gifting NFT:', error);
      setStatus(`Failed to gift NFT: ${error.message}`, 'error');
    }
  }

  hideGiftModal() {
    if (this.giftModal) {
      this.giftModal.style.display = 'none';
    }
  }
}

export default GiftManager;