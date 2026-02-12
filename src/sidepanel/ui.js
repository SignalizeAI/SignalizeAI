import { getElements } from './elements.js';
import { loadQuotaFromAPI } from './quota.js';
import { loadSettings, applySettingsToUI } from './settings.js';
import { state } from './state.js';
import { exitSelectionMode } from './saved.js';
import { showView } from './views.js';

export function navigateTo(view) {
  const { headerSubtitle, welcomeView } = getElements();
  const prevView = state.currentView;

  if (view !== 'saved' && state.selectionMode) {
    exitSelectionMode();
  }
  if (prevView === view && !welcomeView.classList.contains('hidden')) {
    return;
  }
  state.currentView = view;

  if (prevView !== view && !state.isAnalysisLoading) {
    document.querySelector('.dropdown-card')?.classList.remove('expanded');
    state.isUserInteracting = false;
  }
  if (headerSubtitle) {
    if (view === 'analysis') {
      headerSubtitle.textContent = 'Cursor for sales pages';
      headerSubtitle.style.cursor = 'default';
      headerSubtitle.onclick = null;
    } else {
      headerSubtitle.textContent = 'Back to Website Information';
      headerSubtitle.style.cursor = 'pointer';
      headerSubtitle.onclick = (e) => {
        e.stopPropagation();
        navigateTo('analysis');
      };
    }
  }

  showView(view);
}

export async function updateUI(session) {
  const { loginView, userInitialSpan, welcomeView } = getElements();
  if (session) {
    const isAlreadyLoggedIn = !welcomeView.classList.contains('hidden');

    loginView.classList.add('hidden');
    welcomeView.classList.remove('hidden');

    const user = session.user;
    const fullName = user?.user_metadata?.full_name || user?.email || '';

    if (userInitialSpan && fullName) {
      userInitialSpan.textContent = fullName.charAt(0).toUpperCase();
    }
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg) statusMsg.textContent = '';
    await loadQuotaFromAPI();

    const isMenuOpen = document.querySelector('.dropdown-card')?.classList.contains('expanded');

    if (!isAlreadyLoggedIn && !isMenuOpen) {
      navigateTo('analysis');
    }

    const settings = await loadSettings();
    applySettingsToUI(settings);

    if (state.currentView === 'analysis' && !state.isAnalysisLoading) {
      setTimeout(() => showView('analysis'), 0);
    }
  } else {
    document.getElementById('limit-modal')?.classList.add('hidden');
    loginView.classList.remove('hidden');
    welcomeView.classList.add('hidden');
  }
}

export function isMenuOpen() {
  return document.querySelector('.dropdown-card')?.classList.contains('expanded');
}
