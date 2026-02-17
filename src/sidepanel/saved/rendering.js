import { buildSavedCopyText, copyAnalysisText } from '../clipboard.js';
import { loadSettings } from '../settings.js';
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { areFiltersActive } from './filtering.js';
import { updateDeleteState, updateSelectAllIcon } from './selection.js';
import { showUndoToast } from './delete.js';

const exportToggle = document.getElementById('export-menu-toggle');
const filterToggle = document.getElementById('filter-toggle');

export function updateSavedActionsVisibility(count) {
  const searchToggleBtn = document.getElementById('search-toggle');
  const multiSelectToggle = document.getElementById('multi-select-toggle');

  const showBasicActions = count > 0 ? '' : 'none';
  if (filterToggle) filterToggle.style.display = showBasicActions;
  if (exportToggle) exportToggle.style.display = showBasicActions;

  if (searchToggleBtn) {
    searchToggleBtn.style.display = count > 1 ? '' : 'none';
  }

  if (multiSelectToggle) {
    multiSelectToggle.style.display = count > 1 ? '' : 'none';
  }
}

export function updateSavedEmptyState(visibleCount = null) {
  if (visibleCount === null) {
    visibleCount = Array.from(document.querySelectorAll('#saved-list .saved-item')).filter(
      (item) => !item.classList.contains('pending-delete')
    ).length;
  }
  const emptyEl = document.getElementById('saved-empty');
  const filterEmptyEl = document.getElementById('filter-empty');

  const isFiltering = areFiltersActive();

  if (state.totalFilteredCount === 0 && !isFiltering) {
    emptyEl.classList.remove('hidden');
    filterEmptyEl.classList.add('hidden');
  } else if (state.totalFilteredCount === 0 && isFiltering) {
    emptyEl.classList.add('hidden');
    filterEmptyEl.classList.remove('hidden');
  } else {
    emptyEl.classList.add('hidden');
    filterEmptyEl.classList.add('hidden');
  }

  updateSavedActionsVisibility(visibleCount);
}

