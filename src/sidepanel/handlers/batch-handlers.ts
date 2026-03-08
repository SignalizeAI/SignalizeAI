import { state } from '../state.js';
import { supabase } from '../supabase.js';
import { loadQuotaFromAPI, renderQuotaBanner } from '../quota.js';
import { analyzeWebsiteContent } from '../../ai-analyze.js';
import { hashContent } from '../cache.js';
import { fetchAndExtractContent } from '../analysis/fetcher.js';
import { showToast } from '../toast.js';
import { showActionTooltip } from '../clipboard.js';

interface Content {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
}

interface BatchResult {
  url: string;
  domain: string;
  content: Content;
  analysis: any;
  contentHash: string;
  status: 'ready' | 'saved' | 'error';
  error?: string;
}

let isBatchCancelled = false;
let tempBatchResults: BatchResult[] = [];
let pendingCsvUrls: string[] = [];
let batchSearchQuery = '';
let batchCurrentPage = 1;
let isBatchSelectionMode = false;
let lastBatchInputMode: 'csv' | 'paste' = 'csv';
const BATCH_PAGE_SIZE = 10;

export function setupBatchHandlers() {
  const dropZone = document.getElementById('csv-drop-zone');
  const fileInput = document.getElementById('batch-csv-upload') as HTMLInputElement;
  const cancelBtn = document.getElementById('batch-cancel-btn');

  const reviewDoneBtn = document.getElementById('batch-review-done-btn');

  const tabCsv = document.getElementById('batch-tab-csv');
  const tabPaste = document.getElementById('batch-tab-paste');
  const pasteZone = document.getElementById('paste-url-zone');
  const pasteInput = document.getElementById('batch-paste-input') as HTMLTextAreaElement;
  const pasteSubmit = document.getElementById('batch-paste-submit-btn');
  const csvSubmitBtn = document.getElementById('batch-csv-submit-btn');

  csvSubmitBtn?.addEventListener('click', () => {
    if (pendingCsvUrls.length === 0) return;

    const isTeamPlan = (state.currentPlan || '').toLowerCase() === 'team';
    const limit = isTeamPlan ? 100 : 10;

    const urlsToProcess = pendingCsvUrls.length > limit ? pendingCsvUrls.slice(0, limit) : pendingCsvUrls;
    lastBatchInputMode = 'csv';
    startBatchProcess(urlsToProcess);
  });

  tabCsv?.addEventListener('click', () => {
    const csvSubmitZone = document.getElementById('csv-submit-zone');
    if (dropZone) dropZone.classList.remove('hidden');
    if (csvSubmitZone) csvSubmitZone.classList.remove('hidden');
    if (pasteZone) pasteZone.classList.add('hidden');
    if (tabCsv) {
      tabCsv.style.background = 'var(--bg-primary)';
      tabCsv.style.color = 'var(--text-primary)';
      tabCsv.style.fontWeight = '600';
      tabCsv.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
    }
    if (tabPaste) {
      tabPaste.style.background = 'transparent';
      tabPaste.style.color = 'var(--text-secondary)';
      tabPaste.style.fontWeight = '500';
      tabPaste.style.boxShadow = 'none';
    }
  });

  tabPaste?.addEventListener('click', () => {
    const csvSubmitZone = document.getElementById('csv-submit-zone');
    if (dropZone) dropZone.classList.add('hidden');
    if (csvSubmitZone) csvSubmitZone.classList.add('hidden');
    if (pasteZone) pasteZone.classList.remove('hidden');
    if (tabPaste) {
      tabPaste.style.background = 'var(--bg-primary)';
      tabPaste.style.color = 'var(--text-primary)';
      tabPaste.style.fontWeight = '600';
      tabPaste.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
    }
    if (tabCsv) {
      tabCsv.style.background = 'transparent';
      tabCsv.style.color = 'var(--text-secondary)';
      tabCsv.style.fontWeight = '500';
      tabCsv.style.boxShadow = 'none';
    }
  });

  pasteInput?.addEventListener('focus', () => {
    pasteInput.style.borderColor = 'var(--accent-color)';
    pasteInput.style.boxShadow = '0 0 0 2px var(--accent-light)';
  });
  pasteInput?.addEventListener('blur', () => {
    pasteInput.style.borderColor = 'var(--border-medium)';
    pasteInput.style.boxShadow = 'none';
  });

  pasteInput?.addEventListener('input', () => {
    const text = pasteInput.value.trim();
    const warningNode = document.getElementById('batch-paste-limit-warning');

    if (text.length > 0) {
      pasteSubmit?.classList.add('has-content');

      const urls = parseUrlsFromText(text);
      const isTeamPlan = (state.currentPlan || '').toLowerCase() === 'team';
      const limit = isTeamPlan ? 100 : 10;

      if (urls.length > limit && warningNode) {
        warningNode.textContent = `Note: First ${limit} URLs will be analyzed (exceeds plan limit)`;
        warningNode.classList.remove('hidden');
      } else if (warningNode) {
        warningNode.classList.add('hidden');
      }
    } else {
      pasteSubmit?.classList.remove('has-content');
      if (warningNode) warningNode.classList.add('hidden');
    }
  });

  pasteSubmit?.addEventListener('click', async () => {
    if (!pasteInput) return;
    const text = pasteInput.value;
    const urls = parseUrlsFromText(text);

    if (urls.length === 0) {
      const { showErrorToast } = await import('../toast.js');
      showErrorToast('No valid URL(s) found');
      return;
    }

    const isTeamPlan = (state.currentPlan || '').toLowerCase() === 'team';
    const limit = isTeamPlan ? 100 : 10;

    const urlsToProcess = urls.length > limit ? urls.slice(0, limit) : urls;
    lastBatchInputMode = 'paste';
    startBatchProcess(urlsToProcess);
  });

  if (dropZone) {
    dropZone.addEventListener('click', () => fileInput?.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.backgroundColor = 'var(--bg-hover)';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.backgroundColor = 'transparent';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.backgroundColor = 'transparent';
      const file = e.dataTransfer?.files[0];
      if (file) handleFileUpload(file);
    });
  }

  fileInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleFileUpload(file);
    if (fileInput) fileInput.value = '';
  });

  cancelBtn?.addEventListener('click', () => {
    isBatchCancelled = true;
    cancelBtn.textContent = 'Cancelling...';
    cancelBtn.setAttribute('disabled', 'true');
  });

  const saveAllBtn = document.getElementById('batch-save-all-btn');
  saveAllBtn?.addEventListener('click', () => saveAllBatchSelection());

  const multiSelectToggle = document.getElementById('batch-multi-select-toggle');
  const selectionBackBtn = document.getElementById('batch-selection-back-btn');
  const selectAllBtn = document.getElementById('batch-select-all-btn');
  const saveSelectedBtn = document.getElementById('batch-save-selected-btn');

  multiSelectToggle?.addEventListener('click', () => {
    isBatchSelectionMode = true;
    renderBatchResultsPage();
  });

  selectionBackBtn?.addEventListener('click', () => {
    isBatchSelectionMode = false;
    renderBatchResultsPage();
  });

  selectAllBtn?.addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.batch-item-checkbox:not(:disabled)') as NodeListOf<HTMLInputElement>;
    const anyUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
    checkboxes.forEach((cb) => cb.checked = anyUnchecked);
  });

  saveSelectedBtn?.addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('.batch-item-checkbox:checked') as NodeListOf<HTMLInputElement>;
    const indicesToSave = Array.from(checkboxes).map(cb => parseInt(cb.dataset.index!));
    if (indicesToSave.length === 0) {
      const { showToast } = await import('../toast.js');
      showToast('No items selected');
      return;
    }

    // Switch back from selection mode on save selected
    isBatchSelectionMode = false;
    await saveSpecificBatchSelection(indicesToSave, saveSelectedBtn as HTMLButtonElement);
  });

  const searchToggle = document.getElementById('batch-search-toggle');
  const searchInput = document.getElementById('batch-search-input') as HTMLInputElement | null;
  const searchCloseBtn = document.getElementById('batch-search-close-btn');
  const searchBarContainer = document.getElementById('batch-search-bar-container');

  searchToggle?.addEventListener('click', () => {
    searchBarContainer?.classList.remove('hidden');
    searchInput?.focus();
    renderBatchResultsPage();
  });

  const exportToggle = document.getElementById('batch-export-menu-toggle');
  const exportMenu = document.getElementById('batch-export-menu');
  const exportCsv = document.getElementById('batch-export-csv');
  const exportXlsx = document.getElementById('batch-export-xlsx');

  exportToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu?.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!exportToggle?.contains(e.target as Node) && !exportMenu?.contains(e.target as Node)) {
      exportMenu?.classList.add('hidden');
    }
  });

  exportCsv?.addEventListener('click', async () => {
    exportMenu?.classList.add('hidden');
    const { exportToCSV } = await import('../saved/export.js');
    exportToCSV(getFilteredBatchResults().map(mapBatchResultToExportItem));
  });

  exportXlsx?.addEventListener('click', async () => {
    exportMenu?.classList.add('hidden');
    const { exportToExcel } = await import('../saved/export.js');
    exportToExcel(getFilteredBatchResults().map(mapBatchResultToExportItem));
  });

  searchCloseBtn?.addEventListener('click', () => {
    searchBarContainer?.classList.add('hidden');
    if (searchInput) searchInput.value = '';
    batchSearchQuery = '';
    batchCurrentPage = 1;
    renderBatchResultsPage();
  });

  searchInput?.addEventListener('input', (e) => {
    batchSearchQuery = (e.target as HTMLInputElement).value.toLowerCase().trim();
    batchCurrentPage = 1;
    renderBatchResultsPage();
  });

  const pagePrev = document.getElementById('batch-page-prev');
  const pageNext = document.getElementById('batch-page-next');

  pagePrev?.addEventListener('click', () => {
    if (batchCurrentPage > 1) {
      batchCurrentPage--;
      renderBatchResultsPage();
    }
  });

  pageNext?.addEventListener('click', () => {
    const isTeamPlan = (state.currentPlan || '').toLowerCase() === 'team';
    const totalFiltered = getFilteredBatchResults().length;
    const totalPages = Math.ceil(totalFiltered / BATCH_PAGE_SIZE);
    if (batchCurrentPage < totalPages) {
      batchCurrentPage++;
      renderBatchResultsPage();
    }
  });

  reviewDoneBtn?.addEventListener('click', () => {
    const reviewContainer = document.getElementById('batch-review-container');
    const uploadContainer = document.getElementById('batch-upload-container');
    const headerActions = document.getElementById('batch-header-actions');
    if (reviewContainer) reviewContainer.classList.add('hidden');
    if (headerActions) headerActions.classList.add('hidden');
    if (uploadContainer) uploadContainer.style.display = 'flex';
    tempBatchResults = [];
    if (pasteInput) pasteInput.value = '';
    if (pasteSubmit) pasteSubmit.classList.remove('has-content');

    const pasteWarning = document.getElementById('batch-paste-limit-warning');
    if (pasteWarning) pasteWarning.classList.add('hidden');

    pendingCsvUrls = [];
    const dropZoneTitle = document.getElementById('drop-zone-title');
    const dropZoneDesc = document.getElementById('drop-zone-desc');
    const submitBtn = document.getElementById('batch-csv-submit-btn');
    const csvWarning = document.getElementById('batch-csv-limit-warning');

    if (dropZoneTitle) dropZoneTitle.textContent = 'Upload CSV file';
    if (dropZoneDesc) dropZoneDesc.textContent = 'Drag & drop or click';
    if (submitBtn) submitBtn.classList.remove('has-file');
    if (csvWarning) csvWarning.classList.add('hidden');
    if (fileInput) fileInput.value = '';
  });

  const batchMenuBtn = document.getElementById('menu-batch-analysis');
  batchMenuBtn?.addEventListener('click', () => {
    const limitDisplay = document.getElementById('batch-limit-display');
    const pasteLimitDisplay = document.getElementById('batch-paste-limit-display');
    if (state.currentPlan) {
      const planName = state.currentPlan.toUpperCase();
      const limit = state.currentPlan.toLowerCase() === 'team' ? '100' : '10';
      const text = `${planName} PLAN: ${limit} URLs per batch`;
      if (limitDisplay) limitDisplay.textContent = text;
      if (pasteLimitDisplay) pasteLimitDisplay.textContent = text;
    }
  });
}

