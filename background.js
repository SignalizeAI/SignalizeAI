// Open side panel when extension icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Listen for tab changes
chrome.tabs.onActivated.addListener(async () => {
  notifySidePanel();
});

chrome.tabs.onUpdated.addListener(async (_, changeInfo) => {
  if (changeInfo.status === "complete") {
    notifySidePanel();
  }
});

function notifySidePanel() {
  chrome.runtime.sendMessage({
    type: "TAB_CHANGED"
  });
}
