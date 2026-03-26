import { generateFollowUpEmails } from '../../ai-analyze.js';
import { updateCachedOutreach } from '../cache.js';
import { state } from '../state.js';
import { supabase } from '../supabase.js';
import { showToast } from '../toast.js';
import { getRecommendedAngleId } from './types.js';
import {
  renderFollowUpEmails,
  renderFollowUpError,
  renderFollowUpLoading,
} from './followup-render.js';

function getOpeningEmail(): { subject: string; body: string } | null {
  if (!state.outreachAngles?.angles?.length) return null;
  const recommended = state.outreachAngles.angles.find(
    (angle) => angle.id === getRecommendedAngleId(state.outreachAngles)
  );
  const variation = recommended?.variations?.[0];
  return variation ? { subject: variation.subject, body: variation.body } : null;
}

async function persistFollowUpsIfSaved(): Promise<void> {
  const savedId = document.getElementById('saveButton')?.dataset.savedId;
  if (!savedId || !state.outreachAngles || !state.followUpEmails) return;

  const payload = {
    generated_at: new Date().toISOString(),
    recommended_angle_id: state.outreachAngles.recommendedAngleId,
    angles: state.outreachAngles.angles,
    follow_ups: state.followUpEmails,
  };

  const { error } = await supabase
    .from('saved_analyses')
    .update({ outreach_angles: payload })
    .eq('id', savedId);
  if (error) showToast('Follow-ups generated, but failed to sync them to the saved prospect.');
}

async function syncFollowUpsToCache(): Promise<void> {
  const meta = state.lastExtractedMeta;
  if (!meta || !state.outreachAngles || !state.followUpEmails) return;

  await updateCachedOutreach(meta.url, meta.domain, {
    generated_at: new Date().toISOString(),
    recommended_angle_id: state.outreachAngles.recommendedAngleId,
    angles: state.outreachAngles.angles,
    follow_ups: state.followUpEmails,
  });
}

async function runGenerateFollowUps(): Promise<void> {
  const analysis = state.lastAnalysis;
  const meta = state.lastExtractedMeta;
  const evidence = state.lastExtractedEvidence;
  const openingEmail = getOpeningEmail();
  if (!analysis || !meta || !openingEmail) return;

  state.followUpEmailsLoading = true;
  renderFollowUpLoading();

  const result = await generateFollowUpEmails(
    analysis,
    {
      ...meta,
      evidence: evidence
        ? {
            metaDescription: evidence.metaDescription,
            headings: evidence.headings,
            paragraphs: evidence.paragraphs,
          }
        : undefined,
    },
    openingEmail
  );

  state.followUpEmailsLoading = false;
  if (!result?.emails?.length) {
    renderFollowUpError();
    showToast('Failed to generate follow-ups.');
    return;
  }

  state.followUpEmails = result;
  await syncFollowUpsToCache();
  await persistFollowUpsIfSaved();
  renderFollowUpEmails(result);
}

export function onGenerateFollowUpsClick(): void {
  if (state.followUpEmailsLoading) return;
  void runGenerateFollowUps();
}
