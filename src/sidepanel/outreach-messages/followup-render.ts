import { state } from '../state.js';
import { formatOutreachEmailBody, getCompanyDisplayName } from './format.js';
import type { FollowUpEmail, FollowUpEmailsResult } from './types.js';

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function setButtonState(label: string, disabled = false, mode: 'generate' | 'show' | 'hide' = 'generate') {
  const btn = document.getElementById('generate-followups-btn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = disabled;
  btn.dataset.mode = mode;
  btn.textContent = label;
}

function companyName(): string {
  return getCompanyDisplayName(state.lastExtractedMeta?.title, state.lastExtractedMeta?.domain);
}

function buildCopyButton(email: FollowUpEmail): string {
  return `
    <button class="variation-copy-btn" type="button" aria-label="Copy follow-up"
      data-tooltip="Copy" data-subject="${escapeAttr(email.subject)}" data-body="${escapeAttr(email.body)}"
      data-company-name="${escapeAttr(companyName())}">
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor"
        stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>`;
}

function buildCard(email: FollowUpEmail): string {
  const paragraphs = formatOutreachEmailBody(email.body, companyName());
  return `
    <div class="outreach-angle-card">
      <div class="outreach-angle-header">
        <span class="outreach-angle-label">${escapeAttr(email.label)}</span>
      </div>
      <div class="outreach-email-content">
        <div class="outreach-email-header">
          <div class="variation-subject">${escapeAttr(email.subject)}</div>
          ${buildCopyButton(email)}
        </div>
        ${paragraphs
          .map((paragraph) => `<p class="variation-body">${escapeAttr(paragraph)}</p>`)
          .join('')}
      </div>
    </div>`;
}

export function resetFollowUpUi(): void {
  document.getElementById('follow-up-section')?.classList.add('hidden');
  document.getElementById('follow-up-list')?.classList.add('hidden');
  document.getElementById('follow-up-loading')?.classList.add('hidden');
  document.getElementById('follow-up-actions')?.classList.add('hidden');
  setButtonState('Generate follow-ups');
}

export function syncFollowUpUi(): void {
  if (!state.outreachAngles?.angles?.length) {
    resetFollowUpUi();
    return;
  }
  if (state.followUpEmails?.emails?.length) {
    renderFollowUpEmails(state.followUpEmails);
    return;
  }
  document.getElementById('follow-up-actions')?.classList.remove('hidden');
  document.getElementById('follow-up-section')?.classList.add('hidden');
  setButtonState('Generate follow-ups');
}

export function renderFollowUpLoading(): void {
  document.getElementById('follow-up-actions')?.classList.remove('hidden');
  document.getElementById('follow-up-section')?.classList.remove('hidden');
  document.getElementById('follow-up-list')?.classList.add('hidden');
  const loading = document.getElementById('follow-up-loading');
  if (!loading) return;
  loading.innerHTML = '<div class="outreach-skeleton-card"></div><div class="outreach-skeleton-card"></div>';
  loading.classList.remove('hidden');
  setButtonState('Generating follow-ups...', true);
}

export function renderFollowUpError(): void {
  document.getElementById('follow-up-loading')?.classList.add('hidden');
  document.getElementById('follow-up-section')?.classList.add('hidden');
  setButtonState('Generate follow-ups');
}

export function renderFollowUpEmails(result: FollowUpEmailsResult): void {
  document.getElementById('follow-up-loading')?.classList.add('hidden');
  document.getElementById('follow-up-actions')?.classList.add('hidden');
  document.getElementById('follow-up-section')?.classList.remove('hidden');
  const list = document.getElementById('follow-up-list');
  if (!list) return;
  list.innerHTML = result.emails.map(buildCard).join('');
  list.classList.remove('hidden');
  setButtonState('Generate follow-ups');
}

export function collapseFollowUpEmails(): void {
  document.getElementById('follow-up-section')?.classList.add('hidden');
  document.getElementById('follow-up-actions')?.classList.add('hidden');
  setButtonState('Generate follow-ups');
}
