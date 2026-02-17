import { state } from '../state.js';
import { endAnalysisLoading } from './utils.js';

export function showContentBlocked(message, options = {}) {
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
      btn.textContent = 'Analyze homepage instead';
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
        const homepageUrl = new URL(options.originalUrl).origin;
        analyzeSpecificUrl(homepageUrl);
      });
    }, 0);
  }

  if (aiCard) aiCard.classList.add('hidden');
  if (saveBtn) {
    saveBtn.classList.remove('active');
  }

  state.lastAnalysis = null;
  state.lastContentHash = null;
  state.lastExtractedMeta = null;
  state.lastAnalyzedDomain = null;
  state.forceRefresh = false;
}

export function showIrrelevantDomainView() {
  document.getElementById('ai-analysis')?.classList.add('hidden');
  document.getElementById('ai-loading')?.classList.add('hidden');
  const emptyView = document.getElementById('empty-tab-view');
  if (emptyView) {
    const titleEl = emptyView.querySelector('.empty-tab-title');
    const descEl = emptyView.querySelector('.empty-tab-description');
    if (titleEl) titleEl.textContent = 'Search engines & social media excluded';
    if (descEl) {
      descEl.textContent =
        'Analysis is automatically skipped on search engines and social media to save your credits. Navigate to a business website for analysis.';
    }
    emptyView.classList.remove('hidden');
  }
}

export function displayAIAnalysis(analysis) {
  endAnalysisLoading();

  const aiCard = document.getElementById('ai-analysis');
  const aiLoading = document.getElementById('ai-loading');
  const aiData = document.getElementById('ai-data');
  const refreshBtn = document.getElementById('refreshButton');

  if (aiCard) aiCard.classList.remove('hidden');
  if (aiLoading) aiLoading.classList.add('hidden');
  if (aiData) aiData.classList.remove('hidden');
  if (refreshBtn) refreshBtn.disabled = false;

  const aiTitleEl = document.getElementById('ai-title-text');
  if (aiTitleEl) {
    aiTitleEl.textContent = state.lastExtractedMeta?.title || '—';
  }

  const aiDescEl = document.getElementById('ai-description-text');
  if (aiDescEl) {
    aiDescEl.textContent = state.lastExtractedMeta?.description || '—';
  }

  const aiUrlEl = document.getElementById('ai-url-text');
  if (aiUrlEl) {
    const url = state.lastExtractedMeta?.url || '';
    aiUrlEl.href = url || '#';
    aiUrlEl.textContent = url || '—';
  }

  const whatEl = document.getElementById('ai-what-they-do');
  const targetEl = document.getElementById('ai-target-customer');
  const valueEl = document.getElementById('ai-value-prop');
  const salesEl = document.getElementById('ai-sales-angle');
  const scoreEl = document.getElementById('ai-sales-score');
  const personaEl = document.getElementById('ai-sales-persona');
  const personaReasonEl = document.getElementById('ai-sales-persona-reason');
  const outreachPersonaEl = document.getElementById('ai-outreach-persona');
  const outreachGoalEl = document.getElementById('ai-outreach-goal');
  const outreachAngleEl = document.getElementById('ai-outreach-angle');
  const outreachMessageEl = document.getElementById('ai-outreach-message');

  if (whatEl) whatEl.textContent = analysis.whatTheyDo || '—';
  if (targetEl) targetEl.textContent = analysis.targetCustomer || '—';
  if (valueEl) valueEl.textContent = analysis.valueProposition || '—';
  if (salesEl) salesEl.textContent = analysis.salesAngle || '—';
  if (scoreEl) scoreEl.textContent = analysis.salesReadinessScore ?? '—';
  if (personaEl) {
    personaEl.textContent = analysis.bestSalesPersona?.persona || 'Mid-Market AE';
  }
  if (personaReasonEl) {
    const reason = analysis.bestSalesPersona?.reason || '';
    personaReasonEl.textContent = reason ? `(${reason})` : '—';
  }
  if (outreachPersonaEl) {
    outreachPersonaEl.textContent = analysis.recommendedOutreach?.persona || '—';
  }
  if (outreachGoalEl) {
    outreachGoalEl.textContent = analysis.recommendedOutreach?.goal || '—';
  }
  if (outreachAngleEl) {
    outreachAngleEl.textContent = analysis.recommendedOutreach?.angle || '—';
  }
  if (outreachMessageEl) {
    outreachMessageEl.textContent = analysis.recommendedOutreach?.message || '—';
  }
}
