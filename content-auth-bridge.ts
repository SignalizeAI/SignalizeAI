import { SUPABASE_URL } from './src/config.js';

type WebsiteSession = {
  access_token: string;
  refresh_token: string;
};

const SUPABASE_PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
const WEBSITE_SESSION_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

function extractSession(candidate: unknown): WebsiteSession | null {
  if (!candidate || typeof candidate !== 'object') return null;

  const direct = candidate as Record<string, unknown>;
  if (typeof direct.access_token === 'string' && typeof direct.refresh_token === 'string') {
    return {
      access_token: direct.access_token,
      refresh_token: direct.refresh_token,
    };
  }

  if ('currentSession' in direct) {
    return extractSession(direct.currentSession);
  }

  if (Array.isArray(candidate)) {
    for (const value of candidate) {
      const session = extractSession(value);
      if (session) return session;
    }
  }

  return null;
}

function getWebsiteSessionFromStorage(): WebsiteSession | null {
  try {
    const raw = window.localStorage.getItem(WEBSITE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return extractSession(parsed);
  } catch (error) {
    console.warn('Failed to read website session from storage:', error);
  }

  return null;
}

function syncStoredWebsiteSession(): void {
  const session = getWebsiteSessionFromStorage();
  if (!session) return;

  chrome.runtime.sendMessage({
    type: 'AUTH_SUCCESS_FROM_WEBSITE',
    session,
  });
}

function syncExtensionSessionToWebsite(): void {
  chrome.runtime.sendMessage({ type: 'GET_EXTENSION_SESSION' }, (response) => {
    if (chrome.runtime.lastError) return;
    const session = extractSession(response?.session);
    if (!session) return;

    window.postMessage(
      {
        type: 'SIGNALIZE_EXTENSION_SESSION_SYNC',
        session,
      },
      window.location.origin
    );
  });
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  if (event.data?.type === 'SIGNALIZE_WEBSITE_AUTH_STATE_CHANGED') {
    syncStoredWebsiteSession();
    return;
  }

  if (event.data?.type === 'SIGNALIZE_REQUEST_EXTENSION_SESSION_SYNC') {
    syncExtensionSessionToWebsite();
    return;
  }

  if (event.data?.type === 'SIGNALIZE_PROSPECT_STATUS_UPDATED') {
    chrome.runtime.sendMessage({
      type: 'PROSPECT_STATUS_UPDATED',
      savedId: event.data.savedId,
      status: event.data.status,
    });
    return;
  }

  if (event.data?.type === 'SIGNALIZE_PROSPECT_CONTENT_UPDATED') {
    chrome.runtime.sendMessage({
      type: 'PROSPECT_CONTENT_UPDATED',
      savedId: event.data.savedId,
    });
    return;
  }

  if (event.data?.type === 'SIGNALIZE_PAGE_EXTENSION_CHECK') {
    window.postMessage(
      {
        type: 'SIGNALIZE_EXTENSION_CHECK_RESULT',
        installed: true,
      },
      window.location.origin
    );
    return;
  }

  if (event.data?.type === 'SIGNALIZE_WEBSITE_SIGN_OUT') {
    chrome.runtime.sendMessage({
      type: 'WEBSITE_SIGN_OUT',
    });
    return;
  }

  if (event.data?.type === 'SIGNALIZE_WEBSITE_THEME_CHANGED') {
    chrome.runtime.sendMessage({
      type: 'WEBSITE_THEME_CHANGED',
      theme: event.data.theme,
    });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === '__PING__') {
    return { ok: true };
  }

  if (message?.type === 'SYNC_EXTENSION_SIGNED_OUT') {
    window.postMessage(
      {
        type: 'SIGNALIZE_EXTENSION_SIGNED_OUT',
      },
      window.location.origin
    );
    return;
  }

  if (message?.type === 'SYNC_EXTENSION_THEME') {
    window.postMessage(
      {
        type: 'SIGNALIZE_EXTENSION_THEME_CHANGED',
        theme: message.theme,
      },
      window.location.origin
    );
    return;
  }

  if (message?.type !== 'SYNC_PROSPECT_STATUS_TO_PAGE') return;

  window.postMessage(
    {
      type: 'SIGNALIZE_EXTENSION_PROSPECT_STATUS_UPDATED',
      savedId: message.savedId,
      status: message.status,
    },
    window.location.origin
  );
});

syncStoredWebsiteSession();
syncExtensionSessionToWebsite();
