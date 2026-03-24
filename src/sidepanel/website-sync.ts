const WEBSITE_HOSTS = new Set(['signalizeai.org', 'www.signalizeai.org', 'localhost', '127.0.0.1']);

function isWebsiteUrl(url: string): boolean {
  try {
    return WEBSITE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export async function broadcastToWebsiteTabs(message: Record<string, unknown>): Promise<void> {
  const tabs = await chrome.tabs.query({});
  const websiteTabs = tabs.filter((tab) => tab.id && tab.url && isWebsiteUrl(tab.url));

  await Promise.all(
    websiteTabs.map(async (tab) => {
      chrome.tabs.sendMessage(tab.id!, message, () => {
        if (!chrome.runtime.lastError) return;
        chrome.scripting
          .executeScript({
            target: { tabId: tab.id! },
            files: ['extension/content-auth-bridge.js'],
          })
          .then(() => {
            chrome.tabs.sendMessage(tab.id!, message, () => {
              void chrome.runtime.lastError;
            });
          })
          .catch(() => {});
      });
    })
  );
}
