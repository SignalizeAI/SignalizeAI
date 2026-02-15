import { cleanTitle, highlightText } from '../analysis.js';
import { buildSavedCopyText, copyAnalysisText } from '../clipboard.js';
import { loadSettings } from '../settings.js';
import { supabase } from '../supabase.js';
import { state } from '../state.js';
import { updateDeleteState, updateSelectionUI } from './selection.js';

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  return value;
}

function createIconButton(className, label, svgMarkup) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.setAttribute('aria-label', label);
  btn.innerHTML = svgMarkup;
  return btn;
}

function buildCopyIcon() {
  return `
    <svg viewBox="0 0 24 24" class="copy-icon">
      <rect x="9" y="9" width="13" height="13" rx="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;
}

function buildDeleteIcon() {
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M8 6v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  `;
}

function buildChevronIcon() {
  return `
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;
}

export function renderSavedItem(item, showUndoToast) {
  const savedItem = document.createElement('div');
  savedItem.className = 'saved-item';
  savedItem.dataset.id = item.id;

  const header = document.createElement('div');
  header.className = 'saved-item-header';

  const titleWrap = document.createElement('div');
  const titleEl = document.createElement('strong');

  const rawTitle = cleanTitle(item.title || item.domain || 'Untitled');
  const query = state.activeFilters.searchQuery || '';
  const safeTitle = escapeHtml(rawTitle);
  titleEl.innerHTML = query ? highlightText(safeTitle, query) : safeTitle;

  const domainEl = document.createElement('div');
  const safeDomain = escapeHtml(item.domain || '');
  domainEl.innerHTML = query ? highlightText(safeDomain, query) : safeDomain;
  domainEl.style.fontSize = '12px';
  domainEl.style.opacity = '0.7';

  titleWrap.appendChild(titleEl);
  if (item.domain) titleWrap.appendChild(domainEl);

  const actions = document.createElement('div');
  actions.className = 'header-actions';

  const copyBtn = createIconButton('copy-btn copy-saved-btn', 'Copy analysis', buildCopyIcon());
  const deleteBtn = createIconButton('delete-saved-btn', 'Delete analysis', buildDeleteIcon());

  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'toggle-icon';
  toggleIcon.innerHTML = buildChevronIcon();

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'saved-select-checkbox hidden';
  checkbox.dataset.id = String(item.id);

  actions.appendChild(copyBtn);
  actions.appendChild(deleteBtn);
  actions.appendChild(toggleIcon);
  actions.appendChild(checkbox);

  header.appendChild(titleWrap);
  header.appendChild(actions);

  const body = document.createElement('div');
  body.className = 'saved-item-body hidden';

  const appendRow = (label, value) => {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}:`;
    p.appendChild(strong);

    if (value instanceof HTMLElement) {
      p.appendChild(value);
    } else {
      p.appendChild(document.createTextNode(` ${formatValue(value)}`));
    }

    body.appendChild(p);
  };

  const urlLink = document.createElement('a');
  urlLink.href = item.url || '#';
  urlLink.target = '_blank';
  urlLink.rel = 'noopener noreferrer';
  urlLink.className = 'saved-url';
  urlLink.textContent = item.url || '—';

  appendRow('What they do', item.what_they_do);
  appendRow('Target customer', item.target_customer);
  appendRow('Value proposition', item.value_proposition);
  appendRow('Sales angle', item.sales_angle);
  appendRow('Sales readiness', item.sales_readiness_score ?? '—');
  appendRow('Best persona', item.best_sales_persona);
  appendRow('Persona reason', item.best_sales_persona_reason);
  appendRow('URL', urlLink);

  savedItem.appendChild(header);
  savedItem.appendChild(body);

  const toggleSelection = () => {
    if (!state.selectionMode) return;

    checkbox.checked = !checkbox.checked;
    if (checkbox.checked) {
      state.selectedSavedIds.add(checkbox.dataset.id);
    } else {
      state.selectedSavedIds.delete(checkbox.dataset.id);
    }

    updateSelectionUI();
    updateDeleteState();
  };

  header.addEventListener('click', () => {
    if (state.selectionMode) {
      toggleSelection();
      return;
    }

    body.classList.toggle('hidden');
  });

  checkbox.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      state.selectedSavedIds.add(checkbox.dataset.id);
    } else {
      state.selectedSavedIds.delete(checkbox.dataset.id);
    }

    updateSelectionUI();
    updateDeleteState();
  });

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    const settings = await loadSettings();
    const formatLabel = settings.copyFormat === 'short' ? 'short' : 'full';
    const text = await buildSavedCopyText(item);
    copyAnalysisText(text, copyBtn, formatLabel);
  });

  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (state.isUndoToastActive) return;

    const existing = state.pendingDeleteMap.get(String(item.id));
    if (existing) return;

    savedItem.dataset.isPendingDelete = 'true';
    savedItem.classList.add('pending-delete');

    state.pendingDeleteMap.set(String(item.id), {
      element: savedItem,
      finalize: async () => {
        const { data } = await supabase.auth.getSession();
        const user = data?.session?.user;
        if (!user) return;

        const { error } = await supabase
          .from('saved_analyses')
          .delete()
          .eq('user_id', user.id)
          .eq('id', item.id);

        if (error) {
          throw new Error(error.message || 'Delete failed');
        }

        savedItem.remove();
      },
    });

    state.selectedSavedIds.delete(String(item.id));
    updateSelectionUI();
    updateDeleteState();

    showUndoToast();
  });

  return savedItem;
}
