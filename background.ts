import { SUPABASE_ANON_KEY, SUPABASE_URL, WEBSITE_BASE_URL } from './src/config.js';
import { refreshActionBadge, runWatchSweep, updateActionBadge } from './src/watch/sweep.js';
import { SWEEP_PERIOD_MINUTES } from './src/watch/plans.js';

import {
  readStoredSession,
  sessionExpiry,
  withSessionLock,
  writeStoredSession,
  type StoredSession as WebsiteSession,
} from './src/auth/session-storage.js';

const WATCH_ALARM = 'watch-sweep';

function ensureWatchAlarm(): void {
  if (!chrome.alarms?.create) return;
  chrome.alarms.get(WATCH_ALARM, (existing) => {
    void chrome.runtime.lastError;
    if (existing) return;
    chrome.alarms.create(WATCH_ALARM, {
      periodInMinutes: SWEEP_PERIOD_MINUTES,
      delayInMinutes: 1,
    });
  });
}

// Open side panel when extension icon is clicked
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
  ensureWatchAlarm();
  void refreshActionBadge();
});

// MV3 service workers are evicted aggressively, so re-register on every start.
chrome.runtime.onStartup?.addListener(() => {
  ensureWatchAlarm();
  void refreshActionBadge();
});

ensureWatchAlarm();

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name !== WATCH_ALARM) return;
  runWatchSweep()
    .then((result) => {
      if (result.skipped) return;
      if (result.changesDetected > 0) {
        chrome.runtime.sendMessage({ type: 'WATCH_CHANGES_DETECTED' }, () => {
          void chrome.runtime.lastError;
        });
      }
    })
    .catch((error) => console.warn('Watch sweep failed', error));
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

async function validateWebsiteSession(session: WebsiteSession): Promise<WebsiteSession | null> {
  if (!session?.access_token || !session?.refresh_token) return null;

  try {
    const res = await fetchWithTimeout(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        credentials: 'omit',
      },
      10000
    );

    if (!res.ok) return null;
    return { ...session, expires_at: sessionExpiry(session), user: await res.json() };
  } catch (error) {
    console.error('Failed to validate website session', error);
    return null;
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
        encodeURIComponent(`${WEBSITE_BASE_URL}/auth/callback`);

      chrome.tabs.create({ url: authUrl });

      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'AUTH_SUCCESS_FROM_WEBSITE') {
      (async () => {
        const validated = await validateWebsiteSession(msg.session);
        if (!validated) {
          sendResponse({ ok: false, error: 'Invalid website session' });
          return;
        }

        const session = await withSessionLock(async () => {
          const current = await readStoredSession();
          if (
            current &&
            current.user?.id === validated.user?.id &&
            sessionExpiry(current) >= sessionExpiry(validated)
          )
            return current;
          await writeStoredSession(validated);
          return validated;
        });
        chrome.runtime.sendMessage({ type: 'SESSION_UPDATED', session }, () => {
          void chrome.runtime.lastError;
        });
        sendResponse({ ok: true });
      })();
      return true;
    }

    if (msg.type === 'WEBSITE_SIGN_OUT') {
      // Wait for an in-flight refresh before clearing storage, so its response
      // cannot restore the session after sign-out.
      void withSessionLock(() => chrome.storage.local.remove('supabaseSession')).then(() => {
        void updateActionBadge(0);
        chrome.runtime.sendMessage({ type: 'EXTENSION_SIGNED_OUT' }, () => {
          void chrome.runtime.lastError;
        });
        sendResponse({ ok: true });
      });
      return true;
    }

    if (msg.type === 'GET_EXTENSION_SESSION') {
      void withSessionLock(readStoredSession).then((session) => {
        sendResponse({ ok: true, session });
      });
      return true;
    }

    if (msg.type === 'WEBSITE_THEME_CHANGED') {
      chrome.runtime.sendMessage(
        {
          type: 'EXTENSION_THEME_CHANGED',
          theme: msg.theme,
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'PROSPECT_STATUS_UPDATED') {
      chrome.runtime.sendMessage(
        {
          type: 'PROSPECT_STATUS_UPDATED',
          savedId: msg.savedId,
          status: msg.status,
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'PROSPECT_CONTENT_UPDATED') {
      chrome.runtime.sendMessage(
        {
          type: 'PROSPECT_CONTENT_UPDATED',
          savedId: msg.savedId,
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
      sendResponse({ ok: true });
      return true;
    }

    if (msg.type === 'WATCH_RUN_SWEEP') {
      (async () => {
        try {
          sendResponse({ ok: true, result: await runWatchSweep({ force: true }) });
        } catch (err: any) {
          sendResponse({ ok: false, error: String(err?.message || err || 'Sweep failed') });
        }
      })();
      return true;
    }

    if (msg.type === 'WATCH_REFRESH_BADGE') {
      (async () => {
        try {
          await refreshActionBadge();
          sendResponse({ ok: true });
        } catch {
          sendResponse({ ok: false });
        }
      })();
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
