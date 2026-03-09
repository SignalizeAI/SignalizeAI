// Open side panel when extension icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

// Notify side panel when active tab changes
chrome.tabs.onActivated.addListener(() => {
  notifySidePanel();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    notifySidePanel();

    if (tab.url) {
      const url = tab.url.toLowerCase();
      if (
        url.includes('signalizeai.org/payment-success') ||
        (url.includes('checkout') && url.includes('success')) ||
        url.includes('payment-success')
      ) {
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'PAYMENT_SUCCESS' }, () => {
            void chrome.runtime.lastError;
          });
        }, 1000);
      }
    }
  }
});

function notifySidePanel(): void {
  chrome.runtime.sendMessage({ type: 'TAB_CHANGED' }, () => {
    void chrome.runtime.lastError;
  });
}

async function handleBgFetchText(url: string, timeoutMs: number = 30000) {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
    },
    timeoutMs
  );
  const text = await res.text();
  return { ok: true, status: res.status, text };
}

async function handleBgAnalyze(
  apiBaseUrl: string,
  token: string | null,
  payload: any,
  timeoutMs: number = 45000
) {
  const res = await fetchWithTimeout(
    `${apiBaseUrl}/analyze`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: 'omit',
    },
    timeoutMs
  );

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return { ok: true, status: res.status, parseError: 'invalid_json', raw: text };
  }

  return { ok: true, status: res.status, data };
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// Handle messages from side panel and website
chrome.runtime.onMessage.addListener(
  (msg: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    // Start Google OAuth login
    if (msg.type === 'LOGIN_GOOGLE') {
      const authUrl =
        'https://qcvnfvbzxbnrquxtjihp.supabase.co/auth/v1/authorize' +
        '?provider=google' +
        '&redirect_to=' +
        encodeURIComponent('https://signalizeai.org/auth/callback');

      chrome.tabs.create({ url: authUrl });

      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'AUTH_SUCCESS_FROM_WEBSITE') {
      if (!msg.session?.access_token || !msg.session?.refresh_token) {
        console.error('Missing session in AUTH_SUCCESS_FROM_WEBSITE');
        return;
      }

      chrome.storage.local.set({ supabaseSession: msg.session }, () => {
        chrome.runtime.sendMessage({ type: 'SESSION_UPDATED' });
      });
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'BG_FETCH_TEXT') {
      (async () => {
        try {
          sendResponse(await handleBgFetchText(msg.url, Number(msg.timeoutMs) || 30000));
        } catch (err: any) {
          sendResponse({ ok: false, error: String(err?.message || err || 'Fetch failed') });
        }
      })();
      return true;
    }

    if (msg.type === 'BG_ANALYZE') {
      (async () => {
        try {
          sendResponse(
            await handleBgAnalyze(
              msg.apiBaseUrl,
              msg.token || null,
              msg.payload,
              Number(msg.timeoutMs) || 45000
            )
          );
        } catch (err: any) {
          sendResponse({ ok: false, error: String(err?.message || err || 'Analyze failed') });
        }
      })();
      return true;
    }

    return false;
  }
);
