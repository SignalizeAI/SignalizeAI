import { state } from '../../state.js';
import { supabase } from '../../supabase.js';
import { mapBatchResultToExportItem } from './helpers.js';
import { batchState } from './state.js';

interface RenderFlowDeps {
  saveSingleResult: (index: number, btn: HTMLButtonElement) => void;
}

export function createBatchRenderFlow(deps: RenderFlowDeps) {
  const { saveSingleResult } = deps;

  function getFilteredBatchResults() {
    if (!batchState.batchSearchQuery) return batchState.tempBatchResults;
    return batchState.tempBatchResults.filter((res) => {
      return (
        res.domain.toLowerCase().includes(batchState.batchSearchQuery) ||
        res.url.toLowerCase().includes(batchState.batchSearchQuery) ||
        (res.content.title && res.content.title.toLowerCase().includes(batchState.batchSearchQuery))
      );
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
      reviewDoneBtn.textContent =
        batchState.lastBatchInputMode === 'paste' ? 'Paste new URLs' : 'Upload new CSV';
    }

    const isTeamPlan = (state.currentPlan || '').toLowerCase() === 'team';
    const searchToggle = document.getElementById('batch-search-toggle');
    if (isTeamPlan && searchToggle) {
      searchToggle.classList.remove('hidden');
    } else if (searchToggle) {
      searchToggle.classList.add('hidden');
    }

    batchState.isBatchSelectionMode = false;
    batchState.batchCurrentPage = 1;
    batchState.batchSearchQuery = '';
    const searchInput = document.getElementById('batch-search-input') as HTMLInputElement | null;
    if (searchInput) searchInput.value = '';
    const searchBarContainer = document.getElementById('batch-search-bar-container');
    if (searchBarContainer) searchBarContainer.classList.add('hidden');

    await syncBatchSavedStatuses();

    renderBatchResultsPage();
  }

  async function syncBatchSavedStatuses() {
    if (batchState.tempBatchResults.length === 0) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData?.session?.user;
      if (!user) return;

      const uniqueDomains = Array.from(new Set(batchState.tempBatchResults.map((r) => r.domain)));
      if (uniqueDomains.length === 0) return;

      const { data, error } = await supabase
        .from('saved_analyses')
        .select('domain')
        .eq('user_id', user.id)
        .in('domain', uniqueDomains);

      if (error) throw error;

      const savedDomains = new Set((data || []).map((row: any) => row.domain));
      batchState.tempBatchResults.forEach((result) => {
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

    if (batchState.isBatchSelectionMode) {
      selectionBackBtn?.classList.remove('hidden');
      selectAllBtn?.classList.remove('hidden');
      saveSelectedBtn?.classList.remove('hidden');
      multiSelectToggle?.classList.add('hidden');
      exportMenuToggle?.classList.add('hidden');
      saveAllBtn?.classList.add('hidden');
      searchToggle?.classList.add('hidden');
    } else {
      selectionBackBtn?.classList.add('hidden');
      selectAllBtn?.classList.add('hidden');
      saveSelectedBtn?.classList.add('hidden');
      multiSelectToggle?.classList.remove('hidden');
      saveAllBtn?.classList.remove('hidden');
      exportMenuToggle?.classList.remove('hidden');

      const isTeamPlan = (state.currentPlan || '').toLowerCase() === 'team';
      const hasEnoughResults = batchState.tempBatchResults.length > 10;
      if (isTeamPlan && hasEnoughResults && searchToggle) {
        searchToggle.classList.remove('hidden');
      } else if (searchToggle) {
        searchToggle.classList.add('hidden');
      }

      const allSaved =
        batchState.tempBatchResults.length > 0 &&
        batchState.tempBatchResults.every((r) => r.status === 'saved');
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

    const readyItems = batchState.tempBatchResults.filter((r) => r.status === 'ready').length;
    if (readyCount) readyCount.textContent = readyItems.toString();

    const filtered = getFilteredBatchResults();
    const totalFiltered = filtered.length;
    const totalPages = Math.ceil(totalFiltered / 10);

    if (totalFiltered > 10) {
      if (paginationBar) paginationBar.classList.remove('hidden');
      if (pageNumbers) {
        pageNumbers.textContent = `Page ${batchState.batchCurrentPage} of ${totalPages || 1}`;
      }
      const pagePrev = document.getElementById('batch-page-prev') as HTMLButtonElement | null;
      const pageNext = document.getElementById('batch-page-next') as HTMLButtonElement | null;
      if (pagePrev) pagePrev.disabled = batchState.batchCurrentPage === 1;
      if (pageNext)
        pageNext.disabled = batchState.batchCurrentPage === totalPages || totalPages === 0;
    } else {
      if (paginationBar) paginationBar.classList.add('hidden');
    }

    const startIdx = (batchState.batchCurrentPage - 1) * 10;
    const pageResults = filtered.slice(startIdx, startIdx + 10);

    pageResults.forEach((res) => {
      const index = batchState.tempBatchResults.indexOf(res);

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

      if (batchState.isBatchSelectionMode) {
        actionsContainer.style.display = 'none';
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
        const { buildSavedCopyText, copyAnalysisText } = await import('../../clipboard.js');
        const { loadSettings } = await import('../../settings.js');
        const settings = await loadSettings();
        const formatLabel = settings.copyFormat === 'short' ? 'short' : 'full';
        const itemToCopy = mapBatchResultToExportItem(res);
        const text = await buildSavedCopyText(itemToCopy as any);
        copyAnalysisText(text, copyBtn, formatLabel);
      };

      const saveBtn = document.createElement('button');
      saveBtn.className = 'copy-btn copy-saved-btn';
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

      headerRow.addEventListener('click', () => {
        if (batchState.isBatchSelectionMode) {
          const checkbox = info.querySelector('.batch-item-checkbox') as HTMLInputElement;
          if (checkbox && !checkbox.disabled) {
            checkbox.checked = !checkbox.checked;
          }
        } else {
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
        ${
          res.analysis.bestSalesPersona?.reason
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

  return {
    getFilteredBatchResults,
    showBatchReviewScreen,
    syncBatchSavedStatuses,
    renderBatchResultsPage,
  };
}