function parseUrlsFromText(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const urls: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Basic heuristics for a URL/domain
    if (trimmed.includes('.') && !trimmed.includes(' ')) {
      const fullUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      try {
        new URL(fullUrl);
        urls.push(fullUrl);
      } catch {
        /* ignore */
      }
    }
  }
  return urls;
}

function parseUrlsFromCsv(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const urls: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split(',');
    for (const col of cols) {
      const cleanCol = col.replace(/^["']|["']$/g, '').trim();
      if (cleanCol.includes('.') && !cleanCol.includes(' ')) {
        const fullUrl = cleanCol.startsWith('http') ? cleanCol : `https://${cleanCol}`;
        try {
          new URL(fullUrl);
          urls.push(fullUrl);
          break;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return urls;
}

async function handleFileUpload(file: File) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    const { showErrorToast } = await import('../toast.js');
    showErrorToast('Please upload a CSV file');
    return;
  }
  isBatchCancelled = false;
  const text = await file.text();
  const urls = parseUrlsFromCsv(text);

  if (urls.length === 0) {
    const { showErrorToast } = await import('../toast.js');
    showErrorToast('Upload a CSV with URL(s)');
    return;
  }

  pendingCsvUrls = urls;

  const dropZoneTitle = document.getElementById('drop-zone-title');
  const dropZoneDesc = document.getElementById('drop-zone-desc');
  const submitBtn = document.getElementById('batch-csv-submit-btn');
  const warningNode = document.getElementById('batch-csv-limit-warning');

  if (dropZoneTitle) dropZoneTitle.textContent = file.name;
  if (dropZoneDesc) dropZoneDesc.textContent = `${urls.length} URLs detected`;
  if (submitBtn) submitBtn.classList.add('has-file');

  const isTeamPlan = (state.currentPlan || '').toLowerCase() === 'team';
  const limit = isTeamPlan ? 100 : 10;

  if (urls.length > limit && warningNode) {
    warningNode.textContent = `Note: First ${limit} URLs will be analyzed (exceeds plan limit).`;
    warningNode.classList.remove('hidden');
  } else if (warningNode) {
    warningNode.classList.add('hidden');
  }
}

function showBatchLimitError(urls: string[], limit: number, isTeamPlan: boolean) {
  const uploadContainer = document.getElementById('batch-upload-container');
  const errorContainer = document.getElementById('batch-error-container');
  const errorMsg = document.getElementById('batch-error-message');
  const processAnywayBtn = document.getElementById('batch-process-anyway-btn') as HTMLButtonElement;
  const closeBtn = document.getElementById('batch-error-close-btn');

  if (!uploadContainer || !errorContainer || !errorMsg || !processAnywayBtn || !closeBtn) return;

  uploadContainer.style.display = 'none';
  errorContainer.classList.remove('hidden');

  if (isTeamPlan) {
    errorMsg.innerHTML = `There are more than 100 URLs in this CSV (${urls.length} found). To view all at once, you can contact us via <a href="mailto:support@signalize.org" style="color: var(--accent-color); text-decoration: underline;">support@signalize.org</a> for custom plans made only for you.`;
    processAnywayBtn.textContent = 'Analyze the first 100';
  } else {
    errorMsg.innerHTML = `There are more than 10 URLs in this CSV (${urls.length} found) or upload a new CSV with 10 rows. To view up to 100 analyses at once, <span style="font-weight: 600;">upgrade to Team</span>.`;
    processAnywayBtn.textContent = 'Analyze the first 10';
  }

  processAnywayBtn.onclick = () => {
    errorContainer.classList.add('hidden');
    lastBatchInputMode = 'csv';
    startBatchProcess(urls.slice(0, limit));
  };

  closeBtn.onclick = () => {
    errorContainer.classList.add('hidden');
    uploadContainer.style.display = 'flex';
  };
}

function updateProgress(current: number, total: number) {
  const countSpan = document.getElementById('batch-progress-count');
  const totalSpan = document.getElementById('batch-total-count');
  const bar = document.getElementById('batch-progress-bar');
  if (countSpan) countSpan.textContent = current.toString();
  if (totalSpan) totalSpan.textContent = total.toString();
  if (bar) bar.style.width = `${(current / total) * 100}%`;
}

function appendResultItem(url: string, statusText: string, isError: boolean) {
  const list = document.getElementById('batch-results-list');
  if (!list) return;
  const item = document.createElement('div');
  item.style.padding = '10px 12px';
  item.style.borderRadius = '6px';
  item.style.backgroundColor = 'var(--bg-tertiary)';
  item.style.border = '1px solid var(--border-color)';
  item.style.borderLeft = isError ? '3px solid #ef4444' : '3px solid #22c55e';
  item.style.fontSize = '12.5px';
  item.style.display = 'flex';
  item.style.alignItems = 'center';
  item.style.justifyContent = 'space-between';
  item.style.overflow = 'hidden';

  const urlEl = document.createElement('div');
  urlEl.textContent = url;
  urlEl.style.overflow = 'hidden';
  urlEl.style.textOverflow = 'ellipsis';
  urlEl.style.whiteSpace = 'nowrap';
  urlEl.style.color = 'var(--text-primary)';
  urlEl.title = url;

  const statusEl = document.createElement('div');
  statusEl.textContent = statusText;
  statusEl.style.color = isError ? '#ef4444' : 'var(--text-secondary)';
  statusEl.style.marginLeft = '12px';
  statusEl.style.flexShrink = '0';
  statusEl.style.fontSize = '12px';

  item.appendChild(urlEl);
  item.appendChild(statusEl);
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

async function startBatchProcess(urls: string[]) {
  const uploadContainer = document.getElementById('batch-upload-container');
  const progressContainer = document.getElementById('batch-progress-container');
  const resultsPhase = document.getElementById('batch-results-list');
  const cancelBtn = document.getElementById('batch-cancel-btn');

  if (uploadContainer) uploadContainer.style.display = 'none';
  if (progressContainer) progressContainer.classList.remove('hidden');
  if (resultsPhase) resultsPhase.innerHTML = '';
  if (cancelBtn) {
    cancelBtn.textContent = 'Cancel';
    cancelBtn.removeAttribute('disabled');
  }

  tempBatchResults = [];
  updateProgress(0, urls.length);

  for (let i = 0; i < urls.length; i++) {
    if (isBatchCancelled) {
      appendResultItem('Batch cancelled', 'Stopped', true);
      break;
    }

    const url = urls[i];
    try {
      const result = await processSingleUrl(url);
      tempBatchResults.push({
        url,
        domain: new URL(url).hostname,
        content: result.content,
        analysis: result.analysis,
        contentHash: result.contentHash,
        status: 'ready',
      });
      appendResultItem(url, 'Analyzed', false);
    } catch (err: any) {
      appendResultItem(url, err.message || 'Error', true);
    }
    updateProgress(i + 1, urls.length);
  }

  // Done analyzing, move to Review
  setTimeout(() => {
    if (progressContainer) progressContainer.classList.add('hidden');
    showBatchReviewScreen();
  }, 1000);
}

function mapBatchResultToExportItem(r: BatchResult) {
  return {
    title: r.content.title,
    domain: r.domain,
    url: r.url,
    description: r.content.metaDescription,
    sales_readiness_score: r.analysis.salesReadinessScore,
    what_they_do: r.analysis.whatTheyDo,
    target_customer: r.analysis.targetCustomer,
    value_proposition: r.analysis.valueProposition,
    best_sales_persona: r.analysis.bestSalesPersona?.persona,
    best_sales_persona_reason: r.analysis.bestSalesPersona?.reason,
    sales_angle: r.analysis.salesAngle,
    recommended_outreach_persona: r.analysis.recommendedOutreach?.persona,
    recommended_outreach_goal: r.analysis.recommendedOutreach?.goal,
    recommended_outreach_angle: r.analysis.recommendedOutreach?.angle,
    recommended_outreach_message: r.analysis.recommendedOutreach?.message,
  };
}

function getFilteredBatchResults() {
  if (!batchSearchQuery) return tempBatchResults;
  return tempBatchResults.filter(res => {
    return res.domain.toLowerCase().includes(batchSearchQuery) ||
      res.url.toLowerCase().includes(batchSearchQuery) ||
      (res.content.title && res.content.title.toLowerCase().includes(batchSearchQuery));
  });
}


async function showBatchReviewScreen() {
  const reviewContainer = document.getElementById('batch-review-container');
  const headerActions = document.getElementById('batch-header-actions');
  const reviewDoneBtn = document.getElementById('batch-review-done-btn');

  if (!reviewContainer) return;
  reviewContainer.classList.remove('hidden');
  if (headerActions) headerActions.classList.remove('hidden');
  if (reviewDoneBtn) {
    reviewDoneBtn.textContent = lastBatchInputMode === 'paste' ? 'Paste new URLs' : 'Upload new CSV';
  }

  const isTeamPlan = (state.currentPlan || '').toLowerCase() === 'team';
  const searchToggle = document.getElementById('batch-search-toggle');
  if (isTeamPlan && searchToggle) {
    searchToggle.classList.remove('hidden');
  } else if (searchToggle) {
    searchToggle.classList.add('hidden');
  }

  isBatchSelectionMode = false;
  batchCurrentPage = 1;
  batchSearchQuery = '';
  const searchInput = document.getElementById('batch-search-input') as HTMLInputElement | null;
  if (searchInput) searchInput.value = '';
  const searchBarContainer = document.getElementById('batch-search-bar-container');
  if (searchBarContainer) searchBarContainer.classList.add('hidden');

  await syncBatchSavedStatuses();

  renderBatchResultsPage();
}

async function syncBatchSavedStatuses() {
  if (tempBatchResults.length === 0) return;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    const uniqueDomains = Array.from(new Set(tempBatchResults.map((r) => r.domain)));
    if (uniqueDomains.length === 0) return;

    const { data, error } = await supabase
      .from('saved_analyses')
      .select('domain')
      .eq('user_id', user.id)
      .in('domain', uniqueDomains);

    if (error) throw error;

    const savedDomains = new Set((data || []).map((row: any) => row.domain));
    tempBatchResults.forEach((result) => {
      result.status = savedDomains.has(result.domain) ? 'saved' : 'ready';
    });
  } catch (err) {
    console.warn('Failed to sync saved batch statuses:', err);
  }
}

function renderBatchResultsPage() {
  const reviewList = document.getElementById('batch-review-list');
  const readyCount = document.getElementById('batch-ready-count');
  const paginationBar = document.getElementById('batch-pagination-bar');
  const pageNumbers = document.getElementById('batch-page-numbers');

  const multiSelectToggle = document.getElementById('batch-multi-select-toggle');
  const selectionBackBtn = document.getElementById('batch-selection-back-btn');
  const selectAllBtn = document.getElementById('batch-select-all-btn');
  const saveSelectedBtn = document.getElementById('batch-save-selected-btn');
  const searchToggle = document.getElementById('batch-search-toggle');
  const saveAllBtn = document.getElementById('batch-save-all-btn');
  const exportMenuToggle = document.getElementById('batch-export-menu-toggle');

  if (isBatchSelectionMode) {
    // In selection mode: show back, select all, save selected; hide export, save all, multi-select, search
    selectionBackBtn?.classList.remove('hidden');
    selectAllBtn?.classList.remove('hidden');
    saveSelectedBtn?.classList.remove('hidden');
    multiSelectToggle?.classList.add('hidden');
    exportMenuToggle?.classList.add('hidden');
    saveAllBtn?.classList.add('hidden');
    searchToggle?.classList.add('hidden');
  } else {
    // Normal mode: show multi-select, save all, export, possibly search; hide selection buttons
    selectionBackBtn?.classList.add('hidden');
    selectAllBtn?.classList.add('hidden');
    saveSelectedBtn?.classList.add('hidden');
    multiSelectToggle?.classList.remove('hidden');
    saveAllBtn?.classList.remove('hidden');
    exportMenuToggle?.classList.remove('hidden');

    const isTeamPlan = (state.currentPlan || '').toLowerCase() === 'team';
    const hasEnoughResults = tempBatchResults.length > 10;
    if (isTeamPlan && hasEnoughResults && searchToggle) {
      searchToggle.classList.remove('hidden');
    } else if (searchToggle) {
      searchToggle.classList.add('hidden');
    }

    const allSaved = tempBatchResults.length > 0 && tempBatchResults.every(r => r.status === 'saved');
    if (allSaved) {
      if (saveAllBtn) {
        saveAllBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2-2z"></path></svg>`;
        saveAllBtn.style.color = 'var(--text-primary)';
        saveAllBtn.title = 'Unsave all results';
      }
      multiSelectToggle?.classList.add('hidden');
    } else {
      if (saveAllBtn) {
        saveAllBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2-2z"></path></svg>`;
        saveAllBtn.style.color = '';
        saveAllBtn.title = 'Save all results';
      }
    }
  }

  if (!reviewList) return;
  reviewList.innerHTML = '';

  const readyItems = tempBatchResults.filter(r => r.status === 'ready').length;
  if (readyCount) readyCount.textContent = readyItems.toString();

  const filtered = getFilteredBatchResults();
  const totalFiltered = filtered.length;
  const totalPages = Math.ceil(totalFiltered / BATCH_PAGE_SIZE);

  if (totalFiltered > 10) {
    if (paginationBar) paginationBar.classList.remove('hidden');
    if (pageNumbers) {
      pageNumbers.textContent = `Page ${batchCurrentPage} of ${totalPages || 1}`;
    }
    const pagePrev = document.getElementById('batch-page-prev') as HTMLButtonElement | null;
    const pageNext = document.getElementById('batch-page-next') as HTMLButtonElement | null;
    if (pagePrev) pagePrev.disabled = batchCurrentPage === 1;
    if (pageNext) pageNext.disabled = batchCurrentPage === totalPages || totalPages === 0;
  } else {
    if (paginationBar) paginationBar.classList.add('hidden');
  }

  const startIdx = (batchCurrentPage - 1) * BATCH_PAGE_SIZE;
  const pageResults = filtered.slice(startIdx, startIdx + BATCH_PAGE_SIZE);

  pageResults.forEach((res) => {
    // Find absolute index of res in tempBatchResults
    const index = tempBatchResults.indexOf(res);

    const wrapper = document.createElement('div');
    wrapper.className = 'saved-item';
    wrapper.style.margin = '0 0 10px 0';

    const headerRow = document.createElement('div');
    headerRow.className = 'saved-item-header';

    const info = document.createElement('div');
    info.className = 'header-info';
    info.style.flex = '1';
    info.style.overflow = 'hidden';

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'header-actions';

    // Conditionally Add Checkbox for this row
    if (isBatchSelectionMode) {
      actionsContainer.style.display = 'none'; // hide save/copy actions
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'batch-item-checkbox';
      checkbox.dataset.index = index.toString();
      checkbox.style.margin = '0 12px 0 0';
      checkbox.style.width = '16px';
      checkbox.style.height = '16px';
      checkbox.style.accentColor = 'var(--text-primary)';
      checkbox.style.cursor = 'pointer';
      if (res.status === 'saved') checkbox.disabled = true;

      // Stop header click from expanding if we click checkbox
      checkbox.addEventListener('click', (e) => e.stopPropagation());
      info.style.display = 'flex';
      info.style.alignItems = 'center';
      info.appendChild(checkbox);
    } else {
      actionsContainer.style.display = 'flex';
    }

    const titleWrap = document.createElement('div');
    titleWrap.style.overflow = 'hidden';
    const title = document.createElement('strong');
    title.textContent = res.content.title || res.domain;
    title.style.whiteSpace = 'nowrap';
    title.style.overflow = 'hidden';
    title.style.textOverflow = 'ellipsis';
    title.style.display = 'block';

    const url = document.createElement('div');
    url.textContent = res.url;
    url.style.fontSize = '12px';
    url.style.opacity = '0.7';
    url.style.whiteSpace = 'nowrap';
    url.style.overflow = 'hidden';
    url.style.textOverflow = 'ellipsis';

    titleWrap.appendChild(title);
    titleWrap.appendChild(url);
    info.appendChild(titleWrap);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn copy-saved-btn';
    copyBtn.title = 'Copy analysis';
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" class="copy-icon">
        <rect x="9" y="9" width="13" height="13" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;

    copyBtn.onclick = async (e) => {
      e.stopPropagation();
      const { buildSavedCopyText, copyAnalysisText } = await import('../clipboard.js');
      const { loadSettings } = await import('../settings.js');
      const settings = await loadSettings();
      const formatLabel = settings.copyFormat === 'short' ? 'short' : 'full';
      const itemToCopy = mapBatchResultToExportItem(res);
      const text = await buildSavedCopyText(itemToCopy as any);
      copyAnalysisText(text, copyBtn, formatLabel);
    };

    const saveBtn = document.createElement('button');
    saveBtn.className = 'copy-btn copy-saved-btn'; // use same padding/hover base
    saveBtn.title = 'Save';

    const updateSaveIcon = () => {
      if (res.status === 'saved') {
        saveBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2-2z"></path></svg>`;
        saveBtn.style.color = 'var(--text-primary)';
      } else {
        saveBtn.innerHTML = `
           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
             <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
           </svg>
         `;
      }
    };
    updateSaveIcon();

    saveBtn.onclick = (e) => {
      e.stopPropagation();
      saveSingleResult(index, saveBtn);
    };

    actionsContainer.appendChild(copyBtn);
    actionsContainer.appendChild(saveBtn);

    headerRow.appendChild(info);
    headerRow.appendChild(actionsContainer);

    const body = document.createElement('div');
    body.className = 'saved-item-body hidden';
    body.style.paddingTop = '16px';

    headerRow.addEventListener('click', (e) => {
      if (isBatchSelectionMode) {
        // In selection mode, toggle the checkbox instead of expanding
        const checkbox = info.querySelector('.batch-item-checkbox') as HTMLInputElement;
        if (checkbox && !checkbox.disabled) {
          checkbox.checked = !checkbox.checked;
        }
      } else {
        // Normal mode: expand/collapse the details
        body.classList.toggle('hidden');
      }
    });

    body.innerHTML = `
      <p><strong>Sales readiness:</strong> ${res.analysis.salesReadinessScore ?? '—'}</p>
      <p><strong>What they do:</strong> ${res.analysis.whatTheyDo || '—'}</p>
      <p><strong>Target customer:</strong> ${res.analysis.targetCustomer || '—'}</p>
      <p><strong>Value proposition:</strong> ${res.analysis.valueProposition || '—'}</p>
      <p>
        <strong>Best sales persona:</strong> ${res.analysis.bestSalesPersona?.persona || '—'}
        ${res.analysis.bestSalesPersona?.reason
        ? `<br />
        <span style="opacity:0.7; font-size:13px">
          (${res.analysis.bestSalesPersona.reason})
        </span>`
        : ''
      }
      </p>
      <p><strong>Sales angle:</strong> ${res.analysis.salesAngle || '—'}</p>

      <hr style="margin:10px 0; opacity:0.25" />

      <p><strong>Recommended outreach</strong></p>

      <p>
        <strong>Who:</strong>
        ${res.analysis.recommendedOutreach?.persona || '—'}
      </p>

      <p>
        <strong>Goal:</strong>
        ${res.analysis.recommendedOutreach?.goal || '—'}
      </p>

      <p>
        <strong>Angle:</strong>
        ${res.analysis.recommendedOutreach?.angle || '—'}
      </p>

      <p>
        <strong>Message:</strong><br />
        <span style="white-space: pre-wrap;">${(res.analysis.recommendedOutreach?.message || '—').trim()}</span>
      </p>

      <hr style="margin:8px 0; opacity:0.3" />

      <p style="opacity:0.85">
        <strong>Company overview:</strong>
        ${res.content.metaDescription || '—'}
      </p>
    `;

    wrapper.appendChild(headerRow);
    wrapper.appendChild(body);
    reviewList.appendChild(wrapper);
  });
}

async function saveSingleResult(index: number, btn: HTMLButtonElement) {
  const res = tempBatchResults[index];

  const originalHtml = btn.innerHTML;
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
  btn.disabled = true;

  try {
    let actionLabel = '';
    if (res.status === 'saved') {
      // Unsave the item
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) throw new Error('Not logged in');

      const { error } = await supabase.from('saved_analyses').delete().eq('user_id', user.id).eq('domain', res.domain);
      if (error) throw error;

      res.status = 'ready';
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2-2z"></path></svg>`;
      btn.style.color = '';
      actionLabel = 'Unsaved';
    } else {
      // Save the item
      await performSave(res);
      res.status = 'saved';
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2-2z"></path></svg>`;
      btn.style.color = 'var(--text-primary)';
      actionLabel = 'Saved';
    }

    btn.disabled = false;
    showActionTooltip(btn, actionLabel);
    await refreshQuotaBannerNow();
    setTimeout(() => {
      renderBatchResultsPage(); // update ready count/state after inline feedback is visible
    }, 250);
  } catch (err: any) {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    showToast(err.message || 'Failed to save');
  }
}

async function saveSpecificBatchSelection(indicesToSave: number[], triggeredBtn: HTMLButtonElement) {
  const originalHtml = triggeredBtn.innerHTML;
  triggeredBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
  triggeredBtn.disabled = true;

  let savedCount = 0;
  for (const index of indicesToSave) {
    const res = tempBatchResults[index];
    if (res.status === 'saved') continue;
    try {
      await performSave(res);
      res.status = 'saved';
      savedCount++;
      if (savedCount % 2 === 0) {
        renderBatchResultsPage();
      }
    } catch (err) {
      console.error('Batch save error:', err);
    }
  }

  await refreshQuotaBannerNow();

  renderBatchResultsPage();

  triggeredBtn.disabled = false;
  triggeredBtn.innerHTML = originalHtml;

  const { showToast } = await import('../toast.js');
  showToast(`Successfully saved ${savedCount} analyses.`);
}

async function saveAllBatchSelection() {
  if (tempBatchResults.length === 0) return;

  const saveAllBtn = document.getElementById('batch-save-all-btn') as HTMLButtonElement | null;
  if (saveAllBtn) {
    saveAllBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`;
    saveAllBtn.style.color = '';
    saveAllBtn.disabled = true;
  }

  const allSaved = tempBatchResults.every(r => r.status === 'saved');
  const { showToast } = await import('../toast.js');
  let actionLabel = '';

  try {
    if (allSaved) {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) throw new Error('Not logged in');

      const domains = tempBatchResults.map(r => r.domain);
      const { error } = await supabase.from('saved_analyses').delete().eq('user_id', user.id).in('domain', domains);
      if (error) throw error;

      tempBatchResults.forEach(r => r.status = 'ready');
      actionLabel = 'Unsaved all';
    } else {
      const indicesToSave = tempBatchResults
        .map((_, i) => i)
        .filter((i) => tempBatchResults[i].status === 'ready');

      let savedCount = 0;
      for (const i of indicesToSave) {
        try {
          await performSave(tempBatchResults[i]);
          tempBatchResults[i].status = 'saved';
          savedCount++;
          if (savedCount % 2 === 0) renderBatchResultsPage();
        } catch (e) { }
      }

      if (savedCount > 0) {
        actionLabel = 'Saved all';
      } else {
        showToast('No new analyses available to save.');
      }
    }

    await refreshQuotaBannerNow();
  } catch (err: any) {
    console.error('Batch action error:', err);
    showToast(err.message || 'Action failed.');
  }

  if (saveAllBtn) {
    saveAllBtn.disabled = false;
  }

  renderBatchResultsPage();

  if (saveAllBtn && actionLabel) {
    showActionTooltip(saveAllBtn, actionLabel);
  }
}

async function performSave(res: BatchResult) {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) throw new Error('Not logged in');

  const insertData = {
    user_id: user.id,
    domain: res.domain,
    url: res.url,
    title: cleanTitle(res.content.title),
    description: res.content.metaDescription,
    content_hash: res.contentHash,
    last_analyzed_at: new Date().toISOString(),
    what_they_do: res.analysis.whatTheyDo,
    target_customer: res.analysis.targetCustomer,
    value_proposition: res.analysis.valueProposition,
    sales_angle: res.analysis.salesAngle,
    sales_readiness_score: res.analysis.salesReadinessScore,
    best_sales_persona: res.analysis.bestSalesPersona?.persona,
    best_sales_persona_reason: res.analysis.bestSalesPersona?.reason,
    recommended_outreach_persona: res.analysis.recommendedOutreach?.persona,
    recommended_outreach_goal: res.analysis.recommendedOutreach?.goal,
    recommended_outreach_angle: res.analysis.recommendedOutreach?.angle,
    recommended_outreach_message: res.analysis.recommendedOutreach?.message,
  };

  const { error } = await supabase.from('saved_analyses').insert(insertData);
  if (error) {
    if (error.code === '23505') throw new Error('Already saved');
    throw new Error('Save failed');
  }
}

async function refreshQuotaBannerNow() {
  try {
    await loadQuotaFromAPI(true);
  } catch {
    renderQuotaBanner();
  }
}

function cleanTitle(title: string): string {
  if (!title) return '';
  const match = title.match(/^(.+?)(?:\s*[-|:]\s*|\s*[–—]\s*)(.+)$/);
  return match && match[1].length > 3 ? match[1].trim() : title.trim();
}

async function processSingleUrl(url: string) {
  await loadQuotaFromAPI();
  if (state.currentPlan === 'free' && state.remainingToday !== null && state.remainingToday <= 0) {
    throw new Error('Daily limit reached');
  }

  const response = await fetchAndExtractContent(url);
  if (!response?.ok || !response.content) {
    throw new Error(response?.error || response?.reason || 'Extraction failed');
  }

  const result = await analyzeWebsiteContent(response.content, false, false);
  if (result.blocked) throw new Error('Quota reached');
  if (!result.analysis) throw new Error('AI analysis failed');

  return {
    content: response.content,
    analysis: result.analysis,
    contentHash: await hashContent(response.content),
  };
}
