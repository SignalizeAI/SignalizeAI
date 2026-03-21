import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { PAGE_SIZE } from '../constants.js';
import { exitSelectionMode } from './selection.js';
import { updateSavedEmptyState, renderSavedItem, updatePlanLimitBanner } from './rendering.js';
import { renderPagination } from './pagination.js';
import { updateFilterBanner } from './filtering.js';
import { loadQuotaFromAPI } from '../quota.js';

export async function loadSavedAnalyses(): Promise<void> {
  state.currentPage = 1;
  exitSelectionMode();
  state.lastSelectedIndex = null;

  const listEl = document.getElementById('saved-list');
  const loadingEl = document.getElementById('saved-loading');
  const emptyEl = document.getElementById('saved-empty');

  if (listEl) listEl.innerHTML = '';
  loadingEl?.classList.remove('hidden');
  emptyEl?.classList.add('hidden');

  await loadQuotaFromAPI();

  await fetchAndRenderPage();
}

export function showSavedPaginationSkeleton(count = PAGE_SIZE): void {
  const listEl = document.getElementById('saved-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'saved-skeleton-item';
    row.innerHTML = `
      <div class="saved-skeleton-line title"></div>
      <div class="saved-skeleton-line sub"></div>
    `;
    listEl.appendChild(row);
  }
}

export async function fetchAndRenderPage(options?: {
  paginationTransition?: boolean;
}): Promise<void> {
  const paginationTransition = options?.paginationTransition === true;
  const listEl = document.getElementById('saved-list');
  const loadingEl = document.getElementById('saved-loading');

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  if (!paginationTransition) {
    loadingEl?.classList.remove('hidden');
    if (listEl) listEl.innerHTML = '';
  }

  let countQuery = supabase
    .from('saved_analyses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (state.activeFilters.minScore > 0) {
    countQuery = countQuery.gte('sales_readiness_score', state.activeFilters.minScore);
  }

  if (state.activeFilters.maxScore < 100) {
    countQuery = countQuery.lte('sales_readiness_score', state.activeFilters.maxScore);
  }

  if (state.activeFilters.persona) {
    countQuery = countQuery.ilike('best_sales_persona', `%${state.activeFilters.persona}%`);
  }
  if (state.activeFilters.status) {
    countQuery = countQuery.eq('prospect_status', state.activeFilters.status);
  }

  if (state.activeFilters.searchQuery) {
    const q = `%${state.activeFilters.searchQuery}%`;
    countQuery = countQuery.or(`title.ilike.${q},domain.ilike.${q}`);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error(countError);
    loadingEl?.classList.add('hidden');
    return;
  }

  state.totalFilteredCount = count || 0;
  const totalPages = Math.max(1, Math.ceil(state.totalFilteredCount / PAGE_SIZE));
  if (state.currentPage > totalPages) {
    state.currentPage = totalPages;
  }

  let dataQuery = supabase
    .from('saved_analyses')
    .select(
      `
      *,
      recommended_outreach_persona,
      recommended_outreach_goal,
      recommended_outreach_angle,
      recommended_outreach_message
    `
    )
    .eq('user_id', user.id);

  if (state.activeFilters.minScore > 0) {
    dataQuery = dataQuery.gte('sales_readiness_score', state.activeFilters.minScore);
  }
  if (state.activeFilters.maxScore < 100) {
    dataQuery = dataQuery.lte('sales_readiness_score', state.activeFilters.maxScore);
  }
  if (state.activeFilters.persona) {
    dataQuery = dataQuery.ilike('best_sales_persona', `%${state.activeFilters.persona}%`);
  }
  if (state.activeFilters.status) {
    dataQuery = dataQuery.eq('prospect_status', state.activeFilters.status);
  }
  if (state.activeFilters.searchQuery) {
    const q = `%${state.activeFilters.searchQuery}%`;
    dataQuery = dataQuery.or(`title.ilike.${q},domain.ilike.${q}`);
  }

  const from = (state.currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let sortColumn = 'created_at';
  let sortAsc = false;

  switch (state.activeFilters.sort) {
    case 'created_at_asc':
      sortColumn = 'created_at';
      sortAsc = true;
      break;

    case 'created_at_desc':
      sortColumn = 'created_at';
      sortAsc = false;
      break;

    case 'last_analyzed_at_desc':
      sortColumn = 'last_analyzed_at';
      sortAsc = false;
      break;

    case 'sales_readiness_score_desc':
      sortColumn = 'sales_readiness_score';
      sortAsc = false;
      break;

    case 'sales_readiness_score_asc':
      sortColumn = 'sales_readiness_score';
      sortAsc = true;
      break;

    case 'title_asc':
      sortColumn = 'title';
      sortAsc = true;
      break;

    case 'title_desc':
      sortColumn = 'title';
      sortAsc = false;
      break;
  }

  const { data, error } = await dataQuery.order(sortColumn, { ascending: sortAsc }).range(from, to);

  loadingEl?.classList.add('hidden');

  if (error) {
    console.error(error);
    return;
  }

  if (listEl) listEl.innerHTML = '';

  if (!data || data.length === 0) {
    updateSavedEmptyState(0);
    renderPagination(0);
    return;
  }

  const visibleItems = data.slice(0, Math.min(data.length, state.maxSavedLimit));
  const hasExceededLimit = state.totalFilteredCount > state.maxSavedLimit;

  visibleItems.forEach((row) => {
    listEl?.appendChild(renderSavedItem(row));
  });

  updateSavedEmptyState(visibleItems.length);
  renderPagination(Math.ceil(Math.min(state.totalFilteredCount, state.maxSavedLimit) / PAGE_SIZE));
  updateFilterBanner();
  updatePlanLimitBanner();

  (window as any).signalizeAnalysisLimitInfo = {
    visibleCount: visibleItems.length,
    totalCount: state.totalSavedCount,
    hasExceededLimit: hasExceededLimit,
  };
}

export async function fetchSavedAnalysesData(): Promise<any[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from('saved_analyses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data;
}

export async function fetchSavedAnalysisById(savedId: string): Promise<any | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user || !savedId) return null;

  const { data, error } = await supabase
    .from('saved_analyses')
    .select('*')
    .eq('user_id', user.id)
    .eq('id', savedId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}
