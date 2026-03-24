import { supabase } from './supabase.js';
import { WEBSITE_BASE_URL } from '../config.js';
import { state } from './state.js';
import { ensureCurrentAnalysisSaved } from './save-analysis.js';

export function buildProspectDashboardUrl(savedId: string): string {
  return `${WEBSITE_BASE_URL}/prospect/${savedId}`;
}

async function buildSessionHandoffUrl(savedId: string): Promise<string> {
  const nextPath = `/prospect/${savedId}`;
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token || !session?.refresh_token) {
    return `${WEBSITE_BASE_URL}/signin`;
  }

  const callbackUrl = new URL('/auth/callback', WEBSITE_BASE_URL);
  callbackUrl.searchParams.set('next', nextPath);
  callbackUrl.hash = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }).toString();
  return callbackUrl.toString();
}

export async function openDashboardForSavedId(savedId: string): Promise<void> {
  if (!savedId) return;
  const url = await buildSessionHandoffUrl(savedId);
  chrome.tabs.create({ url });
}

export function updateAnalysisDashboardButton(savedId?: string | null): void {
  const button = document.getElementById('open-dashboard-btn') as HTMLButtonElement | null;
  if (!button) return;

  if (savedId) {
    button.dataset.savedId = savedId;
    button.classList.remove('hidden');
    return;
  }

  delete button.dataset.savedId;
  const canOpenUnsaved = Boolean(state.lastAnalysis && state.lastExtractedMeta);
  button.classList.toggle('hidden', !canOpenUnsaved);
}

export function attachAnalysisDashboardHandler(): void {
  const button = document.getElementById('open-dashboard-btn') as HTMLButtonElement | null;
  if (!button || button.dataset.bound === 'true') return;

  button.addEventListener('click', async () => {
    const savedId = button.dataset.savedId;
    if (savedId) {
      void openDashboardForSavedId(savedId);
      return;
    }

    const ensuredId = await ensureCurrentAnalysisSaved();
    if (ensuredId) {
      await openDashboardForSavedId(ensuredId);
    }
  });

  button.dataset.bound = 'true';
}
