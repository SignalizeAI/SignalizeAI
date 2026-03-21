import { buildSavedCopyText, copyAnalysisText } from '../clipboard.js';
import { loadSettings } from '../settings.js';
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { openDashboardForSavedId } from '../dashboard-link.js';
import { syncProspectStatusToWebsite } from '../status-sync.js';
import { onCopyVariationClick } from '../outreach-messages/handlers.js';
import { areFiltersActive } from './filtering.js';
import { generateSavedFollowUpPayload, generateSavedOutreachPayload } from './outreach-actions.js';
import { updateDeleteState, updateSelectAllIcon } from './selection.js';
import { showUndoToast } from './delete.js';
import { buildSavedOutreachMarkup } from './outreach-render.js';

const exportToggle = document.getElementById('export-menu-toggle');
const filterToggle = document.getElementById('filter-toggle');

interface SavedItem {
  id: string;
  title?: string;
  domain?: string;
  url?: string;
  description?: string;
  sales_readiness_score?: number;
  what_they_do?: string;
  target_customer?: string;
  value_proposition?: string;
  best_sales_persona?: string;
  best_sales_persona_reason?: string;
  sales_angle?: string;
  recommended_outreach_persona?: string;
  recommended_outreach_goal?: string;
  recommended_outreach_angle?: string;
  recommended_outreach_message?: string;
  prospect_status?: string;
  [key: string]: any;
}

async function updateProspectStatus(itemId: string, status: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return;

  const { error } = await supabase
    .from('saved_analyses')
    .update({ prospect_status: status })
    .eq('user_id', user.id)
    .eq('id', itemId);

  if (error) {
    throw error;
  }
}

function formatStatusLabel(status: string): string {
  if (status === 'contacted') return 'Contacted';
  if (status === 'follow_up') return 'Follow-up due';
  return 'Not contacted';
}

