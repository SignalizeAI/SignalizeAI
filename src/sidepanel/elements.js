import { byId, qs } from './dom.js';

let cachedElements = null;

export function getElements() {
  if (cachedElements) return cachedElements;

  cachedElements = {
    headerSubtitle: qs('#welcome-view .user-email-text'),
    loginView: byId('login-view'),
    welcomeView: byId('welcome-view'),
    userInitialSpan: byId('user-initial'),
    signInBtn: byId('google-signin'),
    signOutBtn: byId('sign-out'),
    statusMsg: byId('status-msg'),
    settingsMenu: qs('.menu-item img[src*="settings"]')?.closest('.menu-item'),
    settingsView: byId('settings-view'),
    multiSelectToggle: byId('multi-select-toggle'),
    selectionBackBtn: byId('selection-back-btn'),
    selectAllBtn: byId('select-all-btn'),
  };

  return cachedElements;
}

export function resetElementsCache() {
  cachedElements = null;
}
