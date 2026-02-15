import { state } from '../state.js';

const DEFAULT_SORT = 'created_at_desc';

export function areFiltersActive() {
  const { minScore, maxScore, persona, searchQuery, sort } = state.activeFilters;

  if (minScore > 0) return true;
  if (maxScore < 100) return true;
  if (persona) return true;
  if (searchQuery) return true;
  if (sort && sort !== DEFAULT_SORT) return true;

  return false;
}

function titleCase(value) {
  return value
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatSortLabel(sort) {
  const labels = {
    created_at_desc: 'Most recent',
    created_at_asc: 'Oldest first',
    last_analyzed_at_desc: 'Recently analyzed',
    sales_readiness_score_desc: 'Highest sales score',
    sales_readiness_score_asc: 'Lowest sales score',
    title_asc: 'Company / Title (A-Z)',
    title_desc: 'Company / Title (Z-A)',
  };

  return labels[sort] || 'Custom';
}

export function updateFilterBanner() {
  const banner = document.getElementById('active-filter-banner');
  const text = document.getElementById('filter-banner-text');

  if (!banner || !text) return;

  if (!areFiltersActive()) {
    banner.classList.add('hidden');
    text.textContent = '';
    return;
  }

  const { minScore, maxScore, persona, searchQuery, sort } = state.activeFilters;
  const labels = [];

  if (minScore > 0 || maxScore < 100) {
    labels.push(`Score ${minScore} - ${maxScore}`);
  }

  if (persona) {
    labels.push(`Persona ${titleCase(persona)}`);
  }

  if (searchQuery) {
    labels.push(`Search "${searchQuery}"`);
  }

  if (sort && sort !== DEFAULT_SORT) {
    labels.push(`Sort ${formatSortLabel(sort)}`);
  }

  text.textContent = labels.join(' • ');
  banner.classList.remove('hidden');
}
