import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { renderQuotaBanner, loadQuotaFromAPI } from '../quota.js';
import { showLimitModal } from '../modal.js';
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
