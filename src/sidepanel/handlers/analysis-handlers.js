import { extractWebsiteContent } from '../analysis.js';
import { state } from '../state.js';
import { navigateTo } from '../ui.js';

export function setupAnalysisHandlers() {
  document.getElementById('start-analysis-btn')?.addEventListener('click', () => {
    navigateTo('analysis');
  });

  const refreshBtn = document.getElementById('refreshButton');

  if (refreshBtn) {
    refreshBtn.disabled = true;
  }

  refreshBtn?.addEventListener('click', async () => {
    if (state.currentView !== 'analysis') return;
    if (!state.lastExtractedMeta || refreshBtn.disabled) return;

    refreshBtn.disabled = true;
    state.forceRefresh = true;

    document.getElementById('ai-analysis')?.classList.remove('hidden');
    document.getElementById('content-error')?.classList.add('hidden');
    document.getElementById('ai-data')?.classList.add('hidden');
    document.getElementById('ai-loading')?.classList.remove('hidden');

    try {
      await extractWebsiteContent();
    } finally {
      state.forceRefresh = false;
      refreshBtn.disabled = false;
    }
  });
}
