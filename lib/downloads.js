import { getNFTMetadata, setStatus, downloadSVGFile, downloadPNGFile, copyImageToClipboard, shareToTwitter } from './utils.js';

class DownloadManager {
  constructor() {
    this.currentNFTData = null;
  }

  async downloadSVGFile(tokenId) {
    if (!tokenId) {
      throw new Error('No token ID provided for download');
    }

    try {
      const metadata = await getNFTMetadata(tokenId);
      const svgContent = this.generateSVGWithMetadata(metadata, tokenId);
      
      const success = await downloadSVGFile(svgContent, tokenId);
      if (!success) {
        throw new Error('Failed to download SVG file');
      }
      
      return 'SVG downloaded successfully!';
    } catch (error) {
      console.error('Error downloading SVG:', error);
      throw new Error(`Failed to download SVG: ${error.message}`);
    }
  }

  async downloadPNGFile(tokenId) {
    if (!tokenId) {
      throw new Error('No token ID provided for download');
    }

    try {
      const metadata = await getNFTMetadata(tokenId);
      const svgContent = this.generateSVGWithMetadata(metadata, tokenId);
      
      const success = await downloadPNGFile(svgContent, tokenId);
      if (!success) {
        throw new Error('Failed to download PNG file');
      }
      
      return 'PNG downloaded successfully!';
    } catch (error) {
      console.error('Error downloading PNG:', error);
      throw new Error(`Failed to download PNG: ${error.message}`);
    }
  }

  async copyImageToClipboard() {
    try {
      if (!this.currentNFTData || !this.currentNFTData.svg) {
        throw new Error('No NFT data available for copying');
      }
      
      const success = await copyImageToClipboard(this.currentNFTData.svg);
      if (!success) {
        throw new Error('Failed to copy image to clipboard');
      }
      
      return 'Image copied to clipboard successfully!';
    } catch (error) {
      console.error('Error copying image to clipboard:', error);
      throw new Error(`Failed to copy image: ${error.message}`);
    }
  }

  shareToTwitter(airdropAmount) {
    try {
      // Share to Twitter functionality
      const text = airdropAmount 
        ? `Just won ${airdropAmount} CELO from my CeloNFT prediction! Mint yours at celonft.fun`
        : `Just minted a unique CeloNFT! Get yours at celonft.fun`;
      
      shareToTwitter(text, 'https://celonft.fun', ['CeloNFT', 'CELO']);
      return 'Opening Twitter...';
    } catch (error) {
      console.error('Error sharing to Twitter:', error);
      throw new Error(`Failed to share to Twitter: ${error.message}`);
    }
  }

  generateSVGWithMetadata(metadata, tokenId) {
    // If metadata contains SVG data, use that; otherwise generate a basic SVG
    if (metadata && metadata.image) {
      // Handle data URI
      if (metadata.image.startsWith('data:image/svg+xml;base64,')) {
        const base64Data = metadata.image.split(',')[1];
        return atob(base64Data);
      }
      // Handle regular SVG URL
      else if (metadata.image.endsWith('.svg')) {
        // In a real implementation, you'd fetch the SVG content
        // For now, we'll return a basic SVG
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="500" fill="#f0f0f0"/>
  <text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle" dy=".3em">
    CeloNFT #${tokenId}
  </text>
  <text x="50%" y="60%" font-family="Arial" font-size="16" text-anchor="middle">
    ${metadata.name || 'Unnamed NFT'}
  </text>
</svg>`;
      }
    }
    
    // Fallback to basic SVG
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="500" height="500" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
  <rect width="500" height="500" fill="#f0f0f0"/>
  <text x="50%" y="50%" font-family="Arial" font-size="20" text-anchor="middle" dy=".3em">
    CeloNFT #${tokenId}
  </text>
  <text x="50%" y="60%" font-family="Arial" font-size="16" text-anchor="middle">
    ${metadata && metadata.name ? metadata.name : 'Unnamed NFT'}
  </text>
</svg>`;
  }

  setCurrentNFTData(data) {
    this.currentNFTData = data;
  }
}

export default DownloadManager;