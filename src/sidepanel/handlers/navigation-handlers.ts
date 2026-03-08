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

  const menuLists = document.querySelectorAll<HTMLUListElement>('.menu-list');
  menuLists.forEach((list) => {
    const glider = document.createElement('li');
    glider.className = 'menu-glider';
    list.appendChild(glider);

    list.addEventListener('pointermove', (e: PointerEvent) => {
      const target = (e.target as HTMLElement).closest('.menu-item') as HTMLElement;
      if (!target) {
        glider.style.opacity = '0';
        return;
      }
      glider.style.opacity = '1';
      glider.style.transform = `translateY(${target.offsetTop}px)`;
      glider.style.height = `${target.offsetHeight}px`;
    });

    list.addEventListener('pointerleave', () => {
      glider.style.opacity = '0';
    });
  });

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

  const batchMenu = document.getElementById('menu-batch-analysis');

  batchMenu?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    navigateTo('batch');
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

  const outreachQuickCopy = document.getElementById('ai-outreach-quick-copy');

  outreachQuickCopy?.addEventListener('click', async () => {
    const outreachMessage = document.getElementById('ai-outreach-message')?.textContent || '';
    if (!outreachMessage || outreachMessage === '—') return;

    try {
      await navigator.clipboard.writeText(outreachMessage);
      const span = outreachQuickCopy.querySelector('span');
      if (span) span.textContent = 'Copied!';

      const svg = outreachQuickCopy.querySelector('svg');
      if (svg) {
        svg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
      }

      setTimeout(() => {
        if (span) span.textContent = 'Copy';
        if (svg) {
          svg.innerHTML =
            '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>';
        }
      }, 2000);
    } catch {
      const span = outreachQuickCopy.querySelector('span');
      if (span) span.textContent = 'Copy failed';

      setTimeout(() => {
        if (span) span.textContent = 'Copy';
      }, 2000);
    }
  });
}