export function renderSavedItem(item) {
  const escapeHtml = (value = '') =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char]
    );

  const escapedTitle = escapeHtml(item.title || item.domain || '');
  const escapedDescription = escapeHtml(item.description || '—');

  const wrapper = document.createElement('div');
  wrapper.dataset.salesScore = Number(item.sales_readiness_score ?? 0);
  wrapper.dataset.persona = (item.best_sales_persona || '').toLowerCase().trim();
  wrapper.className = 'saved-item';

  wrapper.innerHTML = `
  <div class="saved-item-header">
    <div class="header-info">
      <strong>${escapedTitle}</strong>
      <div style="font-size:12px; opacity:0.7">${item.domain}</div>
    </div>

    <div class="header-actions">
      <button class="copy-btn copy-saved-btn" title="Copy analysis">
        <svg viewBox="0 0 24 24" class="copy-icon">
          <rect x="9" y="9" width="13" height="13" rx="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>

      <button class="delete-saved-btn" title="Remove">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
          <path d="M10 11v6"></path>
          <path d="M14 11v6"></path>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
        </svg>
      </button>
    </div>
      <input
        type="checkbox"
        class="saved-select-checkbox hidden"
        data-id="${item.id}"
        aria-label="Select saved analysis ${item.title || item.domain}"
      />
  </div>

  <div class="saved-item-body hidden">
    <p><strong>Sales readiness:</strong> ${item.sales_readiness_score ?? '—'}</p>
    <p><strong>What they do:</strong> ${item.what_they_do || '—'}</p>
    <p><strong>Target customer:</strong> ${item.target_customer || '—'}</p>
    <p><strong>Value proposition:</strong> ${item.value_proposition || '—'}</p>
    <p>
      <strong>Best sales persona:</strong> ${item.best_sales_persona || '—'}
      <span style="opacity:0.7; font-size:13px">
        ${item.best_sales_persona_reason ? `(${item.best_sales_persona_reason})` : ''}
      </span>
    </p>
    <p><strong>Sales angle:</strong> ${item.sales_angle || '—'}</p>

    <hr style="margin:10px 0; opacity:0.25" />

    <p><strong>Recommended outreach</strong></p>

    <p>
      <strong>Who:</strong>
      ${item.recommended_outreach_persona || '—'}
    </p>

    <p>
      <strong>Goal:</strong>
      ${item.recommended_outreach_goal || '—'}
    </p>

    <p>
      <strong>Angle:</strong>
      ${item.recommended_outreach_angle || '—'}
    </p>

    <p style="opacity:0.9; font-size:13px">
      <strong>Message:</strong><br />
      ${item.recommended_outreach_message || '—'}
    </p>

    <hr style="margin:8px 0; opacity:0.3" />

    <p style="opacity:0.85">
      <strong>Company overview:</strong>
      ${escapedDescription}
    </p>

    ${
      item.url
        ? `
          <p>
            <strong>URL:</strong>
            <a
              href="${item.url}"
              target="_blank"
              class="saved-url"
            >
              ${item.url}
            </a>
          </p>
        `
        : ''
    }
  </div>
`;

  const header = wrapper.querySelector('.saved-item-header');
  const body = wrapper.querySelector('.saved-item-body');
  const checkbox = wrapper.querySelector('.saved-select-checkbox');

  const copySavedBtn = wrapper.querySelector('.copy-saved-btn');

  copySavedBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    const settings = await loadSettings();
    const formatLabel = settings.copyFormat === 'short' ? 'short' : 'full';

    const text = await buildSavedCopyText(item);
    copyAnalysisText(text, copySavedBtn, formatLabel);
  });

  const handleSelection = (isShift, forceState = null) => {
    const items = Array.from(document.querySelectorAll('#saved-list .saved-item')).filter(
      (i) => !i.classList.contains('pending-delete')
    );

    const currentIndex = items.indexOf(wrapper);
    const shouldSelect = forceState !== null ? forceState : checkbox.checked;

    if (state.selectionMode && isShift && state.lastSelectedIndex !== null) {
      const [start, end] = [
        Math.min(state.lastSelectedIndex, currentIndex),
        Math.max(state.lastSelectedIndex, currentIndex),
      ];
      state.isRangeSelecting = true;
      items.slice(start, end + 1).forEach((itemEl) => {
        const cb = itemEl.querySelector('.saved-select-checkbox');
        if (cb) {
          cb.checked = shouldSelect;
          itemEl.classList.toggle('selected', shouldSelect);
          if (shouldSelect) state.selectedSavedIds.add(cb.dataset.id);
          else state.selectedSavedIds.delete(cb.dataset.id);
        }
      });
      state.isRangeSelecting = false;
    } else {
      checkbox.checked = shouldSelect;
      wrapper.classList.toggle('selected', shouldSelect);
      if (shouldSelect) state.selectedSavedIds.add(checkbox.dataset.id);
      else state.selectedSavedIds.delete(checkbox.dataset.id);
    }
    state.lastSelectedIndex = currentIndex;
    updateDeleteState();
    updateSelectAllIcon();
  };

  checkbox?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleSelection(e.shiftKey);
  });

  wrapper.querySelector('.delete-saved-btn').addEventListener('click', (e) => {
    if (state.selectionMode || state.isUndoToastActive) return;
    e.stopPropagation();

    const itemId = item.id;

    wrapper.dataset.isPendingDelete = 'true';
    wrapper.classList.add('pending-delete');

    state.pendingDeleteMap.set(itemId, {
      element: wrapper,
      finalize: async () => {
        const { data } = await supabase.auth.getSession();
        if (!data?.session?.user) return;

        await supabase
          .from('saved_analyses')
          .delete()
          .eq('user_id', data.session.user.id)
          .eq('id', itemId);

        wrapper.remove();
      },
    });

    showUndoToast();
  });

  let pressTimer;
  let preventNextClick = false;

  const startPress = (e) => {
    if (state.selectionMode || (e.type === 'mousedown' && e.button !== 0)) return;

    const visibleItems = Array.from(document.querySelectorAll('#saved-list .saved-item')).filter(
      (item) =>
        !item.classList.contains('pending-delete') && item.dataset.isPendingDelete !== 'true'
    );

    if (visibleItems.length <= 1) return;

    preventNextClick = false;

    pressTimer = setTimeout(() => {
      enterSelectionModeFromItem();
    }, 600);
  };

  const cancelPress = () => {
    clearTimeout(pressTimer);
  };

  const enterSelectionModeFromItem = async () => {
    const { updateSelectionUI } = await import('./selection.js');
    state.selectionMode = true;
    preventNextClick = true;
    updateSelectionUI();
    handleSelection(false, true);
  };

  header.addEventListener('mousedown', startPress);
  header.addEventListener('mouseup', cancelPress);
  header.addEventListener('mouseleave', cancelPress);

  header.addEventListener('touchstart', startPress, { passive: true });
  header.addEventListener('touchend', cancelPress);
  header.addEventListener('touchcancel', cancelPress);

  header.addEventListener(
    'click',
    (e) => {
      if (preventNextClick) {
        e.preventDefault();
        e.stopPropagation();
        preventNextClick = false;
        return;
      }

      if (state.selectionMode) {
        if (e.target === checkbox) return;
        handleSelection(e.shiftKey, !checkbox.checked);
        return;
      }

      if (e.target.closest('.delete-saved-btn') || e.target.closest('.copy-saved-btn')) {
        return;
      }

      const container = wrapper.parentElement;
      if (container) {
        container.querySelectorAll('.saved-item-body').forEach((other) => {
          if (other !== body) other.classList.add('hidden');
        });
      }

      body.classList.toggle('hidden');
    },
    true
  );

  return wrapper;
}
