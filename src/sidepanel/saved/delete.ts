import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { showToast } from '../toast.js';
import { loadQuotaFromAPI, renderQuotaBanner } from '../quota.js';
import { broadcastToWebsiteTabs } from '../website-sync.js';

export function showUndoToast(): void {
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

  const messageEl = document.getElementById('toast-message');
  if (messageEl) {
    messageEl.textContent = `${state.pendingDeleteMap.size} item(s) deleted`;
  }

  toast.classList.add('show');

  const undoBtn = document.getElementById('undo-button');
  const closeBtn = document.getElementById('close-toast-btn');

  if (undoBtn) {
    undoBtn.onclick = async () => {
      const { updateSavedEmptyState } = await import('./rendering.js');
      const { refreshSaveButtonState } = await import('../analysis/extraction.js');
      state.isUndoToastActive = false;
      document.body.classList.remove('undo-active');
      clearTimeout(state.undoTimer!);
      toast!.classList.remove('show');

      state.pendingDeleteMap.forEach(({ element }) => {
        delete element.dataset.isPendingDelete;
        element.classList.remove('pending-delete');
      });

      state.pendingDeleteMap.clear();
      updateSavedEmptyState();
      await loadQuotaFromAPI(true);
      await refreshSaveButtonState();
    };
  }

  if (closeBtn) {
    closeBtn.onclick = finalizePendingDeletes;
  }

  clearTimeout(state.undoTimer!);
  state.undoTimer = setTimeout(finalizePendingDeletes, 5000);
}

export async function finalizePendingDeletes(): Promise<void> {
  if (state.isFinalizingDeletes) return;
  state.isFinalizingDeletes = true;

  clearTimeout(state.undoTimer!);
  const toast = document.getElementById('undo-toast');
  toast?.classList.remove('show');

  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) {
    state.isFinalizingDeletes = false;
    return;
  }

  const deletedCount = state.pendingDeleteMap.size;
  const deletedIds: string[] = [];

  while (state.pendingDeleteMap.size > 0) {
    const batch = Array.from(state.pendingDeleteMap.entries());
    state.pendingDeleteMap.clear();

    for (const [savedId, item] of batch) {
      try {
        await item.finalize();
        deletedIds.push(savedId);
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

  const { fetchAndRenderPage } = await import('./data.js');
  const { updateFilterBanner } = await import('./filtering.js');

  if (Number.isFinite(state.totalSavedCount) && state.totalSavedCount > 0) {
    state.totalSavedCount = Math.max(0, state.totalSavedCount - deletedCount);
  }

  state.isFinalizingDeletes = false;
  state.isUndoToastActive = false;
  document.body.classList.remove('undo-active');

  if (deletedIds.length > 0) {
    await broadcastToWebsiteTabs({
      type: 'SYNC_PROSPECT_CONTENT_TO_PAGE',
      savedIds: deletedIds,
    });
  }

  await fetchAndRenderPage();
  updateFilterBanner();
  renderQuotaBanner();
  await loadQuotaFromAPI(true);
}
