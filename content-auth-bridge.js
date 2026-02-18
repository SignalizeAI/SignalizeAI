window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data?.type !== 'SIGNALIZE_AUTH_SUCCESS') return;

  if (!event.data.session) {
    console.error('No session received from website');
    return;
  }

  chrome.runtime.sendMessage({
    type: 'AUTH_SUCCESS_FROM_WEBSITE',
    session: event.data.session,
  });
});
