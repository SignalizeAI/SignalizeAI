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

export function isIrrelevantDomain(rawUrl = ''): boolean {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  return IRRELEVANT_DOMAINS.some((entry) => {
    const normalized = entry.toLowerCase();
    if (normalized.endsWith('.')) {
      // Trailing-dot entries are intentional prefixes: google. matches
      // google.com, google.co.uk, google.de, and so on.
      return hostname.startsWith(normalized);
    }
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

export async function shouldAutoAnalyze(url = ''): Promise<boolean> {
  const settings = await loadSettings();
  if (!settings.autoReanalysis) return false;

  return !isIrrelevantDomain(url);
}
