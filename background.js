// Open side panel when extension icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Notify side panel when active tab changes
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

// Handle messages from side panel and website
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Start Google OAuth login
  if (msg.type === "LOGIN_GOOGLE") {
    const authUrl =
      "https://qcvnfvbzxbnrquxtjihp.supabase.co/auth/v1/authorize" +
      "?provider=google" +
      "&redirect_to=" +
      encodeURIComponent("https://signalizeai.org/auth/callback");

    chrome.tabs.create({ url: authUrl });

    sendResponse({ ok: true });
    return true;
  }

    if (msg.type === "AUTH_SUCCESS_FROM_WEBSITE") {
      if (!msg.session?.access_token || !msg.session?.refresh_token) {
        console.error("Missing session in AUTH_SUCCESS_FROM_WEBSITE");
        return;
      }

      chrome.storage.local.set(
        { supabaseSession: msg.session },
        () => {
          chrome.runtime.sendMessage({ type: "SESSION_UPDATED" });
        }
      );
    sendResponse({ ok: true });
    return true;
  }
});
