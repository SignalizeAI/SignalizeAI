/**
 * Batch outreach: per-card email generation and "Emails for All" sequential flow.
 */

import { generateOutreachAngles } from '../../../ai-analyze.js';
import { onCopyVariationClick } from '../../outreach-messages/handlers.js';
import {
  PROBABILITY_COLOR,
  type OutreachAngle,
  type OutreachAnglesResult,
} from '../../outreach-messages/types.js';
import {
  formatOutreachEmailBody,
  getCompanyDisplayName,
  getOutreachReplyProbability,
} from '../../outreach-messages/format.js';
import type { Analysis } from '../../state.js';
import { batchState } from './state.js';
import { BATCH_OUTREACH_DELAY_MS } from './constants.js';
import type { BatchResult } from './types.js';

const EMAIL_BUTTON_ICON = `
  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2"
       fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>`;

let isGeneratingAll = false;
let cancelGenerateAll = false;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function hasOutreachAngles(result: BatchResult): boolean {
  return Boolean(result.outreachAngles?.angles?.length);
}

function findBatchFooter(index: number): HTMLElement | null {
  return document.querySelector(
    `.batch-outreach-footer[data-batch-index="${index}"]`
  ) as HTMLElement | null;
}

function setButtonState(
  btn: HTMLButtonElement | null,
  label: string,
  disabled = false,
  state: 'default' | 'loading' | 'toggle' | 'retry' = 'default'
): void {
  if (!btn) return;
  btn.disabled = disabled;
  btn.dataset.state = state;
  btn.innerHTML = `${EMAIL_BUTTON_ICON} ${label}`;
  btn.classList.remove('hidden');
  btn.style.display = '';
}

