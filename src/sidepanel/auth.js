import { statusMsg } from './elements.js';
import { supabase } from './supabase.js';
import { state } from './state.js';
import { updateUI } from './ui.js';

export async function signInWithGoogle() {
  try {
    if (statusMsg) {
      statusMsg.textContent = 'Logging in...';
    }

    chrome.runtime.sendMessage({ type: 'LOGIN_GOOGLE' });
  } catch (err) {
    console.error('Login failed:', err);
    if (statusMsg) {
      statusMsg.textContent = 'Login failed. Please try again.';
    }
  }
}

export async function signOut() {
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

export async function restoreSessionFromStorage() {
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
