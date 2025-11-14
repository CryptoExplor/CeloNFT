/**
 * Utility Functions
 * Shared helper functions used across modules
 * Reusable in any JavaScript application
 */

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

/**
 * Format time ago
 */
export function getTimeAgo(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format time ago (alias for backwards compatibility)
 */
export function formatTimeAgo(ms) {
  return getTimeAgo(ms);
}

/**
 * Animate counter
 */
export function animateCounter(element, start, end, duration = 1000) {
  if (!element) return;
  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;

  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
      element.textContent = end;
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current);
    }
  }, 16);
}

/**
 * Enhanced SVG sanitization
 */
export function sanitizeSVG(svgString) {
  return svgString
    .replace(/<script.*?>.*?<\/script>/gi, '')
    .replace(/<iframe.*?>.*?<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '');
}

/**
 * Adjust injected SVG
 */
export function adjustInjectedSvg(container) {
  const svg = container.querySelector('svg');
  if (svg) {
    if (!svg.hasAttribute('viewBox')) {
      const w = svg.getAttribute('width');
      const h = svg.getAttribute('height');
      if (w && h) {
        const W = parseFloat(w);
        const H = parseFloat(h);
        if (!isNaN(W) && !isNaN(H) && W > 0 && H > 0) {
          svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        }
      }
    }
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxHeight = '60vh';
    svg.style.display = 'block';
  } else {
    const img = container.querySelector('img');
    if (img) {
      img.style.width = '100%';
      img.style.height = 'auto';
      img.style.maxHeight = '60vh';
      img.style.display = 'block';
    }
  }
  container.style.maxHeight = '60vh';
}

/**
 * Download SVG file
 */
export async function downloadSVGFile(svgData, tokenId) {
  try {
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: `celo-nft-${tokenId}.svg`,
          types: [
            {
              description: 'SVG Image',
              accept: { 'image/svg+xml': ['.svg'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (error) {
        if (error.name === 'AbortError') {
          // User cancelled - silently return
          return false;
        }
        console.log('File picker failed, using fallback:', error);
      }
    }

    // Fallback download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `celo-nft-${tokenId}.svg`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    return true;
  } catch (error) {
    console.error('SVG download failed:', error);
    return false;
  }
}

/**
 * Download PNG file
 */
export async function downloadPNGFile(svgData, tokenId) {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');

  const img = new Image();
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    return await new Promise((resolve, reject) => {
      img.onload = async () => {
        try {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, 400, 400);
          ctx.drawImage(img, 0, 0, 400, 400);

          canvas.toBlob(async (blob) => {
            if (!blob) {
              reject(new Error('Failed to generate PNG blob'));
              return;
            }

            if (window.showSaveFilePicker) {
              try {
                const handle = await window.showSaveFilePicker({
                  suggestedName: `celo-nft-${tokenId}.png`,
                  types: [
                    {
                      description: 'PNG Image',
                      accept: { 'image/png': ['.png'] },
                    },
                  ],
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                resolve(true);
                return;
              } catch (error) {
                if (error.name === 'AbortError') {
                  // User cancelled - just use fallback
                } else {
                  console.log('File picker failed, using fallback:', error);
                }
              }
            }

            // Fallback download
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = downloadUrl;
            a.download = `celo-nft-${tokenId}.png`;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
              document.body.removeChild(a);
              URL.revokeObjectURL(downloadUrl);
            }, 100);

            resolve(true);
          }, 'image/png', 1.0);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = (error) => {
        console.error('Image load failed:', error);
        reject(new Error('Failed to load SVG image'));
      };

      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Copy image to clipboard
 */
export async function copyImageToClipboard(svgData) {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Copy not supported in this browser');
  }

  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext('2d');

  const img = new Image();
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    return await new Promise((resolve, reject) => {
      img.onload = async () => {
        try {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, 400, 400);
          ctx.drawImage(img, 0, 0, 400, 400);

          canvas.toBlob(async (blob) => {
            if (!blob) {
              reject(new Error('Failed to generate image'));
              return;
            }

            try {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
              resolve(true);
            } catch (error) {
              console.error('Clipboard write failed:', error);
              reject(error);
            }
          }, 'image/png');
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Share to Twitter
 */
export function shareToTwitter(text, url, hashtags = []) {
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    text
  )}&url=${encodeURIComponent(url)}&hashtags=${hashtags.join(',')}`;
  window.open(twitterUrl, '_blank', 'width=550,height=420');
}

/**
 * Get NFT metadata
 */
export async function getNFTMetadata(tokenId) {
  // This is a placeholder implementation
  // In a real implementation, you would fetch the actual metadata from the contract
  return {
    name: `CeloNFT #${tokenId}`,
    description: `A unique CeloNFT with live price snapshot`,
    image: `https://example.com/nft/${tokenId}.svg`,
    tokenId: tokenId
  };
}

/**
 * Set status message in UI
 */
export function setStatus(msg, type = 'info', statusBox = null) {
  const box = statusBox || document.getElementById('statusBox');
  if (!box) return;
  
  box.innerHTML = '';
  let icon = '';
  if (type === 'success') icon = '✅ ';
  else if (type === 'error') icon = '❌ ';
  else if (type === 'warning') icon = '⚠️ ';
  else if (type === 'info') icon = 'ℹ️ ';
  
  box.className = `status-box status-${type}`;
  box.insertAdjacentText('afterbegin', icon + msg);
}
