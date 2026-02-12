import { PAGE_SIZE } from './constants.js';
import { supabase } from './supabase.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { loadQuotaFromAPI } from './quota.js';
import {
  exitSelectionMode,
  toggleSelectAllVisible,
  updateDeleteState,
  updateSavedActionsVisibility,
  updateSelectionUI,
} from './saved/selection.js';
import { areFiltersActive, updateFilterBanner } from './saved/filters.js';
import { renderPagination } from './saved/pagination.js';
import { handleExport } from './saved/export.js';
import { renderSavedItem } from './saved/render.js';

export { exitSelectionMode, toggleSelectAllVisible, updateDeleteState, updateSelectionUI };
export { updateFilterBanner, areFiltersActive };
export { renderPagination };
export { handleExport };

export function updateSavedEmptyState(list, count) {
  const empty = document.getElementById('saved-empty');
  if (!empty) return;

  const isFiltering = areFiltersActive();
  const noVisibleSaved = count === 0;

  if (noVisibleSaved) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
  }

  const title = empty.querySelector('.empty-title');
  const subtitle = empty.querySelector('.empty-subtitle');

  if (isFiltering && noVisibleSaved) {
    if (title) title.textContent = 'No filtered results';
    if (subtitle) {
      subtitle.textContent = 'Try adjusting your filters to see more saved analyses.';
    }
  } else {
    if (title) title.textContent = 'No saved analyses';
    if (subtitle) subtitle.textContent = 'Save your first analysis to see it here.';
  }

  updateSavedActionsVisibility(count);
}

export async function loadSavedAnalyses() {
  const list = document.getElementById('saved-list');
  const loadingState = document.getElementById('saved-loading');

  if (!list || !loadingState) return;

  list.innerHTML = '';
  loadingState.classList.remove('hidden');

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;

  if (!user) {
    loadingState.classList.add('hidden');
    return;
  }

  const { data, error } = await supabase
    .from('saved_analyses')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);

  loadingState.classList.add('hidden');

  if (error) {
    showToast('Failed to load saved analyses.');
    return;
  }

  state.totalSavedCount = data.length;
  state.totalFilteredCount = data.length;

  if (!data.length) {
    updateSavedEmptyState(list, 0);
    return;
  }

  data.forEach((item) => {
    list.appendChild(renderSavedItem(item, showUndoToast));
  });

  updateSavedEmptyState(list, data.length);
  renderPagination(1, () => {});
  updateFilterBanner();
}

export async function fetchAndRenderPage() {
  const list = document.getElementById('saved-list');
  if (!list) return;

  list.innerHTML = '';

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  let query = supabase
    .from('saved_analyses')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id);

  const { minScore, maxScore, persona, searchQuery, sort } = state.activeFilters;

  if (minScore > 0) query = query.gte('sales_readiness_score', minScore);
  if (maxScore < 100) query = query.lte('sales_readiness_score', maxScore);
  if (persona) query = query.eq('best_sales_persona', persona);

  if (searchQuery) {
    query = query.or(
      `title.ilike.%${searchQuery}%,domain.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`
    );
  }

  const sortMap = {
    created_at_desc: { column: 'created_at', ascending: false },
    created_at_asc: { column: 'created_at', ascending: true },
    score_desc: { column: 'sales_readiness_score', ascending: false },
    score_asc: { column: 'sales_readiness_score', ascending: true },
  };

  const sortConfig = sortMap[sort] || sortMap.created_at_desc;
  query = query.order(sortConfig.column, { ascending: sortConfig.ascending });

  const start = (state.currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;

  const { data, error, count } = await query.range(start, end);

  if (error) {
    showToast('Failed to load saved analyses.');
    return;
  }

  state.totalFilteredCount = count || 0;

  if (!data || data.length === 0) {
    updateSavedEmptyState(list, 0);
    renderPagination(1, () => {});
    updateFilterBanner();
    return;
  }

  data.forEach((item) => list.appendChild(renderSavedItem(item, showUndoToast)));

  const totalPages = Math.ceil(state.totalFilteredCount / PAGE_SIZE);

  updateSavedEmptyState(list, data.length);
  renderPagination(totalPages, async (page) => {
    state.currentPage = page;
    await fetchAndRenderPage();
  });
  updateFilterBanner();
  updateSelectionUI();
}

export function showUndoToast() {
  const toast = document.getElementById('undo-toast');

  if (!toast || state.isUndoToastActive) return;

  state.isUndoToastActive = true;
  toast.classList.remove('hidden');

  const hideToast = () => {
    toast.classList.add('hidden');
    state.isUndoToastActive = false;
  };

  const finalizeDeletes = async () => {
    await finalizePendingDeletes();
    hideToast();
  };

  const undoBtn = toast.querySelector('.undo-btn');
  const closeBtn = toast.querySelector('.close-toast-btn');

  const undoHandler = () => {
    state.pendingDeleteMap.forEach(({ element }) => {
      if (!element) return;

      element.dataset.isPendingDelete = 'false';
      element.classList.remove('pending-delete');
    });

    state.pendingDeleteMap.clear();
    hideToast();
    updateFilterBanner();
  };

  const closeHandler = () => {
    finalizeDeletes();
  };

  undoBtn.addEventListener('click', undoHandler, { once: true });
  closeBtn.addEventListener('click', closeHandler, { once: true });

  toast.addEventListener(
    'transitionend',
    () => {
      if (!state.isUndoToastActive) {
        undoBtn.removeEventListener('click', undoHandler);
        closeBtn.removeEventListener('click', closeHandler);
      }
    },
    { once: true }
  );

  setTimeout(() => {
    if (state.isUndoToastActive) finalizeDeletes();
  }, 5000);
}

async function finalizePendingDeletes() {
  if (!state.pendingDeleteMap.size) return;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  const idsToDelete = Array.from(state.pendingDeleteMap.keys());

  await supabase.from('saved_analyses').delete().eq('user_id', user.id).in('id', idsToDelete);

  state.pendingDeleteMap.forEach(({ element }) => {
    if (element) element.remove();
  });

  state.pendingDeleteMap.clear();

  const list = document.getElementById('saved-list');
  if (!list) return;

  updateSavedEmptyState(list, list.children.length);
  updateFilterBanner();
  await loadQuotaFromAPI();

  const remainingCount = list.querySelectorAll('.saved-item').length;
  if (remainingCount <= 1 && state.selectionMode) {
    exitSelectionMode();
  }
}

export function toggleSearchMode() {
  const searchRow = document.querySelector('.search-row');
  if (!searchRow) return;

  state.isSearchMode = !state.isSearchMode;

  searchRow.classList.toggle('hidden', !state.isSearchMode);

  if (!state.isSearchMode) {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    state.activeFilters.searchQuery = '';
    state.currentPage = 1;
    fetchAndRenderPage();
  }

  updateFilterBanner();
}
