import { signInWithGoogle, signOut, restoreSessionFromStorage, cancelSignIn } from '../auth.js';
import { signInBtn, signOutBtn } from '../elements.js';
import { supabase } from '../supabase.js';
import { updateUI } from '../ui.js';

export function setupAuthHandlers(): void {
  // Read the version from the manifest rather than hardcoding it in the markup.
  // It was pinned at 5.4.1 in auth.html and had to be remembered on every
  // release, which is exactly the kind of string that silently goes stale.
  const versionEl = document.getElementById('app-version');
  if (versionEl) {
    versionEl.textContent = `SignalizeAI v${chrome.runtime.getManifest().version}`;
  }

  if (signInBtn) signInBtn.addEventListener('click', signInWithGoogle);
  if (signOutBtn) signOutBtn.addEventListener('click', signOut);

  const cancelBtn = document.getElementById('cancel-signin');
  if (cancelBtn) cancelBtn.addEventListener('click', cancelSignIn);

  supabase.auth.onAuthStateChange((_event, session) => {
    updateUI(session);
  });

  restoreSessionFromStorage().then(async () => {
    const { data } = await supabase.auth.getSession();
    updateUI(data.session);
  });
}
