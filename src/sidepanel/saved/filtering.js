import { state } from '../state.js';
import { PAGE_SIZE } from '../constants.js';

export function areFiltersActive() {
  return (
    state.activeFilters.minScore > 0 ||
    state.activeFilters.maxScore < 100 ||
    state.activeFilters.persona !== '' ||
    (state.activeFilters.searchQuery && state.activeFilters.searchQuery.length > 0) ||
    state.activeFilters.sort !== 'created_at_desc'
  );
}

export function updateFilterBanner() {
  const banner = document.getElementById('active-filter-banner');
  const text = document.getElementById('filter-banner-text');

  if (!banner || !text) return;

  const isFiltering = areFiltersActive();
  const isNoResults = state.totalFilteredCount === 0;

  if (isFiltering && !isNoResults) {
    const shownSoFar = Math.min(state.currentPage * PAGE_SIZE, state.totalFilteredCount);

    banner.classList.remove('hidden');
    text.textContent = formatResultsText(shownSoFar, state.totalFilteredCount);
  } else {
    banner.classList.add('hidden');
  }
}

export function formatResultsText(shown, total) {
  if (total === 0) return '';

  if (total <= PAGE_SIZE) {
    return total === 1 ? '1 result found' : `${total} results found`;
  }

  const start = (state.currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(state.currentPage * PAGE_SIZE, total);

  return `Showing ${start}–${end} of ${total}`;
}

export async function toggleSearchMode(active) {
  if (state.isUndoToastActive) return;
  const searchContainer = document.getElementById('search-bar-container');
  const searchInput = document.getElementById('saved-search-input');
  const searchToggleButton = document.getElementById('search-toggle');
  const filterBtn = document.getElementById('filter-toggle');
  const exportBtn = document.getElementById('export-menu-toggle');
  const multiBtn = document.getElementById('multi-select-toggle');

  if (active) {
    searchContainer.classList.remove('hidden');

    searchToggleButton?.classList.add('hidden');

    filterBtn?.classList.add('hidden');
    exportBtn?.classList.add('hidden');
    multiBtn?.classList.add('hidden');
    searchInput.focus();
  } else {
    const { updateSavedEmptyState } = await import('./rendering.js');
    const { fetchAndRenderPage } = await import('./data.js');

    searchContainer.classList.add('hidden');

    searchToggleButton?.classList.remove('hidden');

    filterBtn?.classList.remove('hidden');
    exportBtn?.classList.remove('hidden');
    multiBtn?.classList.remove('hidden');
    updateSavedEmptyState();

    searchInput.value = '';
    state.activeFilters.searchQuery = '';
    await fetchAndRenderPage();
    updateFilterBanner();
  }
}
