import { restoreSessionFromStorage } from '../auth.js';
import { AUTO_ANALYZE_DEBOUNCE, IRRELEVANT_DOMAINS } from '../constants.js';
import {
  extractWebsiteContent,
  shouldAutoAnalyze,
  showIrrelevantDomainView,
} from '../analysis/index.js';
import { loadQuotaFromAPI } from '../quota.js';
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { isMenuOpen, updateUI } from '../ui.js';

export function setupRuntimeHandlers() {
  chrome.runtime.onMessage.addListener(async (message) => {
    switch (message.type) {
      case 'TAB_CHANGED': {
        if (state.isUserInteracting || isMenuOpen() || state.isAnalysisLoading) return;
        if (Date.now() - state.lastAutoAnalyzeAt < AUTO_ANALYZE_DEBOUNCE) return;
        state.lastAutoAnalyzeAt = Date.now();

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tabs[0]?.url || '';
        const enabled = await shouldAutoAnalyze(url);

        if (!enabled && state.currentView === 'analysis') {
          const lowerUrl = url?.toLowerCase() || '';
          const isIrrelevant = IRRELEVANT_DOMAINS.some((domain) => lowerUrl.includes(domain));
          if (isIrrelevant) {
            showIrrelevantDomainView();
          }
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (state.currentView === 'analysis' && data?.session) {
          setTimeout(extractWebsiteContent, 100);
        }
        break;
      }
      case 'SESSION_UPDATED': {
        await restoreSessionFromStorage();
        const { data } = await supabase.auth.getSession();
        if (!data?.session) return;
        updateUI(data.session);
        break;
      }
      case 'PAYMENT_SUCCESS': {
        await restoreSessionFromStorage();
        const { data } = await supabase.auth.getSession();
        if (!data?.session) {
          console.warn('No active session after payment success');
          return;
        }
        try {
          await supabase.auth.refreshSession();
        } catch (err) {
          console.warn('Failed to refresh session after payment', err);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        await loadQuotaFromAPI(true);
        updateUI(data.session);
        break;
      }
      default:
        break;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (state.isUserInteracting || isMenuOpen() || state.isAnalysisLoading) return;
    if (!document.hidden) {
      chrome.tabs
        .query({ active: true, currentWindow: true })
        .then((tabs) => {
          const url = tabs[0]?.url || '';
          return shouldAutoAnalyze(url).then((enabled) => ({ enabled, url }));
        })
        .then(({ enabled, url }) => {
          if (!enabled && state.currentView === 'analysis') {
            const lowerUrl = url?.toLowerCase() || '';
            const isIrrelevant = IRRELEVANT_DOMAINS.some((domain) => lowerUrl.includes(domain));
            if (isIrrelevant) {
              showIrrelevantDomainView();
            }
            return;
          }

          supabase.auth.getSession().then(() => {
            if (state.currentView === 'analysis') {
              setTimeout(extractWebsiteContent, 100);
            }
          });
        });
    }
  });
}