function buildAngleCard(
  angle: OutreachAngle,
  analysis: Analysis,
  recommendedAngleId: OutreachAngle['id'],
  companyName: string
): HTMLElement {
  const prob = getOutreachReplyProbability(
    angle.id,
    recommendedAngleId,
    analysis.salesReadinessScore,
    analysis.bestSalesPersona?.persona || ''
  );

  const card = document.createElement('div');
  card.className = 'outreach-angle-card';

  const header = document.createElement('div');
  header.className = 'outreach-angle-header';

  const labelEl = document.createElement('span');
  labelEl.className = 'outreach-angle-label';
  labelEl.textContent = angle.label;

  const probEl = document.createElement('span');
  probEl.className = `reply-probability reply-probability--${prob.toLowerCase()}`;
  probEl.style.color = PROBABILITY_COLOR[prob];
  probEl.textContent = `${prob} reply chance`;

  header.appendChild(labelEl);
  header.appendChild(probEl);
  card.appendChild(header);

  const variation = angle.variations[0];
  if (variation) {
    const block = document.createElement('div');
    block.className = 'outreach-email-content';

    const headerRow = document.createElement('div');
    headerRow.className = 'outreach-email-header';

    const subjectEl = document.createElement('div');
    subjectEl.className = 'variation-subject';
    subjectEl.textContent = variation.subject;
    headerRow.appendChild(subjectEl);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'variation-copy-btn';
    copyBtn.dataset.subject = variation.subject;
    copyBtn.dataset.body = variation.body;
    copyBtn.dataset.companyName = companyName;
    copyBtn.type = 'button';
    copyBtn.setAttribute('aria-label', 'Copy email');
    copyBtn.dataset.tooltip = 'Copy';
    copyBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2"
           fill="none" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>`;

    headerRow.appendChild(copyBtn);
    block.appendChild(headerRow);
    formatOutreachEmailBody(variation.body, companyName).forEach((paragraph) => {
      const bodyEl = document.createElement('p');
      bodyEl.className = 'variation-body';
      bodyEl.textContent = paragraph;
      block.appendChild(bodyEl);
    });
    card.appendChild(block);
  }

  return card;
}

function renderCardAngles(
  result: OutreachAnglesResult,
  analysis: Analysis,
  container: HTMLElement,
  companyName: string
): void {
  container.innerHTML = '';
  result.angles.forEach((angle) =>
    container.appendChild(buildAngleCard(angle, analysis, result.recommendedAngleId, companyName))
  );
  container.classList.remove('hidden');
}

function showCardLoading(container: HTMLElement): void {
  container.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'outreach-skeleton-card';
    container.appendChild(skeleton);
  }
  container.classList.remove('hidden');
}

function renderCardError(index: number, container: HTMLElement): void {
  container.innerHTML = '';

  const error = document.createElement('div');
  error.className = 'batch-outreach-error';
  error.innerHTML = `<span>Failed to generate emails after multiple attempts.</span>`;
  container.appendChild(error);
  container.classList.remove('hidden');
}

async function generateForResult(index: number, maxAttempts = 3): Promise<boolean> {
  const result = batchState.tempBatchResults[index];
  if (!result) return false;

  result.outreachError = null;

  const meta = {
    title: result.content.title || result.domain,
    url: result.url,
    domain: result.domain,
    evidence: {
      metaDescription: result.content.metaDescription,
      headings: result.content.headings,
      paragraphs: result.content.paragraphs,
    },
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const generated = await generateOutreachAngles(result.analysis as Analysis, meta);
    if (generated) {
      result.outreachAngles = generated;
      result.outreachGeneratedAt = new Date().toISOString();
      result.outreachError = null;
      return true;
    }
  }

  result.outreachError = 'Failed to generate emails.';
  return false;
}

function syncVisibleFooter(index: number): void {
  const footer = findBatchFooter(index);
  const result = batchState.tempBatchResults[index];
  if (!footer || !result) return;

  const btn = footer.querySelector('.batch-generate-emails-btn') as HTMLButtonElement | null;
  const container = footer.querySelector('.batch-outreach-container') as HTMLElement | null;
  if (!container) return;

  if (hasOutreachAngles(result) && result.outreachAngles) {
    const isHidden = container.classList.contains('hidden');
    if (!isHidden) {
      renderCardAngles(
        result.outreachAngles,
        result.analysis as Analysis,
        container,
        getCompanyDisplayName(result.content.title, result.domain)
      );
    }
    setButtonState(btn, isHidden ? 'Show Emails' : 'Hide Emails', false, 'toggle');
    return;
  }

  if (result.outreachError) {
    renderCardError(index, container);
    setButtonState(btn, 'Retry Emails', false, 'retry');
    return;
  }

  container.classList.add('hidden');
  container.innerHTML = '';
  setButtonState(btn, 'Generate Emails', false, 'default');
}

async function runCardGenerate(
  index: number,
  btn: HTMLButtonElement,
  container: HTMLElement
): Promise<void> {
  setButtonState(btn, 'Generating...', true, 'loading');
  showCardLoading(container);

  const success = await generateForResult(index);
  if (!success) {
    renderCardError(index, container);
    setButtonState(btn, 'Retry Emails', false, 'retry');
    return;
  }

  container.classList.remove('hidden');
  syncVisibleFooter(index);
}

export function buildBatchOutreachFooter(res: BatchResult, index: number): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'batch-outreach-footer';
  footer.dataset.batchIndex = index.toString();

  const btn = document.createElement('button');
  btn.className = 'batch-generate-emails-btn';
  setButtonState(btn, 'Generate Emails', false, 'default');

  const container = document.createElement('div');
  container.className = 'batch-outreach-container hidden';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();

    if (hasOutreachAngles(res) && res.outreachAngles) {
      const isHidden = container.classList.contains('hidden');
      if (isHidden) {
        renderCardAngles(
          res.outreachAngles,
          res.analysis as Analysis,
          container,
          getCompanyDisplayName(res.content.title, res.domain)
        );
        setButtonState(btn, 'Hide Emails', false, 'toggle');
      } else {
        container.classList.add('hidden');
        setButtonState(btn, 'Show Emails', false, 'toggle');
      }
      return;
    }

    void runCardGenerate(index, btn, container);
  });

  container.addEventListener('click', (e) => {
    const copyBtn = (e.target as HTMLElement).closest(
      '.variation-copy-btn'
    ) as HTMLButtonElement | null;
    if (copyBtn) onCopyVariationClick(copyBtn);
  });

  footer.appendChild(btn);
  footer.appendChild(container);

  if (hasOutreachAngles(res) && res.outreachAngles) {
    renderCardAngles(
      res.outreachAngles,
      res.analysis as Analysis,
      container,
      getCompanyDisplayName(res.content.title, res.domain)
    );
    setButtonState(btn, 'Hide Emails', false, 'toggle');
  } else if (res.outreachError) {
    renderCardError(index, container);
    setButtonState(btn, 'Retry Emails', false, 'retry');
  }

  return footer;
}

export async function generateEmailsForIndices(
  indices: number[],
  onProgress: (done: number, total: number) => void,
  onDone: (summary: { cancelled: boolean; completed: number; total: number; failed: number }) => void
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
    const container = footer?.querySelector('.batch-outreach-container') as HTMLElement | null;

    if (btn && container) {
      setButtonState(btn, 'Generating...', true, 'loading');
      showCardLoading(container);
    }

    const success = await generateForResult(index);
    if (!success) failed++;
    syncVisibleFooter(index);

    const result = batchState.tempBatchResults[index];
    if (success && result?.outreachAngles && container) {
      container.classList.remove('hidden');
    }

    completed++;
    onProgress(completed, targets.length);

    const isLast = completed >= targets.length;
    if (!cancelGenerateAll && !isLast) {
      await wait(BATCH_OUTREACH_DELAY_MS);
    }
  }

  const cancelled = cancelGenerateAll;
  isGeneratingAll = false;
  cancelGenerateAll = false;
  onDone({ cancelled, completed, total: targets.length, failed });
}

export async function generateEmailsForAll(
  results: BatchResult[],
  onProgress: (done: number, total: number) => void,
  onDone: (summary: { cancelled: boolean; completed: number; total: number; failed: number }) => void
): Promise<void> {
  const indices = results
    .map((result) => batchState.tempBatchResults.indexOf(result))
    .filter((index) => index >= 0);
  await generateEmailsForIndices(indices, onProgress, onDone);
}

export function cancelBatchEmailGeneration(): void {
  cancelGenerateAll = true;
}
