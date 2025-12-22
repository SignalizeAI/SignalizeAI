async function getCurrentTabDomain() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]?.url) return "—";

  try {
    const url = new URL(tabs[0].url);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return "—";
  }
}

async function updateWebsite() {
  const el = document.getElementById("website");
  if (!el) return;

  const domain = await getCurrentTabDomain();
  el.textContent = domain;
}

// Initial load
document.addEventListener("DOMContentLoaded", updateWebsite);

// Listen for background notifications
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TAB_CHANGED") {
    updateWebsite();
  }
});
