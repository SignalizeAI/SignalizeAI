import { state, type Analysis } from '../state.js';
import { updateAnalysisDashboardButton } from '../dashboard-link.js';
import { endAnalysisLoading } from './utils.js';
import { initAnalysisTabs, setActiveAnalysisTab } from './tabs.js';
import { buildOutreachAngleItems } from './outreach-angle.js';
import { hideOutreachSection, renderOutreachAngles } from '../outreach-messages/render.js';
import { attachOutreachHandlers, resetOutreachState } from '../outreach-messages/handlers.js';
import { normalizeStoredOutreachPayload } from '../outreach-messages/types.js';

type StoredOutreachPayload = Parameters<typeof normalizeStoredOutreachPayload>[0];

interface ShowBlockedOptions {
  allowHomepageFallback?: boolean;
  originalUrl?: string;
}

function renderOutreachAngle(analysis: Analysis): void {
  const outreachAngleEl = document.getElementById('ai-outreach-angle');
  if (!outreachAngleEl) return;

  const items = buildOutreachAngleItems(analysis);
  outreachAngleEl.innerHTML = '';

  if (!items.length) {
    const item = document.createElement('li');
    item.textContent = '—';
    outreachAngleEl.appendChild(item);
    return;
  }

  items.forEach((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    outreachAngleEl.appendChild(item);
  });
}

export function showContentBlocked(message: string, options: ShowBlockedOptions = {}): void {
  endAnalysisLoading();

  const aiCard = document.getElementById('ai-analysis');
  const contentLoading = document.getElementById('ai-loading');
  const contentError = document.getElementById('content-error');
  const saveBtn = document.getElementById('saveButton');

  document.getElementById('ai-data')?.classList.add('hidden');
  if (contentLoading) contentLoading.classList.add('hidden');

  if (contentError) {
    contentError.textContent = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'blocked-message';

    const messageEl = document.createElement('p');
    messageEl.textContent = message;
    wrapper.appendChild(messageEl);

    if (options.allowHomepageFallback) {
      const btn = document.createElement('button');
      btn.id = 'analyze-homepage-btn';
      btn.className = 'primary-btn';
      btn.textContent = 'Generate homepage insights instead';
      wrapper.appendChild(btn);
    }

    contentError.appendChild(wrapper);
    contentError.classList.remove('hidden');
  }

  if (options.allowHomepageFallback) {
    setTimeout(() => {
      const btn = document.getElementById('analyze-homepage-btn');
      if (!btn) return;

      btn.addEventListener('click', async () => {
        const { analyzeSpecificUrl } = await import('./extraction.js');
        const homepageUrl = new URL(options.originalUrl!).origin;
        analyzeSpecificUrl(homepageUrl);
      });
    }, 0);
  }

  if (aiCard) aiCard.classList.add('hidden');
  if (saveBtn) {
    saveBtn.classList.remove('active');
  }
  updateAnalysisDashboardButton(null);

  hideOutreachSection();

  state.lastAnalysis = null;
  state.lastContentHash = null;
  state.lastExtractedMeta = null;
  state.lastExtractedEvidence = null;
  state.lastAnalyzedDomain = null;
  state.forceRefresh = false;
}

export function showIrrelevantDomainView(): void {
  document.getElementById('ai-analysis')?.classList.add('hidden');
  document.getElementById('ai-loading')?.classList.add('hidden');
  const emptyView = document.getElementById('empty-tab-view');
  if (emptyView) {
    const titleEl = emptyView.querySelector('.empty-tab-title');
    const descEl = emptyView.querySelector('.empty-tab-description');
    if (titleEl) titleEl.textContent = 'Search engines & social media excluded';
    if (descEl) {
      descEl.textContent =
        'Prospecting is automatically skipped on search engines and social media to save your credits. Navigate to a business website for sales insights.';
    }
    emptyView.classList.remove('hidden');
  }
}

export function displayAIAnalysis(analysis: Analysis, savedAngles?: StoredOutreachPayload): void {
  endAnalysisLoading();

  const aiCard = document.getElementById('ai-analysis');
  const aiLoading = document.getElementById('ai-loading');
  const aiData = document.getElementById('ai-data');
  const refreshBtn = document.getElementById('refreshButton') as HTMLButtonElement | null;

  if (aiCard) aiCard.classList.remove('hidden');
  if (aiLoading) aiLoading.classList.add('hidden');
  if (aiData) aiData.classList.remove('hidden');
  if (refreshBtn) refreshBtn.disabled = false;
  state.analysisTab = 'strategy';
  initAnalysisTabs();
  setActiveAnalysisTab('strategy');
  updateAnalysisDashboardButton(
    (document.getElementById('saveButton') as HTMLButtonElement | null)?.dataset.savedId || null
  );

  const aiTitleEl = document.getElementById('ai-title-text');
  if (aiTitleEl) {
    aiTitleEl.textContent = state.lastExtractedMeta?.title || '—';
  }

  const aiDescEl = document.getElementById('ai-description-text');
  if (aiDescEl) {
    aiDescEl.textContent = state.lastExtractedMeta?.description || '—';
  }

  const aiUrlEl = document.getElementById('ai-url-text') as HTMLAnchorElement | null;
  if (aiUrlEl) {
    const url = state.lastExtractedMeta?.url || '';
    aiUrlEl.href = url || '#';
    aiUrlEl.textContent = url || '—';
  }

  const whatEl = document.getElementById('ai-what-they-do');
  const targetEl = document.getElementById('ai-target-customer');
  const valueEl = document.getElementById('ai-value-prop');
  const scoreEl = document.getElementById('ai-sales-score');
  const personaEl = document.getElementById('ai-sales-persona');
  const personaReasonEl = document.getElementById('ai-sales-persona-reason');
  const outreachGoalEl = document.getElementById('ai-outreach-goal');

  if (whatEl) whatEl.textContent = analysis.whatTheyDo || '—';
  if (targetEl) targetEl.textContent = analysis.targetCustomer || '—';
  if (valueEl) valueEl.textContent = analysis.valueProposition || '—';
  if (scoreEl) scoreEl.textContent = String(analysis.salesReadinessScore ?? '—');
  if (personaEl) {
    personaEl.textContent = analysis.bestSalesPersona?.persona || 'Mid-Market AE';
  }
  if (personaReasonEl) {
    const reason = analysis.bestSalesPersona?.reason || '';
    personaReasonEl.textContent = reason ? `(${reason})` : '—';
  }
  if (outreachGoalEl) {
    outreachGoalEl.textContent = analysis.recommendedOutreach?.goal || '—';
  }
  renderOutreachAngle(analysis);

  resetOutreachState();
  attachOutreachHandlers();

  const normalizedSaved = normalizeStoredOutreachPayload(savedAngles);
  if (normalizedSaved.followUpEmails) {
    state.followUpEmails = normalizedSaved.followUpEmails;
  }

  if (normalizedSaved.outreachAngles?.angles?.length) {
    state.outreachAngles = normalizedSaved.outreachAngles;
    renderOutreachAngles(normalizedSaved.outreachAngles, analysis);
  }
}
