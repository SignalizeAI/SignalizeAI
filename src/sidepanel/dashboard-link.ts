import { supabase } from './supabase.js';
import { WEBSITE_BASE_URL } from '../config.js';
import { state } from './state.js';
import { buildPersistedOutreachAngle } from './analysis/outreach-angle.js';

export function buildProspectDashboardUrl(savedId: string): string {
  return `${WEBSITE_BASE_URL}/prospect/${savedId}`;
}

function buildDraftPreviewPath(): string | null {
  if (!state.lastAnalysis || !state.lastExtractedMeta) return null;

  const draft = {
    title: state.lastExtractedMeta.title,
    domain: state.lastExtractedMeta.domain,
    url: state.lastExtractedMeta.url,
    description: state.lastExtractedMeta.description,
    sales_readiness_score: state.lastAnalysis.salesReadinessScore,
    what_they_do: state.lastAnalysis.whatTheyDo,
    target_customer: state.lastAnalysis.targetCustomer,
    value_proposition: state.lastAnalysis.valueProposition,
    best_sales_persona: state.lastAnalysis.bestSalesPersona?.persona,
    best_sales_persona_reason: state.lastAnalysis.bestSalesPersona?.reason,
    recommended_outreach_goal: state.lastAnalysis.recommendedOutreach?.goal,
    recommended_outreach_angle: buildPersistedOutreachAngle(state.lastAnalysis),
    ...(state.outreachAngles?.angles?.length
      ? {
          outreach_angles: {
            generated_at: new Date().toISOString(),
            recommended_angle_id: state.outreachAngles.recommendedAngleId,
            angles: state.outreachAngles.angles,
            ...(state.followUpEmails?.emails?.length ? { follow_ups: state.followUpEmails } : {}),
          },
        }
      : {}),
  };

  return `/prospect/preview?draft=${encodeURIComponent(JSON.stringify(draft))}`;
}

async function buildSessionHandoffUrl(nextPath: string): Promise<string> {
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
  const url = await buildSessionHandoffUrl(`/prospect/${savedId}`);
  chrome.tabs.create({ url });
}

export async function openCurrentAnalysisInWebsite(): Promise<void> {
  const nextPath = buildDraftPreviewPath();
  if (!nextPath) return;
  const url = await buildSessionHandoffUrl(nextPath);
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

    await openCurrentAnalysisInWebsite();
  });

  button.dataset.bound = 'true';
}
