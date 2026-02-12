import { buildSavedCopyText, copyAnalysisText } from '../clipboard.js';
import { loadSettings } from '../settings.js';
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { updateDeleteState, updateSelectAllIcon, updateSelectionUI } from './selection.js';

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

export function renderSavedItem(item, onUndoToast) {
  const escapedTitle = escapeHtml(item.title || item.domain || '');
  const escapedDescription = escapeHtml(item.description || '-');

  const wrapper = document.createElement('div');
  wrapper.dataset.salesScore = Number(item.sales_readiness_score ?? 0);
  wrapper.dataset.persona = (item.best_sales_persona || '').toLowerCase().trim();
  wrapper.className = 'saved-item';

  wrapper.innerHTML = `
  <div class="saved-item-header">
    <div class="header-info">
      <strong>${escapedTitle}</strong>
      <div class="u-text-12 u-opacity-70">${item.domain}</div>
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
    <p><strong>Sales readiness:</strong> ${item.sales_readiness_score ?? '-'}</p>
    <p><strong>What they do:</strong> ${item.what_they_do || '-'}</p>
    <p><strong>Target customer:</strong> ${item.target_customer || '-'}</p>
    <p><strong>Value proposition:</strong> ${item.value_proposition || '-'}</p>
    <p>
      <strong>Best sales persona:</strong> ${item.best_sales_persona || '-'}
      <span class="u-text-13 u-opacity-70">
        ${item.best_sales_persona_reason ? `(${item.best_sales_persona_reason})` : ''}
      </span>
    </p>
    <p><strong>Sales angle:</strong> ${item.sales_angle || '-'}</p>

    <hr class="u-hr" />

    <p><strong>Recommended outreach</strong></p>

    <p>
      <strong>Who:</strong>
      ${item.recommended_outreach_persona || '-'}
    </p>

    <p>
      <strong>Goal:</strong>
      ${item.recommended_outreach_goal || '-'}
    </p>

    <p>
      <strong>Angle:</strong>
      ${item.recommended_outreach_angle || '-'}
    </p>

    <p class="u-text-13 u-opacity-90">
      <strong>Message:</strong><br />
      ${item.recommended_outreach_message || '-'}
    </p>

    <hr class="u-hr-compact" />

    <p class="u-opacity-85">
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

    if (typeof onUndoToast === 'function') {
      onUndoToast();
    }
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

  const enterSelectionModeFromItem = () => {
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
