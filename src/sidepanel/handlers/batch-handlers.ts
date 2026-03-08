import { state } from '../state.js';
import { showToast } from '../toast.js';
import {
  mapBatchResultToExportItem,
  parseUrlsFromCsv,
  parseUrlsFromText,
} from './batch/helpers.js';
import { batchState } from './batch/state.js';
import { createBatchRenderFlow } from './batch/render-flow.js';
import { createBatchSaveFlow } from './batch/save-flow.js';
import { startBatchProcess as startBatchProcessFlow } from './batch/process-flow.js';
import { BATCH_PAGE_SIZE } from './batch/constants.js';

let saveFlow: ReturnType<typeof createBatchSaveFlow> | null = null;
const renderFlow = createBatchRenderFlow({
  saveSingleResult: (index, btn) => saveFlow?.saveSingleResult(index, btn),
});
saveFlow = createBatchSaveFlow({
  renderBatchResultsPage: () => renderFlow.renderBatchResultsPage(),
});

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
    if (batchState.pendingCsvUrls.length === 0) return;

    const isTeamPlan = (state.currentPlan || '').toLowerCase() === 'team';
    const limit = isTeamPlan ? 100 : 10;

    const urlsToProcess = batchState.pendingCsvUrls.length > limit ? batchState.pendingCsvUrls.slice(0, limit) : batchState.pendingCsvUrls;
    batchState.lastBatchInputMode = 'csv';
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
    batchState.lastBatchInputMode = 'paste';
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
    batchState.isBatchCancelled = true;
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
    batchState.isBatchSelectionMode = true;
    renderBatchResultsPage();
  });

  selectionBackBtn?.addEventListener('click', () => {
    batchState.isBatchSelectionMode = false;
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
    batchState.isBatchSelectionMode = false;
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
    batchState.batchSearchQuery = '';
    batchState.batchCurrentPage = 1;
    renderBatchResultsPage();
  });

  searchInput?.addEventListener('input', (e) => {
    batchState.batchSearchQuery = (e.target as HTMLInputElement).value.toLowerCase().trim();
    batchState.batchCurrentPage = 1;
    renderBatchResultsPage();
  });

  const pagePrev = document.getElementById('batch-page-prev');
  const pageNext = document.getElementById('batch-page-next');

  pagePrev?.addEventListener('click', () => {
    if (batchState.batchCurrentPage > 1) {
      batchState.batchCurrentPage--;
      renderBatchResultsPage();
    }
  });

  pageNext?.addEventListener('click', () => {
    const isTeamPlan = (state.currentPlan || '').toLowerCase() === 'team';
    const totalFiltered = getFilteredBatchResults().length;
    const totalPages = Math.ceil(totalFiltered / BATCH_PAGE_SIZE);
    if (batchState.batchCurrentPage < totalPages) {
      batchState.batchCurrentPage++;
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
    batchState.tempBatchResults = [];
    if (pasteInput) pasteInput.value = '';
    if (pasteSubmit) pasteSubmit.classList.remove('has-content');

    const pasteWarning = document.getElementById('batch-paste-limit-warning');
    if (pasteWarning) pasteWarning.classList.add('hidden');

    batchState.pendingCsvUrls = [];
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

async function handleFileUpload(file: File) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    const { showErrorToast } = await import('../toast.js');
    showErrorToast('Please upload a CSV file');
    return;
  }
  batchState.isBatchCancelled = false;
  const text = await file.text();
  const urls = parseUrlsFromCsv(text);

  if (urls.length === 0) {
    const { showErrorToast } = await import('../toast.js');
    showErrorToast('Upload a CSV with URL(s)');
    return;
  }

  batchState.pendingCsvUrls = urls;

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
    batchState.lastBatchInputMode = 'csv';
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
  if (uploadContainer) uploadContainer.style.display = 'none';

  await startBatchProcessFlow(urls, {
    updateProgress,
    appendResultItem,
    onDone: () => showBatchReviewScreen(),
  });
}

function getFilteredBatchResults() {
  return renderFlow.getFilteredBatchResults();
}

async function showBatchReviewScreen() {
  await renderFlow.showBatchReviewScreen();
}

async function syncBatchSavedStatuses() {
  await renderFlow.syncBatchSavedStatuses();
}

function renderBatchResultsPage() {
  renderFlow.renderBatchResultsPage();
}

async function saveSingleResult(index: number, btn: HTMLButtonElement) {
  await saveFlow?.saveSingleResult(index, btn);
}

async function saveSpecificBatchSelection(indicesToSave: number[], triggeredBtn: HTMLButtonElement) {
  await saveFlow?.saveSpecificBatchSelection(indicesToSave, triggeredBtn);
}

async function saveAllBatchSelection() {
  await saveFlow?.saveAllBatchSelection();
}
