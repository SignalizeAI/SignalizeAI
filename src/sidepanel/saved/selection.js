import { DESELECT_ALL_ICON, INDETERMINATE_ICON, SELECT_ALL_ICON } from '../constants.js';
import { state } from '../state.js';
import { updateSavedActionsVisibility } from './rendering.js';

const multiSelectToggle = document.getElementById('multi-select-toggle');
const selectionBackBtn = document.getElementById('selection-back-btn');
const selectAllBtn = document.getElementById('select-all-btn');
const exportToggle = document.getElementById('export-menu-toggle');
const filterToggle = document.getElementById('filter-toggle');

export function updateDeleteState() {
  if (!multiSelectToggle) return;

  const countIndicator = document.getElementById('selection-count-indicator');
  const count = state.selectedSavedIds.size;

  const totalVisible = Array.from(document.querySelectorAll('#saved-list .saved-item')).filter(
    (item) => !item.classList.contains('pending-delete')
  ).length;

  if (countIndicator) {
    if (state.selectionMode && count > 0) {
      countIndicator.textContent = count === totalVisible ? `All (${count})` : `(${count})`;
      countIndicator.classList.remove('hidden');
    } else {
      countIndicator.classList.add('hidden');
    }
  }

  const shouldDisable = state.selectionMode && count === 0;
  multiSelectToggle.classList.toggle('disabled', shouldDisable);
  multiSelectToggle.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
}

export function updateSelectionUI() {
  const toggleItemSelectionUI = (itemEl, enable) => {
    const checkbox = itemEl.querySelector('.saved-select-checkbox');
    const copyBtn = itemEl.querySelector('.copy-saved-btn');
    const deleteBtn = itemEl.querySelector('.delete-saved-btn');

    if (enable) {
      checkbox?.classList.remove('hidden');
      copyBtn?.classList.add('hidden');
      deleteBtn?.classList.add('hidden');
    } else {
      if (checkbox) checkbox.checked = false;
      checkbox?.classList.add('hidden');
      copyBtn?.classList.remove('hidden');
      deleteBtn?.classList.remove('hidden');
    }
  };

  document
    .querySelectorAll('.saved-item')
    .forEach((item) => toggleItemSelectionUI(item, state.selectionMode));

  if (exportToggle) {
    exportToggle.classList.toggle('hidden', state.selectionMode);
  }

  if (filterToggle) {
    filterToggle.classList.toggle('hidden', state.selectionMode);
  }

  if (selectionBackBtn) {
    selectionBackBtn.classList.toggle('hidden', !state.selectionMode);
  }

  if (selectAllBtn) {
    selectAllBtn.classList.toggle('hidden', !state.selectionMode);

    if (state.selectionMode) {
      updateSelectAllIcon();
    }
  }

  const countIndicator = document.getElementById('selection-count-indicator');

  if (countIndicator) {
    if (!state.selectionMode) {
      countIndicator.classList.add('hidden');
    } else {
      updateDeleteState();
    }
  }

  if (!multiSelectToggle) return;

  if (state.selectionMode) {
    multiSelectToggle.title = 'Delete selected';
    multiSelectToggle.setAttribute('aria-label', 'Delete selected analyses');
    multiSelectToggle.innerHTML = `
      <svg
        class="multi-select-icon danger"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
      </svg>
    `;
  } else {
    multiSelectToggle.title = 'Select multiple';
    multiSelectToggle.setAttribute('aria-label', 'Select multiple analyses');
    multiSelectToggle.innerHTML = `
      <svg
        class="multi-select-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="3"></rect>
        <path d="M9 12l2 2 4-4"></path>
      </svg>
    `;
  }
}

export function exitSelectionMode() {
  state.selectionMode = false;
  state.selectedSavedIds.clear();
  state.lastSelectedIndex = null;
  if (selectAllBtn) {
    selectAllBtn.innerHTML = SELECT_ALL_ICON;
    selectAllBtn.title = 'Select all';
  }

  document
    .querySelectorAll('.saved-item.selected')
    .forEach((el) => el.classList.remove('selected'));

  const visibleCount = Array.from(document.querySelectorAll('#saved-list .saved-item')).filter(
    (item) => !item.classList.contains('pending-delete')
  ).length;
  updateSelectionUI();
  updateDeleteState();
  updateSavedActionsVisibility(visibleCount);
}

export function toggleSelectAllVisible() {
  const items = Array.from(document.querySelectorAll('#saved-list .saved-item')).filter(
    (item) => !item.classList.contains('pending-delete')
  );

  if (!items.length) return;

  const selectedCount = items.filter(
    (item) => item.querySelector('.saved-select-checkbox')?.checked
  ).length;

  const shouldSelectAll = selectedCount < items.length;

  items.forEach((item) => {
    const cb = item.querySelector('.saved-select-checkbox');
    if (!cb) return;

    if (cb.checked !== shouldSelectAll) {
      cb.checked = shouldSelectAll;
      const wrapper = item.closest('.saved-item');
      wrapper.classList.toggle('selected', shouldSelectAll);
      if (shouldSelectAll) state.selectedSavedIds.add(cb.dataset.id);
      else state.selectedSavedIds.delete(cb.dataset.id);
    }
  });

  updateDeleteState();
  updateSelectAllIcon();
}

export function updateSelectAllIcon() {
  if (!selectAllBtn || !state.selectionMode) return;

  const items = Array.from(document.querySelectorAll('#saved-list .saved-item')).filter(
    (item) => !item.classList.contains('pending-delete')
  );

  if (!items.length) {
    selectAllBtn.innerHTML = SELECT_ALL_ICON;
    return;
  }

  const selectedCount = items.filter((item) => {
    const cb = item.querySelector('.saved-select-checkbox');
    return cb?.checked;
  }).length;

  const allSelected = selectedCount === items.length;
  const isIndeterminate = selectedCount > 0 && selectedCount < items.length;

  if (allSelected) {
    selectAllBtn.innerHTML = DESELECT_ALL_ICON;
    selectAllBtn.title = 'Deselect all';
  } else if (isIndeterminate) {
    selectAllBtn.innerHTML = INDETERMINATE_ICON;
    selectAllBtn.title = 'Select all';
  } else {
    selectAllBtn.innerHTML = SELECT_ALL_ICON;
    selectAllBtn.title = 'Select all';
  }
}
