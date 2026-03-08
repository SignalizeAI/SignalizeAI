import { extractWebsiteContent } from '../analysis/index.js';
import { state } from '../state.js';
import { navigateTo } from '../ui.js';

export function setupAnalysisHandlers(): void {
  document.getElementById('start-analysis-btn')?.addEventListener('click', () => {
    navigateTo('analysis');
  });

  const refreshBtn = document.getElementById('refreshButton') as HTMLButtonElement | null;

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

  const manualUrlInput = document.getElementById('manual-url-input') as HTMLInputElement | null;
  const manualUrlBtn = document.getElementById('manual-url-btn') as HTMLButtonElement | null;

  manualUrlBtn?.addEventListener('click', async () => {
    if (state.currentView !== 'analysis') return;

    const urlValue = manualUrlInput?.value.trim();
    if (!urlValue) {
      // If empty, just do standard analysis
      if (refreshBtn && !refreshBtn.disabled) {
        refreshBtn.click();
      }
      return;
    }

    // Validate URL format (must contain a dot and no spaces)
    if (!urlValue.includes('.') || urlValue.includes(' ')) {
      const { showErrorToast } = await import('../toast.js');
      showErrorToast('No valid URL(s) found');
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlValue.startsWith('http') ? urlValue : `https://${urlValue}`);
    } catch {
      const { showErrorToast } = await import('../toast.js');
      showErrorToast('No valid URL(s) found');
      return;
    }

    if (manualUrlBtn) manualUrlBtn.disabled = true;
    try {
      const { analyzeSpecificUrl } = await import('../analysis/extraction.js');
      await analyzeSpecificUrl(parsedUrl.href);
    } finally {
      if (manualUrlBtn) manualUrlBtn.disabled = false;
    }
  });

  manualUrlInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      manualUrlBtn?.click();
    }
  });
}
