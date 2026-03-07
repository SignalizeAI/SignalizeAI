import { signInBtn } from './elements.js';
import { supabase } from './supabase.js';
import { state } from './state.js';
import { updateUI } from './ui.js';

let loginTimeout: ReturnType<typeof setTimeout> | null = null;
let msgHideTimeout: ReturnType<typeof setTimeout> | null = null;

export async function signInWithGoogle(): Promise<void> {
  const cancelBtn = document.getElementById('cancel-signin');
  const errorMsg = document.getElementById('auth-error-msg');
  const subtitle = document.querySelector('.login-subtitle');

  try {
    if (errorMsg) {
      errorMsg.classList.add('hidden');
      errorMsg.textContent = '';
    }
    if (msgHideTimeout) clearTimeout(msgHideTimeout);
    if (subtitle) {
      subtitle.classList.add('hidden');
    }
    if (signInBtn) {
      (signInBtn as HTMLButtonElement).disabled = true;
      signInBtn.innerHTML = 'Signing in...';
    }
    if (cancelBtn) {
      cancelBtn.classList.remove('hidden');
    }

    if (loginTimeout) clearTimeout(loginTimeout);
    loginTimeout = setTimeout(() => {
      if (errorMsg) {
        errorMsg.textContent = 'Still signing you in... If nothing happens, try again.';
        errorMsg.classList.remove('hidden');
      }
    }, 15000);

    chrome.runtime.sendMessage({ type: 'LOGIN_GOOGLE' });
  } catch (err) {
    console.error('Login failed:', err);
    if (loginTimeout) clearTimeout(loginTimeout);
    if (errorMsg) {
      errorMsg.textContent = 'Sign-in failed. Please try again.';
      errorMsg.classList.remove('hidden');
      if (msgHideTimeout) clearTimeout(msgHideTimeout);
      msgHideTimeout = setTimeout(() => {
        errorMsg.classList.add('hidden');
      }, 4000);
    }
    if (signInBtn) {
      (signInBtn as HTMLButtonElement).disabled = false;
      signInBtn.innerHTML = '<img src="icons/google.svg" alt="Google" class="google-icon" /> Sign in with Google';
    }
    if (cancelBtn) {
      cancelBtn.classList.add('hidden');
    }
    if (subtitle) {
      subtitle.classList.remove('hidden');
    }
  }
}

export function cancelSignIn(): void {
  const cancelBtn = document.getElementById('cancel-signin');
  const errorMsg = document.getElementById('auth-error-msg');
  const subtitle = document.querySelector('.login-subtitle');

  if (loginTimeout) clearTimeout(loginTimeout);

  if (cancelBtn) cancelBtn.classList.add('hidden');
  if (subtitle) subtitle.classList.add('hidden');
  if (signInBtn) {
    (signInBtn as HTMLButtonElement).disabled = false;
    signInBtn.innerHTML = '<img src="icons/google.svg" alt="Google" class="google-icon" /> Sign in with Google';
  }
  if (errorMsg) {
    errorMsg.textContent = 'Sign-in cancelled. Try again.';
    errorMsg.classList.remove('hidden');
    if (msgHideTimeout) clearTimeout(msgHideTimeout);
    msgHideTimeout = setTimeout(() => {
      errorMsg.classList.add('hidden');
    }, 4000);
  }
}

export async function signOut(): Promise<void> {
  state.currentView = null;
  state.forceRefresh = false;
  state.selectionMode = false;
  state.remainingToday = null;
  state.usedToday = null;
  state.totalSavedCount = 0;
  state.currentPlan = null;
  state.lastAnalysis = null;
  state.lastExtractedMeta = null;
  state.lastContentHash = null;
  state.lastAnalyzedDomain = null;
  state.pendingDeleteMap.clear();
  state.selectedSavedIds.clear();

  await chrome.storage.local.remove('supabaseSession');

  const { data } = await supabase.auth.getSession();

  if (data?.session) {
    const { error } = await supabase.auth.signOut();
    if (error && error.name !== 'AuthSessionMissingError') {
      console.error('Sign out error:', error);
    }
  }

  updateUI(null);
}

export async function restoreSessionFromStorage(): Promise<void> {
  const { supabaseSession } = await chrome.storage.local.get('supabaseSession');

  if (!supabaseSession?.access_token || !supabaseSession?.refresh_token) {
    console.log('No stored Supabase session');
    return;
  }

  const { error } = await supabase.auth.setSession({
    access_token: supabaseSession.access_token,
    refresh_token: supabaseSession.refresh_token,
  });

  if (error) {
    console.error('Failed to restore session', error);
  } else {
    console.log('Supabase session restored in extension');
  }
}
