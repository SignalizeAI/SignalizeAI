const WEBSITE_HOSTS = new Set(['signalizeai.org', 'www.signalizeai.org', 'localhost', '127.0.0.1']);

function isMatchingProspectUrl(url: string, savedId: string): boolean {
  try {
    const parsed = new URL(url);
    if (!WEBSITE_HOSTS.has(parsed.hostname)) return false;
    return parsed.pathname === `/prospect/${savedId}`;
  } catch {
    return false;
  }
}

export async function syncProspectStatusToWebsite(savedId: string, status: string): Promise<void> {
  const message = {
    type: 'SYNC_PROSPECT_STATUS_TO_PAGE',
    savedId,
    status,
  };
  const tabs = await chrome.tabs.query({});
  const targetTabs = tabs.filter(
    (tab) => tab.id && tab.url && isMatchingProspectUrl(tab.url, savedId)
  );

  await Promise.all(
    targetTabs.map(async (tab) => {
      const wasDelivered = await new Promise<boolean>((resolve) => {
        chrome.tabs.sendMessage(tab.id!, message, () => {
          resolve(!chrome.runtime.lastError);
        });
      });

      if (wasDelivered) return;

      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          files: ['extension/content-auth-bridge.js'],
        });
      } catch (error) {
        console.error('Failed to inject website bridge:', error);
        return;
      }

      chrome.tabs.sendMessage(tab.id!, message, () => {
        void chrome.runtime.lastError;
      });
    })
  );
}
