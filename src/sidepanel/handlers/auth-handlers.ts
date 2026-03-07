import { signInWithGoogle, signOut, restoreSessionFromStorage, cancelSignIn } from '../auth.js';
import { signInBtn, signOutBtn } from '../elements.js';
import { supabase } from '../supabase.js';
import { updateUI } from '../ui.js';

export function setupAuthHandlers(): void {
  if (signInBtn) signInBtn.addEventListener('click', signInWithGoogle);
  if (signOutBtn) signOutBtn.addEventListener('click', signOut);

  const cancelBtn = document.getElementById('cancel-signin');
  if (cancelBtn) cancelBtn.addEventListener('click', cancelSignIn);

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
