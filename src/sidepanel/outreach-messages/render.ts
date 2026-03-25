/**
 * DOM rendering for the Suggested Outreach Messages section.
 */

import {
  type OutreachAngle,
  type OutreachAnglesResult,
  type ReplyProbability,
  getRecommendedAngleId,
  PROBABILITY_COLOR,
} from './types.js';
import { state, type Analysis } from '../state.js';
import {
  formatOutreachEmailBody,
  getCompanyDisplayName,
  getOutreachReplyProbability,
} from './format.js';
import { syncFollowUpUi } from './followup-render.js';

function syncOutreachTabHint(): void {
  const hint = document.getElementById('outreach-tab-hint');
  if (!hint) return;
  if (state.followUpEmails?.emails?.length) {
    hint.classList.add('hidden');
    return;
  }

  if (state.outreachAngles?.angles?.length) {
    hint.textContent = 'Go below and click on Generate follow-ups to build the next-touch emails.';
    hint.classList.remove('hidden');
    return;
  }

  if (state.outreachAnglesLoading) {
    hint.classList.add('hidden');
    return;
  }

  hint.textContent = 'Generate outreach emails here and we’ll keep the full email set in this tab.';
  hint.classList.remove('hidden');
}

function setToggleButtonState(
  label: string,
  disabled = false,
  modifier: 'suggest' | 'show' | 'hide' = 'suggest'
): void {
  const btn = document.getElementById('generate-outreach-btn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = disabled;
  btn.dataset.mode = modifier;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor"
         stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
    ${label}`;
}

function getCollapsedToggleLabel(): string {
  return state.followUpEmails?.emails?.length ? 'Show Emails' : 'Show Outreach Emails';
}

function getExpandedToggleLabel(): string {
  return state.followUpEmails?.emails?.length ? 'Hide Emails' : 'Hide Outreach Emails';
}

export function refreshOutreachUiState(): void {
  syncOutreachTabHint();
  refreshOutreachToggleState();
}

export function refreshOutreachToggleState(): void {
  const btn = document.getElementById('generate-outreach-btn') as HTMLButtonElement | null;
  const section = document.getElementById('outreach-messages-section');
  if (!btn) return;
  if (section && !section.classList.contains('hidden')) {
    setToggleButtonState(getExpandedToggleLabel(), false, 'hide');
    return;
  }
  if (state.outreachAngles?.angles?.length) {
    setToggleButtonState(getCollapsedToggleLabel(), false, 'show');
    return;
  }
  setToggleButtonState('Suggest Outreach Emails');
}

function getPrimaryVariation(angle: OutreachAngle): { subject: string; body: string } {
  return angle.variations[0] || { subject: '', body: '' };
}

function buildReplyBadge(probability: ReplyProbability): HTMLElement {
  const badge = document.createElement('span');
  badge.className = `reply-probability reply-probability--${probability.toLowerCase()}`;
  badge.style.color = PROBABILITY_COLOR[probability];
  badge.textContent = `${probability} reply chance`;
  return badge;
}

function buildCopyButton(subject: string, body: string, companyName: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'variation-copy-btn';
  btn.dataset.subject = subject;
  btn.dataset.body = body;
  btn.dataset.companyName = companyName;
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Copy email');
  btn.dataset.tooltip = 'Copy';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor"
         stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>`;
  return btn;
}

function buildProbabilityBadge(
  angleId: OutreachAngle['id'],
  recommendedAngleId: OutreachAngle['id'],
  analysis: Analysis
): HTMLElement {
  return buildReplyBadge(
    getOutreachReplyProbability(
      angleId,
      recommendedAngleId,
      analysis.salesReadinessScore,
      analysis.bestSalesPersona?.persona || ''
    )
  );
}

function getCurrentCompanyName(): string {
  return getCompanyDisplayName(state.lastExtractedMeta?.title, state.lastExtractedMeta?.domain);
}

export function showOutreachSection(): void {
  document.getElementById('outreach-messages-section')?.classList.remove('hidden');
  document.getElementById('outreach-messages-list')?.classList.remove('hidden');
  refreshOutreachUiState();
  syncFollowUpUi();
}

export function hideOutreachSection(): void {
  const section = document.getElementById('outreach-messages-section');
  if (!section) return;
  section.classList.add('hidden');
  document.getElementById('outreach-messages-list')?.classList.add('hidden');
  refreshOutreachUiState();
}

export function resetToCtaState(): void {
  document.getElementById('outreach-messages-loading')?.classList.add('hidden');
  document.getElementById('outreach-messages-list')?.classList.add('hidden');
  document.getElementById('outreach-messages-section')?.classList.add('hidden');
  refreshOutreachUiState();
  syncFollowUpUi();
}

export function renderOutreachLoading(): void {
  document.getElementById('outreach-messages-list')?.classList.add('hidden');

  const loadingEl = document.getElementById('outreach-messages-loading');
  if (!loadingEl) return;

  loadingEl.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const card = document.createElement('div');
    card.className = 'outreach-skeleton-card';
    loadingEl.appendChild(card);
  }

  document.getElementById('outreach-messages-section')?.classList.remove('hidden');
  refreshOutreachUiState();
  loadingEl.classList.remove('hidden');
  setToggleButtonState('Generating Outreach Emails...', true);
}

