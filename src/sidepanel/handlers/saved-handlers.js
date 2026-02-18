import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { renderQuotaBanner, loadQuotaFromAPI } from '../quota.js';
import { showLimitModal } from '../modal.js';
import { showToast } from '../toast.js';
import { getHomepageAnalysisForSave } from '../analysis/extraction.js';
import {
  loadSavedAnalyses,
  exitSelectionMode,
  toggleSearchMode,
  toggleSelectAllVisible,
  fetchAndRenderPage,
  updateDeleteState,
  updateSelectionUI,
  updateFilterBanner,
  updateSavedEmptyState,
} from '../saved/index.js';
import { showUndoToast } from '../saved/delete.js';
import { PAGE_SIZE } from '../constants.js';

export function setupSavedHandlers() {
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

  document.getElementById('no-results-reset')?.addEventListener('click', () => {
    const searchInputEl = document.getElementById('saved-search-input');
    if (searchInputEl) {
      searchInputEl.value = '';
      document.getElementById('clear-search-btn')?.classList.add('hidden');
    }
    state.activeFilters.searchQuery = '';

    const resetBtn = document.querySelector('.filter-reset');
    if (resetBtn) {
      resetBtn.click();
    }
    updateSavedEmptyState();
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

    const currentUrl = state.lastExtractedMeta.url;
    const urlObj = new URL(currentUrl);
    const isHomepage = urlObj.pathname === '/' || urlObj.pathname === '';
    const originUrl = urlObj.origin;

    if (saveButton.classList.contains('active')) {
      const savedId = saveButton.dataset.savedId;
      let deleteQuery = supabase.from('saved_analyses').delete().eq('user_id', user.id);

      if (savedId) {
        deleteQuery = deleteQuery.eq('id', savedId);
      } else {
        deleteQuery = deleteQuery.eq('domain', state.lastExtractedMeta.domain);
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
      const { data: existing } = await supabase
        .from('saved_analyses')
        .select('id')
        .eq('user_id', user.id)
        .eq('domain', state.lastExtractedMeta.domain)
        .limit(1)
        .maybeSingle();

      if (existing) {
        saveButton.classList.add('active');
        saveButton.title = 'Remove';
        saveButton.dataset.savedId = existing.id;
        showToast('Already saved for this domain.');
        return;
      }

      let saveAnalysis = state.lastAnalysis;
      let saveMeta = state.lastExtractedMeta;
      let saveContentHash = state.lastContentHash;

      if (!isHomepage) {
        saveButton.disabled = true;
        let homepageResult = null;

        try {
          saveButton.classList.add('saving');
          homepageResult = await getHomepageAnalysisForSave(originUrl);
        } finally {
          saveButton.classList.remove('saving');
          saveButton.disabled = false;
        }

        if (homepageResult?.blocked) {
          return;
        }

        if (!homepageResult?.analysis || !homepageResult?.meta) {
          showToast('Unable to save homepage analysis.');
          return;
        }

        saveAnalysis = homepageResult.analysis;
        saveMeta = homepageResult.meta;
        saveContentHash = homepageResult.contentHash;
      }

      const saveUrl = originUrl;

      const { data: insertData, error } = await supabase
        .from('saved_analyses')
        .insert({
          user_id: user.id,
          domain: saveMeta.domain,
          url: saveUrl,
          title: saveMeta.title,
          description: saveMeta.description,
          content_hash: saveContentHash,
          last_analyzed_at: new Date().toISOString(),
          what_they_do: saveAnalysis.whatTheyDo,
          target_customer: saveAnalysis.targetCustomer,
          value_proposition: saveAnalysis.valueProposition,
          sales_angle: saveAnalysis.salesAngle,
          sales_readiness_score: saveAnalysis.salesReadinessScore,
          best_sales_persona: saveAnalysis.bestSalesPersona?.persona,
          best_sales_persona_reason: saveAnalysis.bestSalesPersona?.reason,
          recommended_outreach_persona: saveAnalysis.recommendedOutreach?.persona,
          recommended_outreach_goal: saveAnalysis.recommendedOutreach?.goal,
          recommended_outreach_angle: saveAnalysis.recommendedOutreach?.angle,
          recommended_outreach_message: saveAnalysis.recommendedOutreach?.message,
        })
        .select('id')
        .single();

      if (error) {
        const message =
          error.code === '23505' || /duplicate|unique/i.test(error.message || '')
            ? 'Already saved for this domain.'
            : 'Failed to save. Please try again.';
        console.error('Failed to save:', error);
        showToast(message);
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
}
