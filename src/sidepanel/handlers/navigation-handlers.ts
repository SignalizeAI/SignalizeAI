import { navigateTo } from '../ui.js';
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { buildCopyText, copyAnalysisText } from '../clipboard.js';
import { loadSettings } from '../settings.js';

export function setupNavigationHandlers(): void {
  const dropdownHeader = document.getElementById('dropdown-header');
  const dropdownCard = document.querySelector<HTMLElement>('.dropdown-card');

  if (dropdownHeader && dropdownCard) {
    dropdownHeader.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();

      const isOpening = !dropdownCard.classList.contains('expanded');

      if (isOpening) {
        state.dropdownOpenedAt = Date.now();
        state.isUserInteracting = true;
      }

      dropdownCard.classList.toggle('expanded');
    });
  }

  const homeTitle = document.querySelector<HTMLElement>('#welcome-view .user-name-text');

  homeTitle?.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    navigateTo('analysis');
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!dropdownCard) return;
    if (state.isAnalysisLoading) return;

    if (Date.now() - state.dropdownOpenedAt < 150) return;

    if (dropdownCard.classList.contains('expanded') && !dropdownCard.contains(e.target as Node)) {
      dropdownCard.classList.remove('expanded');
      state.isUserInteracting = false;
    }
  });

  const dropdownMenu = document.getElementById('menu-saved-analyses');

  dropdownMenu?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    navigateTo('saved');
  });

  const subscriptionMenu = document.getElementById('menu-subscription');

  subscriptionMenu?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://signalizeai.org/pricing' });
  });

  const profileMenuItem = document.getElementById('menu-profile');

  profileMenuItem?.addEventListener('click', async (e: MouseEvent) => {
    e.preventDefault();
    navigateTo('profile');

    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;

    if (user) {
      const profileNameEl = document.getElementById('profile-name');
      const profileEmailEl = document.getElementById('profile-email');

      if (profileNameEl) {
        profileNameEl.textContent = user.user_metadata?.full_name || '—';
      }

      if (profileEmailEl) {
        profileEmailEl.textContent = user.email || '—';
      }
    }
  });

  const copyBtn = document.getElementById('copyButton');

  copyBtn?.addEventListener('click', async () => {
    const settings = await loadSettings();
    const formatLabel = settings.copyFormat === 'short' ? 'short' : 'full';

    const text = await buildCopyText();
    copyAnalysisText(text, copyBtn, formatLabel);
  });
}
