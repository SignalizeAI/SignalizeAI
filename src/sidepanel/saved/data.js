import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { PAGE_SIZE } from '../constants.js';
import { exitSelectionMode } from './selection.js';
import { updateSavedEmptyState, renderSavedItem } from './rendering.js';
import { renderPagination } from './pagination.js';
import { updateFilterBanner } from './filtering.js';

export async function loadSavedAnalyses() {
  state.currentPage = 1;
  exitSelectionMode();
  state.lastSelectedIndex = null;

  const listEl = document.getElementById('saved-list');
  const loadingEl = document.getElementById('saved-loading');
  const emptyEl = document.getElementById('saved-empty');

  listEl.innerHTML = '';
  loadingEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  await fetchAndRenderPage();
}

export async function fetchAndRenderPage() {
  const listEl = document.getElementById('saved-list');
  const loadingEl = document.getElementById('saved-loading');

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  loadingEl.classList.remove('hidden');
  listEl.innerHTML = '';

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

  if (state.activeFilters.searchQuery) {
    const q = `%${state.activeFilters.searchQuery}%`;
    countQuery = countQuery.or(`title.ilike.${q},domain.ilike.${q}`);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error(countError);
    loadingEl.classList.add('hidden');
    return;
  }

  state.totalFilteredCount = count || 0;

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

  loadingEl.classList.add('hidden');

  if (error) {
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    updateSavedEmptyState(0);
    renderPagination(0);
    return;
  }

  data.forEach((row) => {
    listEl.appendChild(renderSavedItem(row));
  });

  updateSavedEmptyState(data.length);
  renderPagination(Math.ceil(state.totalFilteredCount / PAGE_SIZE));
  updateFilterBanner();
}

export async function fetchSavedAnalysesData() {
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
