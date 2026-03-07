import { IRRELEVANT_DOMAINS } from '../constants.js';
import { loadSettings } from '../settings.js';
import { state } from '../state.js';

export function endAnalysisLoading(): void {
  state.isAnalysisLoading = false;
  const refreshBtn = document.getElementById('refreshButton') as HTMLButtonElement | null;
  if (refreshBtn) {
    refreshBtn.disabled = false;
  }
}

export function highlightText(text: string, query: string): string {
  if (!query || !text) return text;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');

  return text.replace(regex, '<mark>$1</mark>');
}

export function cleanTitle(title = ''): string {
  return title.replace(/^\(\d+\)\s*/, '').trim();
}

export async function shouldAutoAnalyze(url = ''): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.autoReanalysis) return false;

  url = url?.toLowerCase() || '';
  for (const domain of IRRELEVANT_DOMAINS) {
    if (url.includes(domain)) {
      return false;
    }
  }

  return true;
}
