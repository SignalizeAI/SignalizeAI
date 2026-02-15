import { state } from '../state.js';

export function updateSavedActionsVisibility(count) {
  const hasItems = count > 0;
  const actionIds = ['search-toggle', 'filter-toggle', 'export-menu-toggle', 'multi-select-toggle'];

  actionIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden', !hasItems);
  });

  if (!hasItems) {
    state.selectionMode = false;
    state.selectedSavedIds.clear();
  }

  updateSelectionUI();
}

export function updateSelectionUI() {
  const selectionMode = state.selectionMode;
  const selectionBackBtn = document.getElementById('selection-back-btn');
  const selectAllBtn = document.getElementById('select-all-btn');
  const selectionCount = document.getElementById('selection-count-indicator');

  document.querySelectorAll('.saved-item').forEach((item) => {
    const header = item.querySelector('.saved-item-header');
    const checkbox = item.querySelector('.saved-select-checkbox');

    if (header) header.classList.toggle('selection-mode', selectionMode);

    if (checkbox) {
      checkbox.classList.toggle('hidden', !selectionMode);
      checkbox.checked = selectionMode && state.selectedSavedIds.has(checkbox.dataset.id);
    }
  });

  selectionBackBtn?.classList.toggle('hidden', !selectionMode);
  selectAllBtn?.classList.toggle('hidden', !selectionMode);

  if (selectionCount) {
    selectionCount.textContent = String(state.selectedSavedIds.size);
    selectionCount.classList.toggle('hidden', !selectionMode);
  }

  if (!selectionMode) {
    state.selectedSavedIds.clear();
  }

  updateDeleteState();
}

export function updateDeleteState() {
  const multiSelectToggle = document.getElementById('multi-select-toggle');
  const hasItems = document.querySelectorAll('.saved-item').length > 0;
  const hasSelection = state.selectedSavedIds.size > 0;

  if (!multiSelectToggle) return;

  if (!hasItems) {
    multiSelectToggle.classList.add('disabled');
    return;
  }

  if (state.selectionMode) {
    multiSelectToggle.classList.toggle('disabled', !hasSelection);
  } else {
    multiSelectToggle.classList.remove('disabled');
  }
}

export function toggleSelectAllVisible() {
  if (!state.selectionMode) return;

  const checkboxes = Array.from(document.querySelectorAll('.saved-select-checkbox'));
  const ids = checkboxes.map((cb) => cb.dataset.id).filter(Boolean);
  const allSelected = ids.length > 0 && ids.every((id) => state.selectedSavedIds.has(id));

  if (allSelected) {
    state.selectedSavedIds.clear();
  } else {
    ids.forEach((id) => state.selectedSavedIds.add(id));
  }

  updateSelectionUI();
}

export function exitSelectionMode() {
  if (!state.selectionMode) return;

  state.selectionMode = false;
  state.selectedSavedIds.clear();
  updateSelectionUI();
}
