import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { renderQuotaBanner, loadQuotaFromAPI } from '../quota.js';
import { showLimitModal } from '../modal.js';
import { updateAnalysisDashboardButton } from '../dashboard-link.js';
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
import { navigateSavedPage } from '../saved/pagination.js';
import { ensureCurrentAnalysisSaved } from '../save-analysis.js';

export function setupSavedHandlers(): void {
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

    document.querySelectorAll<HTMLElement>('.saved-item').forEach((el) => {
      const cb = el.querySelector<HTMLInputElement>('.saved-select-checkbox');
      if (cb && idsToDelete.includes(cb.dataset.id!)) {
        el.dataset.isPendingDelete = 'true';
        el.classList.add('pending-delete');
      }
    });

    exitSelectionMode();

    idsToDelete.forEach((id) => {
      const el = document
        .querySelector<HTMLInputElement>(`.saved-select-checkbox[data-id="${id}"]`)
        ?.closest<HTMLElement>('.saved-item');
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

  document.addEventListener('keydown', (e: KeyboardEvent) => {
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
  const searchInput = document.getElementById('saved-search-input') as HTMLInputElement | null;
  const searchCloseBtn = document.getElementById('search-close-btn');

  searchToggle?.addEventListener('click', () => toggleSearchMode(true));
  searchCloseBtn?.addEventListener('click', () => toggleSearchMode(false));

  searchInput?.addEventListener('input', async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const val = target.value.toLowerCase().trim();

    state.activeFilters.searchQuery = val;

    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) {
      clearBtn.classList.toggle('hidden', val === '');
    }

    await fetchAndRenderPage();
    updateFilterBanner();
  });

  document.getElementById('clear-search-btn')?.addEventListener('click', () => {
    if (searchInput) {
      searchInput.value = '';
      state.activeFilters.searchQuery = '';
      searchInput.focus();
    }
  });

  document.getElementById('no-results-reset')?.addEventListener('click', () => {
    const searchInputEl = document.getElementById('saved-search-input') as HTMLInputElement | null;
    if (searchInputEl) {
      searchInputEl.value = '';
      document.getElementById('clear-search-btn')?.classList.add('hidden');
    }
    state.activeFilters.searchQuery = '';

    const resetBtn = document.querySelector<HTMLButtonElement>('.filter-reset');
    if (resetBtn) {
      resetBtn.click();
    }
    updateSavedEmptyState();
  });

  const saveButton = document.getElementById('saveButton') as HTMLButtonElement | null;

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
      updateAnalysisDashboardButton(null);
      if (Number.isFinite(state.totalSavedCount) && state.totalSavedCount > 0) {
        state.totalSavedCount -= 1;
      }
      renderQuotaBanner();
      loadSavedAnalyses();
      await loadQuotaFromAPI(true);
    } else {
      const savedId = await ensureCurrentAnalysisSaved();
      if (!savedId && !saveButton.classList.contains('active')) {
        return;
      }
    }
  });

  const pagePrev = document.getElementById('page-prev');
  const pageNext = document.getElementById('page-next');

  pagePrev?.addEventListener('click', async () => {
    if (state.currentPage > 1) {
      await navigateSavedPage(state.currentPage - 1);
    }
  });

  pageNext?.addEventListener('click', async () => {
    const totalPages = Math.ceil(state.totalFilteredCount / PAGE_SIZE);
    if (state.currentPage < totalPages) {
      await navigateSavedPage(state.currentPage + 1);
    }
  });
}
