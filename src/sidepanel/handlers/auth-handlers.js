import { signInWithGoogle, signOut, restoreSessionFromStorage } from '../auth.js';
import { signInBtn, signOutBtn } from '../elements.js';
import { supabase } from '../supabase.js';
import { updateUI } from '../ui.js';

export function setupAuthHandlers() {
  if (signInBtn) signInBtn.addEventListener('click', signInWithGoogle);
  if (signOutBtn) signOutBtn.addEventListener('click', signOut);

  supabase.auth.onAuthStateChange((event, session) => {
    updateUI(session);
  });

  supabase.auth.getSession().then(({ data }) => {
    updateUI(data.session);
  });

  restoreSessionFromStorage().then(async () => {
    const { data } = await supabase.auth.getSession();
    updateUI(data.session);
  });
}
