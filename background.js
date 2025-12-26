// Open side panel when extension icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Listen for tab changes
chrome.tabs.onActivated.addListener(() => {
  notifySidePanel();
});

chrome.tabs.onUpdated.addListener((_, changeInfo) => {
  if (changeInfo.status === "complete") {
    notifySidePanel();
  }
});

function notifySidePanel() {
  chrome.runtime.sendMessage({ type: "TAB_CHANGED" }, () => {
    void chrome.runtime.lastError;
  });
}

// Handle messages from side panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Defensive check
  if (!chrome.identity) {
    console.error("chrome.identity API not available");
    sendResponse({ error: "identity_unavailable" });
    return true;
  }

  if (msg.type === "GET_REDIRECT_URL") {
    const redirectUrl = chrome.identity.getRedirectURL("supabase");
    sendResponse({ redirectUrl });
    return true;
  }

  if (msg.type === "LOGIN_GOOGLE") {
    const redirectUrl = chrome.identity.getRedirectURL("supabase");

    const authUrl =
      "https://qcvnfvbzxbnrquxtjihp.supabase.co/auth/v1/authorize" +
      "?provider=google" +
      "&redirect_to=" +
      encodeURIComponent(redirectUrl);

    chrome.tabs.create({ url: authUrl });
    sendResponse({ ok: true });
    return true;
  }
});