export function updatePlanLimitBanner(): void {
  const banner = document.getElementById('plan-limit-banner');
  const visibleCountEl = document.getElementById('visible-count');
  const totalCountEl = document.getElementById('total-count');

  if (!banner) return;

  const hasExceededLimit = state.totalSavedCount > state.maxSavedLimit;

  if (hasExceededLimit) {
    if (visibleCountEl) visibleCountEl.textContent = String(state.maxSavedLimit);
    if (totalCountEl) totalCountEl.textContent = String(state.totalSavedCount);
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

export function updateSavedActionsVisibility(count: number): void {
  const searchToggleBtn = document.getElementById('search-toggle');
  const multiSelectToggle = document.getElementById('multi-select-toggle');

  const isFreePlan = (state.currentPlan || '').toLowerCase() === 'free';

  const showBasicActions = count > 0 && !isFreePlan ? '' : 'none';
  if (filterToggle) filterToggle.style.display = showBasicActions;
  if (exportToggle) exportToggle.style.display = showBasicActions;

  if (searchToggleBtn) {
    searchToggleBtn.style.display = count > 1 && !isFreePlan ? '' : 'none';
  }

  if (multiSelectToggle) {
    multiSelectToggle.style.display = count > 1 ? '' : 'none';
  }
}

export function updateSavedEmptyState(visibleCount: number | null = null): void {
  if (visibleCount === null) {
    visibleCount = Array.from(
      document.querySelectorAll<HTMLElement>('#saved-list .saved-item')
    ).filter((item) => !item.classList.contains('pending-delete')).length;
  }
  const emptyEl = document.getElementById('saved-empty');
  const filterEmptyEl = document.getElementById('filter-empty');

  const isFiltering = areFiltersActive();

  if (state.totalFilteredCount === 0 && !isFiltering) {
    emptyEl?.classList.remove('hidden');
    filterEmptyEl?.classList.add('hidden');
  } else if (state.totalFilteredCount === 0 && isFiltering) {
    emptyEl?.classList.add('hidden');
    filterEmptyEl?.classList.remove('hidden');
  } else {
    emptyEl?.classList.add('hidden');
    filterEmptyEl?.classList.add('hidden');
  }

  updateSavedActionsVisibility(visibleCount);
}

export function renderSavedItem(item: SavedItem): HTMLElement {
  const escapeHtml = (value: any = ''): string =>
    String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[char] || char
    );

  const escapedTitle = escapeHtml(item.title || item.domain || '');
  const escapedDescription = escapeHtml(item.description || '—');
  const currentStatus = item.prospect_status || 'not_contacted';

  const wrapper = document.createElement('div');
  wrapper.dataset.salesScore = String(Number(item.sales_readiness_score ?? 0));
  wrapper.dataset.persona = (item.best_sales_persona || '').toLowerCase().trim();
  wrapper.dataset.status = currentStatus;
  wrapper.className = 'saved-item';

  wrapper.innerHTML = `
  <div class="saved-item-header">
    <div class="header-info">
      <div class="saved-item-title">${escapedTitle}</div>
      <div class="saved-item-site-row">
        ${
          item.url
            ? `<a href="${item.url}" target="_blank" class="saved-item-site-link">${item.domain || item.url}</a>`
            : `<div class="saved-item-site-link">${item.domain || '—'}</div>`
        }
      </div>
    </div>

    <div class="header-actions">
      <div class="saved-item-badge-row">
        <span class="saved-status-pill saved-status-pill--${currentStatus}">${formatStatusLabel(currentStatus)}</span>
      </div>
      <div class="header-actions-row">
        <button class="copy-btn copy-saved-btn" title="Copy prospect data">
          <svg viewBox="0 0 24 24" class="copy-icon">
            <rect x="9" y="9" width="13" height="13" rx="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>

        <button class="copy-btn open-dashboard-saved-btn" title="Open in website">
          <svg viewBox="0 0 24 24" class="copy-icon">
            <path d="M14 3h7v7"></path>
            <path d="M10 14 21 3"></path>
            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
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
    </div>
      <input
        type="checkbox"
        class="saved-select-checkbox hidden"
        data-id="${item.id}"
        aria-label="Select saved prospect ${item.title || item.domain}"
      />
  </div>

  <div class="saved-item-body hidden">
    <div class="saved-status-row">
      <div class="saved-status-label">Status</div>
      <select class="saved-status-select" data-id="${item.id}" aria-label="Prospect status">
        <option value="not_contacted"${currentStatus === 'not_contacted' ? ' selected' : ''}>Not contacted</option>
        <option value="contacted"${currentStatus === 'contacted' ? ' selected' : ''}>Contacted</option>
        <option value="follow_up"${currentStatus === 'follow_up' ? ' selected' : ''}>Follow-up due</option>
      </select>
    </div>
    <p><strong>Sales readiness:</strong> ${item.sales_readiness_score ?? '—'}</p>
    <p><strong>What they do:</strong> ${item.what_they_do || '—'}</p>
    <p><strong>Target customer:</strong> ${item.target_customer || '—'}</p>
    <p><strong>Value proposition:</strong> ${item.value_proposition || '—'}</p>
    <p>
      <strong>Best sales persona:</strong> ${item.best_sales_persona || '—'}
      ${
        item.best_sales_persona_reason
          ? `<br />
      <span style="opacity:0.7; font-size:13px">
        (${item.best_sales_persona_reason})
      </span>`
          : ''
      }
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

    <p>
      <strong>Message:</strong><br />
<span style="white-space: pre-wrap;">${(item.recommended_outreach_message || '—').trim()}</span>
    </p>

    ${buildSavedOutreachMarkup(item)}

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

  const header = wrapper.querySelector<HTMLElement>('.saved-item-header')!;
  const body = wrapper.querySelector<HTMLElement>('.saved-item-body')!;
  const checkbox = wrapper.querySelector<HTMLInputElement>('.saved-select-checkbox')!;

  const copySavedBtn = wrapper.querySelector<HTMLButtonElement>('.copy-saved-btn')!;
  const openDashboardBtn = wrapper.querySelector<HTMLButtonElement>('.open-dashboard-saved-btn')!;
  const statusSelect = wrapper.querySelector<HTMLSelectElement>('.saved-status-select')!;
  const statusPill = wrapper.querySelector<HTMLElement>('.saved-status-pill');

  const rerenderOutreach = (expanded = false): void => {
    const shell = wrapper.querySelector<HTMLElement>('.saved-outreach-shell');
    if (!shell) return;
    shell.outerHTML = buildSavedOutreachMarkup(item, expanded);
  };

  copySavedBtn.addEventListener('click', async (e: MouseEvent) => {
    e.stopPropagation();

    const settings = await loadSettings();
    const formatLabel = settings.copyFormat === 'short' ? 'short' : 'full';

    const text = await buildSavedCopyText(item);
    copyAnalysisText(text, copySavedBtn, formatLabel);
  });

  openDashboardBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    void openDashboardForSavedId(item.id);
  });

  wrapper.addEventListener('click', (e: MouseEvent) => {
    const outreachCopyBtn = (e.target as HTMLElement).closest(
      '.saved-outreach-copy-btn'
    ) as HTMLButtonElement | null;
    if (!outreachCopyBtn) return;
    e.stopPropagation();
    onCopyVariationClick(outreachCopyBtn);
  });

  wrapper.addEventListener('click', async (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const toggleBtn = target.closest('.saved-outreach-toggle-btn') as HTMLButtonElement | null;
    const followUpsBtn = target.closest('.saved-followups-btn') as HTMLButtonElement | null;
    if (!toggleBtn && !followUpsBtn) return;
    e.stopPropagation();

    if (toggleBtn) {
      const hasOutreach = Boolean(item.outreach_angles?.angles?.length);
      if (hasOutreach) {
        const content = wrapper.querySelector<HTMLElement>('.saved-outreach-content');
        rerenderOutreach(Boolean(content?.classList.contains('hidden')));
        return;
      }

      toggleBtn.disabled = true;
      toggleBtn.textContent = 'Generating...';
      const payload = await generateSavedOutreachPayload(item);
      if (!payload) {
        toggleBtn.disabled = false;
        toggleBtn.textContent = 'Retry';
        return;
      }
      item.outreach_angles = payload;
      const { error } = await supabase
        .from('saved_analyses')
        .update({ outreach_angles: payload })
        .eq('id', item.id);
      if (error) {
        console.error('Failed to save outreach emails:', error);
      }
      rerenderOutreach(true);
      return;
    }

    if (!followUpsBtn) return;
    followUpsBtn.disabled = true;
    followUpsBtn.textContent = item.outreach_angles?.follow_ups?.emails?.length
      ? 'Refreshing...'
      : 'Generating...';
    const payload = await generateSavedFollowUpPayload(item);
    if (!payload) {
      followUpsBtn.disabled = false;
      followUpsBtn.textContent = 'Retry';
      return;
    }
    item.outreach_angles = payload;
    const { error } = await supabase
      .from('saved_analyses')
      .update({ outreach_angles: payload })
      .eq('id', item.id);
    if (error) {
      console.error('Failed to save follow-up emails:', error);
    }
    rerenderOutreach(true);
  });

  statusSelect?.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
  });

  statusSelect?.addEventListener('change', async () => {
    const previousStatus = wrapper.dataset.status || 'not_contacted';
    const nextStatus = statusSelect.value;

    try {
      await updateProspectStatus(item.id, nextStatus);
      wrapper.dataset.status = nextStatus;
      item.prospect_status = nextStatus;
      if (statusPill) {
        statusPill.textContent = formatStatusLabel(nextStatus);
        statusPill.className = `saved-status-pill saved-status-pill--${nextStatus}`;
      }
      updateFilterBanner();
      void syncProspectStatusToWebsite(item.id, nextStatus);
    } catch (error) {
      console.error('Failed to update prospect status:', error);
      statusSelect.value = previousStatus;
    }
  });

  const handleSelection = (isShift: boolean, forceState: boolean | null = null): void => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('#saved-list .saved-item')
    ).filter((i) => !i.classList.contains('pending-delete'));

    const currentIndex = items.indexOf(wrapper);
    const shouldSelect = forceState !== null ? forceState : checkbox.checked;

    if (state.selectionMode && isShift && state.lastSelectedIndex !== null) {
      const [start, end] = [
        Math.min(state.lastSelectedIndex, currentIndex),
        Math.max(state.lastSelectedIndex, currentIndex),
      ];
      state.isRangeSelecting = true;
      items.slice(start, end + 1).forEach((itemEl) => {
        const cb = itemEl.querySelector<HTMLInputElement>('.saved-select-checkbox');
        if (cb) {
          cb.checked = shouldSelect;
          itemEl.classList.toggle('selected', shouldSelect);
          if (shouldSelect) state.selectedSavedIds.add(cb.dataset.id!);
          else state.selectedSavedIds.delete(cb.dataset.id!);
        }
      });
      state.isRangeSelecting = false;
    } else {
      checkbox.checked = shouldSelect;
      wrapper.classList.toggle('selected', shouldSelect);
      if (shouldSelect) state.selectedSavedIds.add(checkbox.dataset.id!);
      else state.selectedSavedIds.delete(checkbox.dataset.id!);
    }
    state.lastSelectedIndex = currentIndex;
    updateDeleteState();
    updateSelectAllIcon();
  };

  checkbox?.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    handleSelection(e.shiftKey);
  });

  wrapper
    .querySelector<HTMLButtonElement>('.delete-saved-btn')!
    .addEventListener('click', (e: MouseEvent) => {
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

  let pressTimer: ReturnType<typeof setTimeout>;
  let preventNextClick = false;

  const startPress = (e: MouseEvent | TouchEvent): void => {
    if (state.selectionMode || (e instanceof MouseEvent && e.button !== 0)) return;

    const visibleItems = Array.from(
      document.querySelectorAll<HTMLElement>('#saved-list .saved-item')
    ).filter(
      (item) =>
        !item.classList.contains('pending-delete') && item.dataset.isPendingDelete !== 'true'
    );

    if (visibleItems.length <= 1) return;

    preventNextClick = false;

    pressTimer = setTimeout(() => {
      enterSelectionModeFromItem();
    }, 600);
  };

  const cancelPress = (): void => {
    clearTimeout(pressTimer);
  };

  const enterSelectionModeFromItem = async (): Promise<void> => {
    const { updateSelectionUI } = await import('./selection.js');
    state.selectionMode = true;
    preventNextClick = true;
    updateSelectionUI();
    handleSelection(false, true);
  };

  header.addEventListener('mousedown', startPress);
  header.addEventListener('mouseup', cancelPress);
  header.addEventListener('mouseleave', cancelPress);

  header.addEventListener('touchstart', startPress as EventListener, { passive: true });
  header.addEventListener('touchend', cancelPress);
  header.addEventListener('touchcancel', cancelPress);

  header.addEventListener(
    'click',
    (e: MouseEvent) => {
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

      if (
        (e.target as HTMLElement).closest('.delete-saved-btn') ||
        (e.target as HTMLElement).closest('.copy-saved-btn') ||
        (e.target as HTMLElement).closest('.open-dashboard-saved-btn')
      ) {
        return;
      }

      const container = wrapper.parentElement;
      if (container) {
        container.querySelectorAll<HTMLElement>('.saved-item-body').forEach((other) => {
          if (other !== body) other.classList.add('hidden');
        });
      }

      body.classList.toggle('hidden');
    },
    true
  );

  return wrapper;
}
