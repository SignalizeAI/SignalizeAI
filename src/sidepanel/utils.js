/**
 * Get the active tab in a cross-browser compatible way.
 * Firefox sidebars need special handling because currentWindow: true
 * doesn't work the same way as Chrome side panels.
 */
export async function getActiveTab() {
  let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tabs || tabs.length === 0 || !tabs[0]?.url) {
    tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }
  
  if (!tabs || tabs.length === 0 || !tabs[0]?.url) {
    tabs = await chrome.tabs.query({ active: true });
  }
  
  return tabs[0] || null;
}

/**
 * Ensure content script is loaded in the tab before sending messages.
 * Firefox MV3 sometimes doesn't persist content scripts reliably.
 */
export async function ensureContentScriptLoaded(tabId) {
  if (!tabId) return false;

  try {
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { type: '__PING__' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });

    if (response?.ok) {
      return true;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-extractor.js'],
    });

    return true;
  } catch (err) {
    console.error('Failed to ensure content script:', err);
    return false;
  }
}
