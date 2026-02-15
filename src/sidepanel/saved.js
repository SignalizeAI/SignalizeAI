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
    last_analyzed_at_desc: { column: 'last_analyzed_at', ascending: false },
    sales_readiness_score_desc: { column: 'sales_readiness_score', ascending: false },
    sales_readiness_score_asc: { column: 'sales_readiness_score', ascending: true },
    title_asc: { column: 'title', ascending: true },
    title_desc: { column: 'title', ascending: false },
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
  state.isUndoToastActive = true;
  document.body.classList.add('undo-active');

  let toast = document.getElementById('undo-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'undo-toast';
    toast.className = 'toast-snackbar';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-main">
        <span id="toast-message"></span>
      </div>
      <div class="toast-actions">
        <button id="undo-button">UNDO</button>
        <button id="close-toast-btn">✕</button>
      </div>
    </div>
    <div class="undo-progress-container">
      <div class="undo-progress-bar"></div>
    </div>
  `;

  const message = document.getElementById('toast-message');
  if (message) {
    message.textContent = `${state.pendingDeleteMap.size} item(s) deleted`;
  }

  toast.classList.add('show');

  const undoBtn = document.getElementById('undo-button');
  const closeBtn = document.getElementById('close-toast-btn');

  if (undoBtn) {
    undoBtn.onclick = async () => {
      state.isUndoToastActive = false;
      document.body.classList.remove('undo-active');
      clearTimeout(state.undoTimer);
      toast.classList.remove('show');

      state.pendingDeleteMap.forEach(({ element }) => {
        if (!element) return;
        delete element.dataset.isPendingDelete;
        element.classList.remove('pending-delete');
      });

      state.pendingDeleteMap.clear();
      const list = document.getElementById('saved-list');
      const count = list ? list.querySelectorAll('.saved-item').length : 0;
      updateSavedEmptyState(list, count);
      await loadQuotaFromAPI(true);
    };
  }

  if (closeBtn) {
    closeBtn.onclick = finalizePendingDeletes;
  }

  clearTimeout(state.undoTimer);
  state.undoTimer = setTimeout(finalizePendingDeletes, 5000);
}

export async function finalizePendingDeletes() {
  if (state.isFinalizingDeletes) return;
  state.isFinalizingDeletes = true;

  clearTimeout(state.undoTimer);
  const toast = document.getElementById('undo-toast');
  toast?.classList.remove('show');

  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) {
    state.isFinalizingDeletes = false;
    return;
  }

  while (state.pendingDeleteMap.size > 0) {
    const batch = Array.from(state.pendingDeleteMap.values());
    state.pendingDeleteMap.clear();

    for (const item of batch) {
      try {
        await item.finalize();
      } catch (err) {
        console.error('Delete failed:', err);
        if (item.element) {
          delete item.element.dataset.isPendingDelete;
          item.element.classList.remove('pending-delete');
        }
        showToast('Delete failed. Item restored.');
      }
    }
  }

  state.isFinalizingDeletes = false;
  state.isUndoToastActive = false;
  document.body.classList.remove('undo-active');
  await fetchAndRenderPage();
  updateFilterBanner();
  await loadQuotaFromAPI();
}

export async function toggleSearchMode(active) {
  if (state.isUndoToastActive) return;
  const searchContainer = document.getElementById('search-bar-container');
  const searchInput = document.getElementById('saved-search-input');
  const searchToggleButton = document.getElementById('search-toggle');
  const filterBtn = document.getElementById('filter-toggle');
  const exportBtn = document.getElementById('export-menu-toggle');
  const multiBtn = document.getElementById('multi-select-toggle');

  if (!searchContainer || !searchInput) return;

  if (active) {
    searchContainer.classList.remove('hidden');

    searchToggleButton?.classList.add('hidden');

    filterBtn?.classList.add('hidden');
    exportBtn?.classList.add('hidden');
    multiBtn?.classList.add('hidden');
    searchInput.focus();
  } else {
    searchContainer.classList.add('hidden');

    searchToggleButton?.classList.remove('hidden');

    filterBtn?.classList.remove('hidden');
    exportBtn?.classList.remove('hidden');
    updateSavedEmptyState(
      document.getElementById('saved-list'),
      document.querySelectorAll('#saved-list .saved-item').length
    );

    searchInput.value = '';
    state.activeFilters.searchQuery = '';
    await fetchAndRenderPage();
    updateFilterBanner();
  }
}
