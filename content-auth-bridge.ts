window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  if (event.data?.type === 'SIGNALIZE_AUTH_SUCCESS') {
    if (!event.data.session) {
      console.error('No session received from website');
      return;
    }

    chrome.runtime.sendMessage({
      type: 'AUTH_SUCCESS_FROM_WEBSITE',
      session: event.data.session,
    });
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
