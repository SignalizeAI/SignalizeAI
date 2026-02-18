import { navigateTo } from '../ui.js';
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { buildCopyText, copyAnalysisText } from '../clipboard.js';
import { loadSettings } from '../settings.js';

export function setupNavigationHandlers() {
  const dropdownHeader = document.getElementById('dropdown-header');
  const dropdownCard = document.querySelector('.dropdown-card');

  if (dropdownHeader && dropdownCard) {
    dropdownHeader.addEventListener('click', (e) => {
      e.stopPropagation();

      const isOpening = !dropdownCard.classList.contains('expanded');

      if (isOpening) {
        state.dropdownOpenedAt = Date.now();
        state.isUserInteracting = true;
      }

      dropdownCard.classList.toggle('expanded');
    });
  }

  const homeTitle = document.querySelector('#welcome-view .user-name-text');

  homeTitle?.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateTo('analysis');
  });

  document.addEventListener('click', (e) => {
    if (!dropdownCard) return;
    if (state.isAnalysisLoading) return;

    if (Date.now() - state.dropdownOpenedAt < 150) return;

    if (dropdownCard.classList.contains('expanded') && !dropdownCard.contains(e.target)) {
      dropdownCard.classList.remove('expanded');
      state.isUserInteracting = false;
    }
  });

  const dropdownMenu = document.getElementById('menu-saved-analyses');

  dropdownMenu?.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('saved');
  });

  const subscriptionMenu = document.getElementById('menu-subscription');

  subscriptionMenu?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'https://signalizeai.org/pricing' });
  });

  const profileMenuItem = document.getElementById('menu-profile');

  profileMenuItem?.addEventListener('click', async (e) => {
    e.preventDefault();
    navigateTo('profile');

    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;

    if (user) {
      document.getElementById('profile-name').textContent = user.user_metadata?.full_name || '—';

      document.getElementById('profile-email').textContent = user.email || '—';
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