export function renderOutreachError(onRetry: () => void): void {
  document.getElementById('outreach-messages-loading')?.classList.add('hidden');

  const listEl = document.getElementById('outreach-messages-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  const err = document.createElement('div');
  err.className = 'outreach-error-state';
  err.innerHTML = `<span>Failed to generate emails.</span>`;

  const retryBtn = document.createElement('button');
  retryBtn.className = 'outreach-retry-btn';
  retryBtn.textContent = 'Try again';
  retryBtn.addEventListener('click', onRetry);

  err.appendChild(retryBtn);
  listEl.appendChild(err);
  listEl.classList.remove('hidden');
  document.getElementById('outreach-messages-section')?.classList.remove('hidden');
  refreshOutreachUiState();
}

export function renderOutreachAngles(result: OutreachAnglesResult, analysis: Analysis): void {
  document.getElementById('outreach-messages-loading')?.classList.add('hidden');

  const listEl = document.getElementById('outreach-messages-list');
  if (!listEl) return;

  const recommendedAngleId = getRecommendedAngleId(result);
  const recommendedAngle =
    result.angles.find((angle) => angle.id === recommendedAngleId) || result.angles[0];

  listEl.innerHTML = '';
  if (recommendedAngle) {
    listEl.appendChild(buildRecommendedSection(recommendedAngle, analysis));
  }
  listEl.appendChild(buildApproachesSection(result.angles, analysis, recommendedAngleId));

  listEl.classList.remove('hidden');
  document.getElementById('outreach-messages-section')?.classList.remove('hidden');
  refreshOutreachUiState();
  syncFollowUpUi();
}

export function showExistingOutreachAngles(): void {
  document.getElementById('outreach-messages-section')?.classList.remove('hidden');
  document.getElementById('outreach-messages-loading')?.classList.add('hidden');
  document.getElementById('outreach-messages-list')?.classList.remove('hidden');
  if (state.followUpEmails?.emails?.length) {
    document.getElementById('follow-up-section')?.classList.remove('hidden');
  }
  refreshOutreachUiState();
  syncFollowUpUi();
}

export function collapseOutreachAngles(): void {
  document.getElementById('outreach-messages-section')?.classList.add('hidden');
  document.getElementById('outreach-messages-list')?.classList.add('hidden');
  document.getElementById('outreach-messages-loading')?.classList.add('hidden');
  document.getElementById('follow-up-section')?.classList.add('hidden');
  if (!state.followUpEmails?.emails?.length && state.outreachAngles?.angles?.length) {
    document.getElementById('follow-up-actions')?.classList.remove('hidden');
  } else {
    document.getElementById('follow-up-actions')?.classList.add('hidden');
  }
  refreshOutreachUiState();
}

function buildRecommendedSection(angle: OutreachAngle, analysis: Analysis): HTMLElement {
  const section = document.createElement('section');
  section.className = 'outreach-recommended-section';

  const card = document.createElement('div');
  card.className = 'outreach-recommended-card';

  const head = document.createElement('div');
  head.className = 'outreach-recommended-head';

  const kicker = document.createElement('div');
  kicker.className = 'outreach-recommended-kicker';
  kicker.textContent = '★ Recommended';
  head.appendChild(kicker);
  head.appendChild(buildProbabilityBadge(angle.id, angle.id, analysis));

  const variation = getPrimaryVariation(angle);
  card.appendChild(head);
  card.appendChild(buildEmailContent(variation.subject, variation.body, getCurrentCompanyName()));

  section.appendChild(card);
  return section;
}

function buildApproachesSection(
  angles: OutreachAngle[],
  analysis: Analysis,
  recommendedAngleId: string
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'outreach-other-section';

  const list = document.createElement('div');
  list.className = 'outreach-other-list';
  angles
    .filter((angle) => angle.id !== recommendedAngleId)
    .forEach((angle) => list.appendChild(buildApproachCard(angle, analysis, recommendedAngleId)));

  section.appendChild(list);
  return section;
}

function buildApproachCard(
  angle: OutreachAngle,
  analysis: Analysis,
  recommendedAngleId: string
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'outreach-angle-card';
  card.dataset.angleId = angle.id;

  const header = document.createElement('div');
  header.className = 'outreach-angle-header';

  const labelEl = document.createElement('span');
  labelEl.className = 'outreach-angle-label';
  labelEl.textContent = angle.label;

  header.appendChild(labelEl);
  header.appendChild(
    buildProbabilityBadge(angle.id, recommendedAngleId as OutreachAngle['id'], analysis)
  );
  card.appendChild(header);

  const variation = getPrimaryVariation(angle);
  card.appendChild(buildEmailContent(variation.subject, variation.body, getCurrentCompanyName()));
  return card;
}

function buildEmailContent(subject: string, body: string, companyName: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'outreach-email-content';

  const header = document.createElement('div');
  header.className = 'outreach-email-header';

  const subjectEl = document.createElement('div');
  subjectEl.className = 'variation-subject';
  subjectEl.textContent = subject;

  header.appendChild(subjectEl);
  header.appendChild(buildCopyButton(subject, body, companyName));
  wrap.appendChild(header);

  formatOutreachEmailBody(body, companyName).forEach((paragraph) => {
    const bodyEl = document.createElement('p');
    bodyEl.className = 'variation-body';
    bodyEl.textContent = paragraph;
    wrap.appendChild(bodyEl);
  });

  return wrap;
}
