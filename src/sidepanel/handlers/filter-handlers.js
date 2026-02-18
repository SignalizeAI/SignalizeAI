import { state } from '../state.js';
import { fetchAndRenderPage, updateFilterBanner } from '../saved/index.js';

export function setupFilterHandlers() {
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
  const minSlider = document.getElementById('filter-min-score');
  const maxSlider = document.getElementById('filter-max-score');
  const scoreLabel = document.getElementById('filter-score-value');
  const personaInput = document.getElementById('filter-persona');

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

  const searchInput = document.getElementById('saved-search-input');

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
}
