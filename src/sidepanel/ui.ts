import { headerSubtitle, loginView, userInitialSpan, welcomeView } from './elements.js';
import { loadQuotaFromAPI } from './quota.js';
import { loadSettings, applySettingsToUI } from './settings.js';
import { state } from './state.js';
import { extractWebsiteContent } from './analysis/index.js';
import { exitSelectionMode, loadSavedAnalyses } from './saved/index.js';
import type { Session } from '@supabase/supabase-js';

export function navigateTo(view: 'analysis' | 'saved' | 'batch' | 'profile' | 'settings'): void {
  const prevView = state.currentView;

  if (prevView === 'analysis' && view !== 'analysis') {
    const manualUrlInput = document.getElementById('manual-url-input') as HTMLInputElement | null;
    if (manualUrlInput) manualUrlInput.value = '';
  }

  if (view !== 'saved' && state.selectionMode) {
    exitSelectionMode();
  }
  if (prevView === view && welcomeView && !welcomeView.classList.contains('hidden')) {
    return;
  }
  state.currentView = view;

  if (prevView !== view && !state.isAnalysisLoading) {
    document.querySelector('.dropdown-card')?.classList.remove('expanded');
    state.isUserInteracting = false;
  }
  document.getElementById('ai-analysis')?.classList.add('hidden');
  document.getElementById('manual-url-container')?.classList.add('hidden');
  document.getElementById('empty-tab-view')?.classList.add('hidden');
  document.getElementById('saved-analyses')?.classList.add('hidden');
  document.getElementById('batch-view')?.classList.add('hidden');
  document.getElementById('profile-view')?.classList.add('hidden');
  document.getElementById('settings-view')?.classList.add('hidden');

  document.getElementById('ai-loading')?.classList.add('hidden');
  document.getElementById('filter-panel')?.classList.add('hidden');

  if (headerSubtitle) {
    if (view === 'analysis') {
      headerSubtitle.textContent = 'Understand any page';
      headerSubtitle.style.cursor = 'default';
      headerSubtitle.onclick = null;
    } else {
      headerSubtitle.innerHTML = '<div style="display:flex; align-items:center; gap:4px; margin-left:-2px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg> <span>Back</span></div>';
      headerSubtitle.style.cursor = 'pointer';
      headerSubtitle.onclick = (e: MouseEvent) => {
        e.stopPropagation();
        navigateTo('analysis');
      };
    }
  }

  if (view === 'analysis') {
    document.getElementById('manual-url-container')?.classList.remove('hidden');
    document.getElementById('ai-analysis')?.classList.remove('hidden');
    requestAnimationFrame(() => {
      extractWebsiteContent();
    });
  }

  if (view === 'saved') {
    document.getElementById('saved-analyses')?.classList.remove('hidden');
    requestAnimationFrame(() => {
      loadSavedAnalyses();
    });
  }

  if (view === 'batch') {
    document.getElementById('batch-view')?.classList.remove('hidden');
  }

  if (view === 'profile') {
    document.getElementById('profile-view')?.classList.remove('hidden');

    const usageLimitEl = document.getElementById('profile-usage-limit');
    const storageLimitEl = document.getElementById('profile-storage-limit');

    const dailyLimit = state.dailyLimitFromAPI;
    const saveLimit = state.maxSavedLimit;

    if (usageLimitEl) usageLimitEl.textContent = `${dailyLimit} / day`;
    if (storageLimitEl) {
      storageLimitEl.textContent = `${saveLimit.toLocaleString()} items`;
    }

    const profileRows = document.querySelectorAll('#profile-view .profile-row');
    profileRows.forEach((row) => {
      const label = row.querySelector('.profile-label')?.textContent;
      const value = row.querySelector('.profile-value');
      if (label === 'Plan' && value && state.currentPlan) {
        value.textContent = state.currentPlan.charAt(0).toUpperCase() + state.currentPlan.slice(1);
      }
    });
  }

  if (view === 'settings') {
    document.getElementById('settings-view')?.classList.remove('hidden');
  }
}

export async function updateUI(session: Session | null): Promise<void> {
  if (session) {
    const isAlreadyLoggedIn = welcomeView && !welcomeView.classList.contains('hidden');

    loginView?.classList.add('hidden');
    welcomeView?.classList.remove('hidden');

    const user = session.user;
    const fullName = user?.user_metadata?.full_name || user?.email || '';
    const avatarUrl = user?.user_metadata?.avatar_url;

    if (userInitialSpan) {
      if (avatarUrl) {
        userInitialSpan.innerHTML = `<img src="${avatarUrl}" alt="Profile avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />`;
        userInitialSpan.style.background = 'transparent';
      } else if (fullName) {
        userInitialSpan.textContent = fullName.charAt(0).toUpperCase();
        userInitialSpan.style.background = 'linear-gradient(135deg, var(--accent-color), #22c55e)';
      }
    }
    const cancelBtn = document.getElementById('cancel-signin');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    const errorMsg = document.getElementById('auth-error-msg');
    if (errorMsg) {
      errorMsg.textContent = '';
      errorMsg.classList.add('hidden');
    }
    const subtitle = document.querySelector('.login-subtitle');
    if (subtitle) subtitle.classList.remove('hidden');
    const signInBtn = document.getElementById('google-signin') as HTMLButtonElement | null;
    if (signInBtn) {
      signInBtn.disabled = false;
      signInBtn.innerHTML =
        '<img src="icons/google.svg" alt="Google" class="google-icon" /> Sign in with Google';
    }

    await loadQuotaFromAPI();

    const isMenuOpen = document.querySelector('.dropdown-card')?.classList.contains('expanded');

    if (!isAlreadyLoggedIn && !isMenuOpen) {
      navigateTo('analysis');
    }

    const settings = await loadSettings();
    applySettingsToUI(settings);

    if (state.currentView === 'analysis' && !state.isAnalysisLoading) {
      setTimeout(extractWebsiteContent, 0);
    }
  } else {
    document.getElementById('limit-modal')?.classList.add('hidden');
    loginView?.classList.remove('hidden');
    welcomeView?.classList.add('hidden');

    const cancelBtn = document.getElementById('cancel-signin');
    if (cancelBtn) cancelBtn.classList.add('hidden');
    const errorMsg = document.getElementById('auth-error-msg');
    if (errorMsg) {
      errorMsg.textContent = '';
      errorMsg.classList.add('hidden');
    }
    const subtitle = document.querySelector('.login-subtitle');
    if (subtitle) subtitle.classList.remove('hidden');
    const signInBtn = document.getElementById('google-signin') as HTMLButtonElement | null;
    if (signInBtn) {
      signInBtn.disabled = false;
      signInBtn.innerHTML =
        '<img src="icons/google.svg" alt="Google" class="google-icon" /> Sign in with Google';
    }
  }
}

export function isMenuOpen(): boolean {
  return document.querySelector('.dropdown-card')?.classList.contains('expanded') || false;
}
