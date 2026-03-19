/**
 * Event handlers for Suggested Outreach Messages: generate and copy.
 */

import { state } from '../state.js';
import { supabase } from '../supabase.js';
import { showToast } from '../toast.js';
import { generateOutreachAngles } from '../../ai-analyze.js';
import { formatOutreachEmailBody } from './format.js';
import {
  collapseOutreachAngles,
  renderOutreachAngles,
  renderOutreachError,
  renderOutreachLoading,
  resetToCtaState,
  showExistingOutreachAngles,
} from './render.js';

let handlersAttached = false;
const copyResetTimers = new WeakMap<HTMLButtonElement, number>();
const COPY_ICON = `
  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor"
       stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>`;
const CHECK_ICON = `
  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor"
       stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>`;

function showCopySuccess(btn: HTMLButtonElement): void {
  const existingTimer = copyResetTimers.get(btn);
  if (existingTimer) window.clearTimeout(existingTimer);

  btn.classList.add('is-copied');
  btn.dataset.tooltip = 'Copied';
  btn.innerHTML = CHECK_ICON;

  const resetTimer = window.setTimeout(() => {
    btn.classList.remove('is-copied');
    btn.dataset.tooltip = 'Copy';
    btn.innerHTML = COPY_ICON;
    copyResetTimers.delete(btn);
  }, 1400);

  copyResetTimers.set(btn, resetTimer);
}

async function persistOutreachAnglesIfSaved(): Promise<void> {
  const savedId = document.getElementById('saveButton')?.dataset.savedId;
  if (!savedId || !state.outreachAngles) return;

  const payload = {
    generated_at: new Date().toISOString(),
    recommended_angle_id: state.outreachAngles.recommendedAngleId,
    angles: state.outreachAngles.angles,
  };

  const { error } = await supabase
    .from('saved_analyses')
    .update({ outreach_angles: payload })
    .eq('id', savedId);

  if (error) {
    showToast('Emails generated, but failed to sync them to the saved prospect.');
  }
}

async function runGenerate(): Promise<void> {
  const analysis = state.lastAnalysis;
  const meta = state.lastExtractedMeta;
  const evidence = state.lastExtractedEvidence;
  if (!analysis || !meta) return;

  state.outreachAnglesLoading = true;
  renderOutreachLoading();

  const result = await generateOutreachAngles(analysis, {
    ...meta,
    evidence: evidence
      ? {
          metaDescription: evidence.metaDescription,
          headings: evidence.headings,
          paragraphs: evidence.paragraphs,
        }
      : undefined,
  });

  state.outreachAnglesLoading = false;

  if (!result) {
    renderOutreachError(runGenerate);
    return;
  }

  state.outreachAngles = result;
  await persistOutreachAnglesIfSaved();
  renderOutreachAngles(result, analysis);
}

export function onGenerateClick(): void {
  if (state.outreachAnglesLoading) return;

  if (state.outreachAngles?.angles?.length) {
    const section = document.getElementById('outreach-messages-section');
    if (section?.classList.contains('hidden')) {
      showExistingOutreachAngles();
    } else {
      collapseOutreachAngles();
    }
    return;
  }

  void runGenerate();
}

export function onCopyVariationClick(btn: HTMLButtonElement): void {
  const subject = btn.dataset.subject || '';
  const body = btn.dataset.body || '';
  const companyName = btn.dataset.companyName || '';
  if (!subject && !body) return;
  const formattedBody = formatOutreachEmailBody(body, companyName).join('\n\n');
  const text = subject ? `Subject: ${subject}\n\n${formattedBody}` : formattedBody;
  void navigator.clipboard
    .writeText(text)
    .then(() => {
      showCopySuccess(btn);
    })
    .catch(() => {
      showToast('Failed to copy email.');
    });
}

export function attachOutreachHandlers(): void {
  if (handlersAttached) return;

  document.getElementById('generate-outreach-btn')?.addEventListener('click', onGenerateClick);

  // Copy buttons are created dynamically — use event delegation on the list container
  document.getElementById('outreach-messages-list')?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest(
      '.variation-copy-btn'
    ) as HTMLButtonElement | null;
    if (btn) onCopyVariationClick(btn);
  });

  handlersAttached = true;
}

export function resetOutreachState(): void {
  state.outreachAngles = null;
  state.outreachAnglesLoading = false;
  resetToCtaState();
}
