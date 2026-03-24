import { state } from '../state.js';
import { fetchAndRenderPage, updateFilterBanner } from '../saved/index.js';

export function setupFilterHandlers(): void {
  const filterToggle = document.getElementById('filter-toggle');
  const filterPanel = document.getElementById('filter-panel');
  const exportToggleBtn = document.getElementById('export-menu-toggle');

  filterToggle?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    document.getElementById('export-menu')?.classList.add('hidden');
    exportToggleBtn?.setAttribute('aria-expanded', 'false');

    filterPanel?.classList.toggle('hidden');

    const expanded = filterToggle.getAttribute('aria-expanded') === 'true';
    filterToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!filterPanel || filterPanel.classList.contains('hidden')) return;

    if (!filterPanel.contains(e.target as Node) && !filterToggle!.contains(e.target as Node)) {
      filterPanel.classList.add('hidden');
      filterToggle!.setAttribute('aria-expanded', 'false');
    }
  });

  const filterApplyBtn = document.querySelector<HTMLButtonElement>('.filter-apply');

  filterApplyBtn?.addEventListener('click', async () => {
    state.activeFilters.minScore = Number(
      (document.getElementById('filter-min-score') as HTMLInputElement)?.value || 0
    );
    state.activeFilters.maxScore = Number(
      (document.getElementById('filter-max-score') as HTMLInputElement)?.value || 100
    );

    state.activeFilters.persona = (
      document.getElementById('filter-persona') as HTMLInputElement
    )?.value
      .toLowerCase()
      .trim();
    state.activeFilters.status = (
      document.getElementById('filter-status') as HTMLInputElement
    )?.value
      .toLowerCase()
      .trim();

    const sortValue = document.querySelector<HTMLInputElement>('input[name="sort"]:checked')?.value;
    if (sortValue) {
      state.activeFilters.sort = sortValue;
    }

    state.currentPage = 1;
    filterPanel?.classList.add('hidden');
    filterToggle?.setAttribute('aria-expanded', 'false');

    await fetchAndRenderPage();
    updateFilterBanner();
  });

  const filterResetBtn = document.querySelector<HTMLButtonElement>('.filter-reset');
  const minSlider = document.getElementById('filter-min-score') as HTMLInputElement | null;
  const maxSlider = document.getElementById('filter-max-score') as HTMLInputElement | null;
  const scoreLabel = document.getElementById('filter-score-value');
  const personaInput = document.getElementById('filter-persona') as HTMLInputElement | null;
  const statusInput = document.getElementById('filter-status') as HTMLInputElement | null;

  filterResetBtn?.addEventListener('click', async () => {
    state.activeFilters.minScore = 0;
    state.activeFilters.maxScore = 100;
    state.activeFilters.persona = '';
    state.activeFilters.status = '';
    state.activeFilters.searchQuery = '';
    state.activeFilters.sort = 'created_at_desc';

    if (minSlider) minSlider.value = '0';
    if (maxSlider) maxSlider.value = '100';
    if (personaInput) personaInput.value = '';
    if (statusInput) statusInput.value = '';
    if (scoreLabel) scoreLabel.textContent = '0 – 100';

    document
      .querySelector<HTMLInputElement>('input[name="sort"][value="created_at_desc"]')
      ?.click();

    filterPanel?.classList.add('hidden');
    filterToggle?.setAttribute('aria-expanded', 'false');

    await fetchAndRenderPage();
    updateFilterBanner();
  });

  function updateScoreFilter(): void {
    let minVal = Number(minSlider!.value);
    const maxVal = Number(maxSlider!.value);

    if (minVal > maxVal) {
      minSlider!.value = String(maxVal);
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

  const searchInput = document.getElementById('saved-search-input') as HTMLInputElement | null;

  document.getElementById('reset-filters-link')?.addEventListener('click', async () => {
    state.activeFilters.minScore = 0;
    state.activeFilters.maxScore = 100;
    state.activeFilters.persona = '';
    state.activeFilters.status = '';
    state.activeFilters.searchQuery = '';
    state.activeFilters.sort = 'created_at_desc';

    if (minSlider) minSlider.value = '0';
    if (maxSlider) maxSlider.value = '100';
    if (personaInput) personaInput.value = '';
    if (statusInput) statusInput.value = '';
    if (scoreLabel) scoreLabel.textContent = '0 – 100';

    if (searchInput) searchInput.value = '';

    document
      .querySelector<HTMLInputElement>('input[name="sort"][value="created_at_desc"]')
      ?.click();

    state.currentPage = 1;
    await fetchAndRenderPage();
    updateFilterBanner();
  });
}
