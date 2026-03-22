import { generateFollowUpEmails, generateOutreachAngles } from '../../../ai-analyze.js';
import { onCopyVariationClick } from '../../outreach-messages/handlers.js';
import { getRecommendedAngleId } from '../../outreach-messages/types.js';
import { buildSavedOutreachMarkup } from '../../saved/outreach-render.js';
import { supabase } from '../../supabase.js';
import { showToast } from '../../toast.js';
import type { Analysis } from '../../state.js';
import { BATCH_OUTREACH_DELAY_MS } from './constants.js';
import { batchState } from './state.js';
import type { BatchResult } from './types.js';

const EMAIL_BUTTON_ICON = `
  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2"
       fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>`;

let isGeneratingAll = false;
let cancelGenerateAll = false;

function withEmailIcon(label: string): string {
  return `${EMAIL_BUTTON_ICON} ${label}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function hasOutreachAngles(result: BatchResult): boolean {
  return Boolean(result.outreachAngles?.angles?.length);
}

function hasFollowUpEmails(result: BatchResult): boolean {
  return Boolean(result.followUpEmails?.emails?.length);
}

function buildMeta(result: BatchResult) {
  return {
    title: result.content.title || result.domain,
    url: result.url,
    domain: result.domain,
    evidence: {
      metaDescription: result.content.metaDescription,
      headings: result.content.headings,
      paragraphs: result.content.paragraphs,
    },
  };
}

function buildSavedOutreachPayload(result: BatchResult) {
  if (!result.outreachAngles?.angles?.length) return null;
  return {
    generated_at: result.outreachGeneratedAt || new Date().toISOString(),
    recommended_angle_id: result.outreachAngles.recommendedAngleId,
    angles: result.outreachAngles.angles,
    ...(hasFollowUpEmails(result) ? { follow_ups: result.followUpEmails } : {}),
  };
}

async function syncSavedProspectOutreach(result: BatchResult): Promise<void> {
  if (result.status !== 'saved') return;

  const payload = buildSavedOutreachPayload(result);
  if (!payload) return;

  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return;

  const { error } = await supabase
    .from('saved_analyses')
    .update({ outreach_angles: payload })
    .eq('user_id', user.id)
    .eq('domain', result.domain);

  if (error) {
    console.error('Failed to sync batch outreach to saved prospect:', error);
  }
}

function renderInlineOutreach(result: BatchResult, host: HTMLElement): void {
  const payload = buildSavedOutreachPayload(result);
  host.innerHTML = payload
    ? buildSavedOutreachMarkup(
        {
          outreach_angles: payload,
          title: result.content.title,
          domain: result.domain,
          sales_readiness_score: result.analysis.salesReadinessScore,
          best_sales_persona: result.analysis.bestSalesPersona?.persona,
        },
        result.outreachExpanded ?? false
      )
    : '';
  host.classList.toggle('hidden', !payload);
  const followUpsBtn = host.querySelector('.saved-followups-btn') as HTMLButtonElement | null;
  if (followUpsBtn) {
    followUpsBtn.innerHTML = withEmailIcon('Generate Follow-Ups');
  }
}

function setButtonState(
  btn: HTMLButtonElement | null,
  label: string,
  disabled = false,
  state: 'default' | 'loading' | 'retry' = 'default'
): void {
  if (!btn) return;
  btn.disabled = disabled;
  btn.dataset.state = state;
  btn.innerHTML = withEmailIcon(label);
}

function findBatchFooter(index: number): HTMLElement | null {
  return document.querySelector(
    `.batch-outreach-footer[data-batch-index="${index}"]`
  ) as HTMLElement | null;
}

function syncVisibleFooter(index: number): void {
  const footer = findBatchFooter(index);
  const result = batchState.tempBatchResults[index];
  if (!footer || !result) return;

  const btn = footer.querySelector('.batch-generate-emails-btn') as HTMLButtonElement | null;
  const status = footer.querySelector('.batch-outreach-status') as HTMLElement | null;
  footer.classList.toggle('hidden', hasOutreachAngles(result));

  if (hasOutreachAngles(result)) {
    if (status) status.innerHTML = '';
    return;
  }

  if (result.outreachError) {
    if (status) status.textContent = 'Failed to generate emails after multiple attempts.';
    setButtonState(btn, 'Retry Outreach Emails', false, 'retry');
    return;
  }

  if (status) status.innerHTML = '';
  setButtonState(btn, 'Generate Outreach Emails', false, 'default');
}

async function generateForResult(index: number, maxAttempts = 3): Promise<boolean> {
  const result = batchState.tempBatchResults[index];
  if (!result) return false;

  result.outreachError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const generated = await generateOutreachAngles(result.analysis as Analysis, buildMeta(result));
    if (generated) {
      result.outreachAngles = generated;
      result.followUpEmails = null;
      result.outreachExpanded = true;
      result.outreachGeneratedAt = new Date().toISOString();
      await syncSavedProspectOutreach(result);
      return true;
    }
  }

  result.outreachError = 'Failed to generate emails.';
  return false;
}

async function generateFollowUpsForResult(index: number): Promise<boolean> {
  const result = batchState.tempBatchResults[index];
  const recommended = result?.outreachAngles?.angles?.find(
    (angle) => angle.id === getRecommendedAngleId(result.outreachAngles)
  );
  const openingEmail = recommended?.variations?.[0];
  if (!result || !openingEmail?.subject || !openingEmail?.body) return false;

  const followUps = await generateFollowUpEmails(result.analysis as Analysis, buildMeta(result), openingEmail);
  if (!followUps?.emails?.length) return false;

  result.followUpEmails = followUps;
  result.outreachExpanded = true;
  await syncSavedProspectOutreach(result);
  return true;
}

function showLoadingShell(host: HTMLElement): void {
  host.classList.remove('hidden');
  host.innerHTML = `
    <div class="saved-outreach-shell">
      <div class="saved-outreach-section">
        <div class="saved-outreach-heading">Suggested outreach emails</div>
        <div class="saved-outreach-content">
          <div class="outreach-skeleton-card"></div>
          <div class="outreach-skeleton-card"></div>
        </div>
      </div>
    </div>
  `;
}

function focusOutreachArea(host: HTMLElement): void {
  window.setTimeout(() => {
    host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

async function runCardGenerate(
  index: number,
  btn: HTMLButtonElement,
  body: HTMLElement,
  host: HTMLElement
): Promise<void> {
  setButtonState(btn, 'Generating...', true, 'loading');
  body.classList.remove('hidden');
  showLoadingShell(host);
  focusOutreachArea(host);

  const success = await generateForResult(index);
  if (!success) {
    host.classList.add('hidden');
    syncVisibleFooter(index);
    showToast('Failed to generate emails.');
    return;
  }

  renderInlineOutreach(batchState.tempBatchResults[index], host);
  focusOutreachArea(host);
  syncVisibleFooter(index);
}

function bindInlineOutreachEvents(index: number, host: HTMLElement): void {
  host.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const copyBtn = target.closest('.variation-copy-btn') as HTMLButtonElement | null;
    if (copyBtn) {
      onCopyVariationClick(copyBtn);
      return;
    }

    const toggleBtn = target.closest('.saved-outreach-toggle-btn') as HTMLButtonElement | null;
    if (toggleBtn) {
      event.stopPropagation();
      const result = batchState.tempBatchResults[index];
      if (!result) return;
      result.outreachExpanded = !(result.outreachExpanded ?? false);
      renderInlineOutreach(result, host);
      if (result.outreachExpanded) focusOutreachArea(host);
      return;
    }

    const followUpsBtn = target.closest('.saved-followups-btn') as HTMLButtonElement | null;
    if (!followUpsBtn) return;

    event.stopPropagation();
    followUpsBtn.disabled = true;
    followUpsBtn.textContent = 'Generating...';
    const success = await generateFollowUpsForResult(index);
    if (!success) {
      followUpsBtn.disabled = false;
      followUpsBtn.textContent = 'Retry';
      showToast('Failed to generate follow-ups.');
      return;
    }

    renderInlineOutreach(batchState.tempBatchResults[index], host);
    focusOutreachArea(host);
  });
}

export function buildBatchOutreachFooter(
  result: BatchResult,
  index: number,
  body: HTMLElement,
  host: HTMLElement
): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'batch-outreach-footer';
  footer.dataset.batchIndex = index.toString();

  const btn = document.createElement('button');
  btn.className = 'batch-generate-emails-btn';
  const status = document.createElement('div');
  status.className = 'batch-outreach-status';

  bindInlineOutreachEvents(index, host);
  renderInlineOutreach(result, host);

  if (hasOutreachAngles(result)) {
    footer.classList.add('hidden');
  } else if (result.outreachError) {
    status.textContent = 'Failed to generate emails after multiple attempts.';
    setButtonState(btn, 'Retry Outreach Emails', false, 'retry');
  } else {
    setButtonState(btn, 'Generate Outreach Emails', false, 'default');
  }

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    void runCardGenerate(index, btn, body, host);
  });

  footer.appendChild(btn);
  footer.appendChild(status);
  return footer;
}

export async function generateEmailsForIndices(
  indices: number[],
  onProgress: (done: number, total: number) => void,
  onDone: (summary: {
    cancelled: boolean;
    completed: number;
    total: number;
    failed: number;
  }) => void
): Promise<void> {
  if (isGeneratingAll) return;

  const targets = indices.filter((index) => {
    const result = batchState.tempBatchResults[index];
    return result && !hasOutreachAngles(result);
  });
  if (targets.length === 0) {
    onDone({ cancelled: false, completed: 0, total: 0, failed: 0 });
    return;
  }

  isGeneratingAll = true;
  cancelGenerateAll = false;
  let completed = 0;
  let failed = 0;

  for (const index of targets) {
    if (cancelGenerateAll) break;
    const footer = findBatchFooter(index);
    const btn = footer?.querySelector('.batch-generate-emails-btn') as HTMLButtonElement | null;
    const host = document.querySelector(
      `.batch-outreach-inline[data-batch-index="${index}"]`
    ) as HTMLElement | null;
    const body = host?.closest('.saved-item-body') as HTMLElement | null;

    if (btn && host && body) {
      setButtonState(btn, 'Generating...', true, 'loading');
      body.classList.remove('hidden');
      showLoadingShell(host);
      focusOutreachArea(host);
    }

    const success = await generateForResult(index);
    if (!success) failed++;
    if (host) {
      renderInlineOutreach(batchState.tempBatchResults[index], host);
      if (success) focusOutreachArea(host);
    }
    syncVisibleFooter(index);

    completed++;
    onProgress(completed, targets.length);
    if (!cancelGenerateAll && completed < targets.length) await wait(BATCH_OUTREACH_DELAY_MS);
  }

  const cancelled = cancelGenerateAll;
  isGeneratingAll = false;
  cancelGenerateAll = false;
  onDone({ cancelled, completed, total: targets.length, failed });
}

export async function generateEmailsForAll(
  results: BatchResult[],
  onProgress: (done: number, total: number) => void,
  onDone: (summary: {
    cancelled: boolean;
    completed: number;
    total: number;
    failed: number;
  }) => void
): Promise<void> {
  const indices = results
    .map((result) => batchState.tempBatchResults.indexOf(result))
    .filter((index) => index >= 0);
  await generateEmailsForIndices(indices, onProgress, onDone);
}

export function cancelBatchEmailGeneration(): void {
  cancelGenerateAll = true;
}
