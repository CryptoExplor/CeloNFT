/**
 * Farcaster Integration Module
 * Handles Farcaster SDK initialization, detection, and cast composition
 * Reusable across different Farcaster mini apps
 */

import { sdk } from '@farcaster/miniapp-sdk';

/**
 * Improved Farcaster detection with timeout
 */
export async function isFarcasterEmbed() {
  return Promise.race([
    (async () => {
      const isIframe = window.self !== window.top;
      const hasSDK = typeof sdk !== 'undefined';

      if (!isIframe || !hasSDK) return false;

      await new Promise((resolve) => setTimeout(resolve, 100));
      const isSdkReady = sdk.context !== undefined && sdk.context !== null;

      const checks = {
        isIframe,
        hasSDK,
        isSdkReady,
        hasValidContext: hasSDK && sdk.context?.user?.fid !== undefined,
      };

      console.log('Farcaster Detection Checks:', checks);

      return isIframe && hasSDK && isSdkReady;
    })(),
    new Promise((resolve) => setTimeout(() => resolve(false), 500)),
  ]);
}

/**
 * Initialize Farcaster SDK
 */
export async function initializeFarcasterSDK() {
  try {
    await sdk.actions.ready({ disableNativeGestures: true });
    console.log('Farcaster SDK initialized successfully');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await sdk.actions.addMiniApp();
    return true;
  } catch (error) {
    console.log('Farcaster SDK not available or failed to initialize:', error);
    return false;
  }
}

/**
 * Create a cast on Farcaster
 * @param {string} text - Cast text content
 * @param {string} embedUrl - URL to embed in the cast
 * @param {boolean} isFarcasterEnv - Whether running in Farcaster environment
 * @param {Function} setStatus - Status callback function
 */
export async function createCast(text, embedUrl, isFarcasterEnv, setStatus) {
  if (isFarcasterEnv && sdk?.actions?.composeCast) {
    try {
      setStatus('Opening cast composer... 📝', 'info');

      const result = await sdk.actions.composeCast({
        text: text,
        embeds: [embedUrl],
      });

      if (result?.cast) {
        setStatus(`✅ Cast posted! Hash: ${result.cast.hash.slice(0, 10)}...`, 'success');
        console.log('Cast hash:', result.cast.hash);
        if (result.cast.channelKey) {
          console.log('Posted to channel:', result.cast.channelKey);
        }
        return result;
      } else {
        setStatus('Cast cancelled', 'info');
        return null;
      }
    } catch (error) {
      console.error('Cast failed:', error);
      setStatus('Failed to create cast. Please try again.', 'error');
      throw error;
    }
  } else {
    // Fallback to Warpcast web
    const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(
      text
    )}&embeds[]=${encodeURIComponent(embedUrl)}`;
    const popup = window.open(warpcastUrl, '_blank', 'width=600,height=700');

    if (popup) {
      setStatus('Opening Warpcast composer...', 'success');
    } else {
      setStatus('Please allow popups to share on Warpcast', 'warning');
    }
  }
}

/**
 * Prompt user to add mini app
 */
export async function promptAddMiniApp(storageKey = 'hasPromptedAddApp') {
  try {
    const hasPrompted = localStorage.getItem(storageKey);
    if (!hasPrompted && sdk?.actions?.addMiniApp) {
      await sdk.actions.addMiniApp();
      localStorage.setItem(storageKey, 'true');
      return true;
    }
  } catch (error) {
    console.log('Add mini app prompt declined or failed:', error);
  }
  return false;
}

/**
 * Get Farcaster user context
 */
export function getFarcasterUser() {
  try {
    return sdk?.context?.user || null;
  } catch (error) {
    console.error('Failed to get Farcaster user:', error);
    return null;
  }
}

export { sdk };
