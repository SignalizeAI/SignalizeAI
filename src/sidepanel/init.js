import { signInWithGoogle, signOut, restoreSessionFromStorage } from './auth.js';
import { buildCopyText, copyAnalysisText } from './clipboard.js';
import { AUTO_ANALYZE_DEBOUNCE, IRRELEVANT_DOMAINS, PAGE_SIZE } from './constants.js';
import { getElements } from './elements.js';
import { extractWebsiteContent, showIrrelevantDomainView, shouldAutoAnalyze } from './analysis.js';
import { openCheckout, showLimitModal } from './modal.js';
import { loadQuotaFromAPI, renderQuotaBanner } from './quota.js';
import {
  exitSelectionMode,
  fetchAndRenderPage,
  handleExport,
  loadSavedAnalyses,
  showUndoToast,
  toggleSearchMode,
  toggleSelectAllVisible,
  updateDeleteState,
  updateFilterBanner,
  updateSavedEmptyState,
  updateSelectionUI,
} from './saved.js';
import { loadSettings, saveSettings, updateReanalysisUI } from './settings.js';
import { supabase } from './supabase.js';
import { state } from './state.js';
import { navigateTo, updateUI, isMenuOpen } from './ui.js';

export function initSidepanel() {
  const { signInBtn, signOutBtn, settingsMenu } = getElements();

  document.getElementById('start-analysis-btn')?.addEventListener('click', () => {
    navigateTo('analysis');
  });

  document.getElementById('no-results-reset')?.addEventListener('click', () => {
    const searchInput = document.getElementById('saved-search-input');
    if (searchInput) {
      searchInput.value = '';
      document.getElementById('clear-search-btn')?.classList.add('hidden');
    }
    state.activeFilters.searchQuery = '';

    const resetBtn = document.querySelector('.filter-reset');
    if (resetBtn) {
      resetBtn.click();
    }
    const savedList = document.getElementById('saved-list');
    const savedCount = savedList ? savedList.querySelectorAll('.saved-item').length : 0;
    updateSavedEmptyState(savedList, savedCount);
  });

  if (signInBtn) signInBtn.addEventListener('click', signInWithGoogle);
  if (signOutBtn) signOutBtn.addEventListener('click', signOut);

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

  const saveButton = document.getElementById('saveButton');

  saveButton?.addEventListener('click', async () => {
    if (!state.lastAnalysis || !state.lastExtractedMeta) return;
    await loadQuotaFromAPI();

    if (!saveButton.classList.contains('active') && state.totalSavedCount >= state.maxSavedLimit) {
      showLimitModal('save');
      return;
    }

    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return;

    if (saveButton.classList.contains('active')) {
      const savedId = saveButton.dataset.savedId;
      let deleteQuery = supabase.from('saved_analyses').delete().eq('user_id', user.id);

      if (savedId) {
        deleteQuery = deleteQuery.eq('id', savedId);
      } else {
        deleteQuery = deleteQuery.eq('url', state.lastExtractedMeta.url);
      }

      const { error } = await deleteQuery;

      if (error) {
        console.error('Failed to delete:', error);
        return;
      }

      saveButton.classList.remove('active');
      saveButton.title = 'Save';
      delete saveButton.dataset.savedId;
      if (Number.isFinite(state.totalSavedCount) && state.totalSavedCount > 0) {
        state.totalSavedCount -= 1;
      }
      renderQuotaBanner();
      loadSavedAnalyses();
      await loadQuotaFromAPI(true);
    } else {
      const { data: insertData, error } = await supabase
        .from('saved_analyses')
        .insert({
          user_id: user.id,
          domain: state.lastExtractedMeta.domain,
          url: state.lastExtractedMeta.url,
          title: state.lastExtractedMeta.title,
          description: state.lastExtractedMeta.description,
          content_hash: state.lastContentHash,
          last_analyzed_at: new Date().toISOString(),
          what_they_do: state.lastAnalysis.whatTheyDo,
          target_customer: state.lastAnalysis.targetCustomer,
          value_proposition: state.lastAnalysis.valueProposition,
          sales_angle: state.lastAnalysis.salesAngle,
          sales_readiness_score: state.lastAnalysis.salesReadinessScore,
          best_sales_persona: state.lastAnalysis.bestSalesPersona?.persona,
          best_sales_persona_reason: state.lastAnalysis.bestSalesPersona?.reason,
          recommended_outreach_persona: state.lastAnalysis.recommendedOutreach?.persona,
          recommended_outreach_goal: state.lastAnalysis.recommendedOutreach?.goal,
          recommended_outreach_angle: state.lastAnalysis.recommendedOutreach?.angle,
          recommended_outreach_message: state.lastAnalysis.recommendedOutreach?.message,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Failed to save:', error);
        return;
      }

      saveButton.classList.add('active');
      saveButton.title = 'Remove';
      if (insertData?.id) {
        saveButton.dataset.savedId = insertData.id;
      }
      if (Number.isFinite(state.totalSavedCount)) {
        state.totalSavedCount += 1;
      }
      renderQuotaBanner();
      loadSavedAnalyses();
      await loadQuotaFromAPI(true);
    }
  });

  settingsMenu?.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('settings');
  });

  const autoReanalysisCheckbox = document.getElementById('setting-auto-reanalysis');

  autoReanalysisCheckbox?.addEventListener('change', async (e) => {
    const autoReanalysis = e.target.checked;

    saveSettings({ autoReanalysis });

    const settings = await loadSettings();
    updateReanalysisUI(settings);
  });

  const refreshBtn = document.getElementById('refreshButton');

  if (refreshBtn) {
    refreshBtn.disabled = true;
  }

  refreshBtn?.addEventListener('click', async () => {
    if (state.currentView !== 'analysis') return;
    if (!state.lastExtractedMeta || refreshBtn.disabled) return;

    refreshBtn.disabled = true;
    state.forceRefresh = true;

    document.getElementById('ai-analysis')?.classList.remove('hidden');
    document.getElementById('content-error')?.classList.add('hidden');
    document.getElementById('ai-data')?.classList.add('hidden');
    document.getElementById('ai-loading')?.classList.remove('hidden');

    try {
      await extractWebsiteContent();
    } finally {
      state.forceRefresh = false;
      refreshBtn.disabled = false;
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    updateUI(session);
  });

  supabase.auth.getSession().then(({ data }) => {
    updateUI(data.session);
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

  document.getElementById('export-csv')?.addEventListener('click', async () => {
    await handleExport('csv');
  });

  document.getElementById('export-xlsx')?.addEventListener('click', async () => {
    await handleExport('xlsx');
  });

  const exportToggle = document.getElementById('export-menu-toggle');
  const exportMenu = document.getElementById('export-menu');

  exportToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    exportMenu?.classList.toggle('hidden');
    const expanded = exportToggle.getAttribute('aria-expanded') === 'true';
    exportToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  });

  document.addEventListener('click', () => {
    if (!exportMenu?.classList.contains('hidden')) {
      exportMenu.classList.add('hidden');
      exportToggle?.setAttribute('aria-expanded', 'false');
    }
  });

  const copyBtn = document.getElementById('copyButton');

  copyBtn?.addEventListener('click', async () => {
    const settings = await loadSettings();
    const formatLabel = settings.copyFormat === 'short' ? 'short' : 'full';

    const text = await buildCopyText();
    copyAnalysisText(text, copyBtn, formatLabel);
  });

  document.querySelectorAll('input[name="copy-format"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      saveSettings({ copyFormat: e.target.value });
    });
  });

  const clearCacheBtn = document.getElementById('clear-cache-btn');

  clearCacheBtn?.addEventListener('click', async () => {
    state.lastAnalysis = null;
    state.lastContentHash = null;
    state.lastExtractedMeta = null;
    state.lastAnalyzedDomain = null;

    chrome.storage.local.get(null, (items) => {
      const keysToRemove = Object.keys(items).filter(
        (k) => k.startsWith('analysis_cache:') || k.startsWith('domain_analyzed_today:')
      );
      if (keysToRemove.length) {
        chrome.storage.local.remove(keysToRemove);
      }
    });

    const originalText = clearCacheBtn.textContent;
    clearCacheBtn.textContent = 'Cleared';
    clearCacheBtn.classList.add('cleared');

    setTimeout(() => {
      clearCacheBtn.textContent = originalText;
      clearCacheBtn.classList.remove('cleared');
    }, 1200);
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

  const filterToggle = document.getElementById('filter-toggle');
  const filterPanel = document.getElementById('filter-panel');
  const exportToggleBtn = document.getElementById('export-menu-toggle');

  filterToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    document.getElementById('export-menu')?.classList.add('hidden');
    exportToggleBtn?.setAttribute('aria-expanded', 'false');

    filterPanel?.classList.toggle('hidden');

    const expanded = filterToggle.getAttribute('aria-expanded') === 'true';
    filterToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  });

  document.addEventListener('click', (e) => {
    if (!filterPanel || filterPanel.classList.contains('hidden')) return;

    if (!filterPanel.contains(e.target) && !filterToggle.contains(e.target)) {
      filterPanel.classList.add('hidden');
      filterToggle.setAttribute('aria-expanded', 'false');
    }
  });

  const multiSelectToggle = document.getElementById('multi-select-toggle');

  multiSelectToggle?.addEventListener('click', async () => {
    if (state.isUndoToastActive) return;
    if (multiSelectToggle.classList.contains('disabled')) return;

    if (!state.selectionMode) {
      state.selectionMode = true;
      state.selectedSavedIds.clear();
      updateSelectionUI();
      updateDeleteState();
      return;
    }

    if (state.selectedSavedIds.size === 0) return;

    const idsToDelete = Array.from(state.selectedSavedIds);

    document.querySelectorAll('.saved-item').forEach((el) => {
      const cb = el.querySelector('.saved-select-checkbox');
      if (cb && idsToDelete.includes(cb.dataset.id)) {
        el.dataset.isPendingDelete = 'true';
        el.classList.add('pending-delete');
      }
    });

    exitSelectionMode();

    idsToDelete.forEach((id) => {
      const el = document
        .querySelector(`.saved-select-checkbox[data-id="${id}"]`)
        ?.closest('.saved-item');
      if (!el) return;

      state.pendingDeleteMap.set(id, {
        element: el,
        finalize: async () => {
          const { data } = await supabase.auth.getSession();
          if (!data?.session?.user) return;
          await supabase
            .from('saved_analyses')
            .delete()
            .eq('user_id', data.session.user.id)
            .eq('id', id);
          el.remove();
        },
      });
    });
    showUndoToast();
  });

  const filterApplyBtn = document.querySelector('.filter-apply');

  filterApplyBtn?.addEventListener('click', async () => {
    state.activeFilters.minScore = Number(document.getElementById('filter-min-score')?.value || 0);
    state.activeFilters.maxScore = Number(
      document.getElementById('filter-max-score')?.value || 100
    );

    state.activeFilters.persona = document
      .getElementById('filter-persona')
      ?.value.toLowerCase()
      .trim();

    const sortValue = document.querySelector('input[name="sort"]:checked')?.value;
    if (sortValue) {
      state.activeFilters.sort = sortValue;
    }

    state.currentPage = 1;
    filterPanel?.classList.add('hidden');
    filterToggle?.setAttribute('aria-expanded', 'false');

    await fetchAndRenderPage();
    updateFilterBanner();
  });

  const filterResetBtn = document.querySelector('.filter-reset');

  filterResetBtn?.addEventListener('click', async () => {
    state.activeFilters.minScore = 0;
    state.activeFilters.maxScore = 100;
    state.activeFilters.persona = '';
    state.activeFilters.searchQuery = '';
    state.activeFilters.sort = 'created_at_desc';

    if (minSlider) minSlider.value = 0;
    if (maxSlider) maxSlider.value = 100;
    if (personaInput) personaInput.value = '';
    if (scoreLabel) scoreLabel.textContent = '0 – 100';

    document.querySelector('input[name="sort"][value="created_at_desc"]')?.click();

    filterPanel?.classList.add('hidden');
    filterToggle?.setAttribute('aria-expanded', 'false');

    await fetchAndRenderPage();
    updateFilterBanner();
  });

  const minSlider = document.getElementById('filter-min-score');
  const maxSlider = document.getElementById('filter-max-score');
  const scoreLabel = document.getElementById('filter-score-value');
  const personaInput = document.getElementById('filter-persona');

  function updateScoreFilter() {
    let minVal = Number(minSlider.value);
    let maxVal = Number(maxSlider.value);

    if (minVal > maxVal) {
      minSlider.value = maxVal;
      minVal = maxVal;
    }

    state.activeFilters.minScore = minVal;
    state.activeFilters.maxScore = maxVal;

    if (scoreLabel) {
      scoreLabel.textContent = `${minVal} – ${maxVal}`;
    }
  }

  minSlider?.addEventListener('input', updateScoreFilter);
  maxSlider?.addEventListener('input', updateScoreFilter);

  const selectionBackBtn = document.getElementById('selection-back-btn');

  selectionBackBtn?.addEventListener('click', () => {
    exitSelectionMode();
  });

  document.addEventListener('keydown', (e) => {
    if (!state.selectionMode) return;

    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const selectAllKey = isMac ? e.metaKey : e.ctrlKey;

    if (selectAllKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      toggleSelectAllVisible();
    }
  });

  const selectAllBtn = document.getElementById('select-all-btn');

  selectAllBtn?.addEventListener('click', () => {
    if (!state.selectionMode) return;
    toggleSelectAllVisible();
  });

  const searchToggle = document.getElementById('search-toggle');
  const searchInput = document.getElementById('saved-search-input');
  const searchCloseBtn = document.getElementById('search-close-btn');

  searchToggle?.addEventListener('click', () => toggleSearchMode(true));
  searchCloseBtn?.addEventListener('click', () => toggleSearchMode(false));

  searchInput?.addEventListener('input', async (e) => {
    const val = e.target.value.toLowerCase().trim();

    state.activeFilters.searchQuery = val;

    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', val === '');
    }

    await fetchAndRenderPage();
    updateFilterBanner();
  });

  document.getElementById('clear-search-btn')?.addEventListener('click', () => {
    searchInput.value = '';
    state.activeFilters.searchQuery = '';
    searchInput.focus();
  });

  document.getElementById('reset-filters-link')?.addEventListener('click', async () => {
    state.activeFilters.minScore = 0;
    state.activeFilters.maxScore = 100;
    state.activeFilters.persona = '';
    state.activeFilters.searchQuery = '';
    state.activeFilters.sort = 'created_at_desc';

    if (minSlider) minSlider.value = 0;
    if (maxSlider) maxSlider.value = 100;
    if (personaInput) personaInput.value = '';
    if (scoreLabel) scoreLabel.textContent = '0 – 100';

    if (searchInput) searchInput.value = '';

    document.querySelector('input[name="sort"][value="created_at_desc"]')?.click();

    state.currentPage = 1;
    await fetchAndRenderPage();
    updateFilterBanner();
  });

  document.getElementById('modal-close-btn')?.addEventListener('click', () => {
    document.getElementById('limit-modal').classList.add('hidden');
  });

  document.getElementById('modal-upgrade-pro-btn')?.addEventListener('click', () => {
    document.getElementById('limit-modal').classList.add('hidden');
    openCheckout('a124318b-c077-4f54-b714-cc77811af78b');
  });

  document.getElementById('modal-upgrade-team-btn')?.addEventListener('click', () => {
    document.getElementById('limit-modal').classList.add('hidden');
    openCheckout('88e4933d-9fae-4a7a-8c3f-ee72d78018b0');
  });

  document.getElementById('upgrade-btn')?.addEventListener('click', () => {
    showLimitModal('upgrade');
  });

  const pagePrev = document.getElementById('page-prev');
  const pageNext = document.getElementById('page-next');

  pagePrev?.addEventListener('click', async () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      await fetchAndRenderPage();
    }
  });

  pageNext?.addEventListener('click', async () => {
    const totalPages = Math.ceil(state.totalFilteredCount / PAGE_SIZE);
    if (state.currentPage < totalPages) {
      state.currentPage++;
      await fetchAndRenderPage();
    }
  });

  restoreSessionFromStorage().then(async () => {
    const { data } = await supabase.auth.getSession();
    updateUI(data.session);
  });
}
