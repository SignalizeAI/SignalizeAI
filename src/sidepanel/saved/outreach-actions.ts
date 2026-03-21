import { generateFollowUpEmails, generateOutreachAngles } from '../../ai-analyze.js';
import { getRecommendedAngleId, normalizeStoredOutreachPayload } from '../outreach-messages/types.js';

type SavedItemLike = {
  id: string;
  title?: string;
  domain?: string;
  url?: string;
  what_they_do?: string;
  target_customer?: string;
  value_proposition?: string;
  sales_angle?: string;
  sales_readiness_score?: number;
  best_sales_persona?: string;
  best_sales_persona_reason?: string;
  recommended_outreach_persona?: string;
  recommended_outreach_goal?: string;
  recommended_outreach_angle?: string;
  recommended_outreach_message?: string;
  outreach_angles?: any;
};

function buildAnalysis(item: SavedItemLike) {
  return {
    whatTheyDo: item.what_they_do || '',
    targetCustomer: item.target_customer || '',
    valueProposition: item.value_proposition || '',
    salesAngle: item.sales_angle || '',
    salesReadinessScore: Number(item.sales_readiness_score ?? 0),
    bestSalesPersona: {
      persona: item.best_sales_persona || 'Mid-Market AE',
      reason: item.best_sales_persona_reason || '',
    },
    recommendedOutreach: {
      persona: item.recommended_outreach_persona || 'SDR',
      goal: item.recommended_outreach_goal || '',
      angle: item.recommended_outreach_angle || '',
      message: item.recommended_outreach_message || '',
    },
  };
}

function buildMeta(item: SavedItemLike) {
  return {
    title: item.title || item.domain || '',
    url: item.url || '',
    domain: item.domain || '',
  };
}

export async function generateSavedOutreachPayload(item: SavedItemLike): Promise<any | null> {
  const result = await generateOutreachAngles(buildAnalysis(item), buildMeta(item));
  if (!result?.angles?.length) return null;

  const { followUpEmails } = normalizeStoredOutreachPayload(item.outreach_angles);
  return {
    generated_at: new Date().toISOString(),
    recommended_angle_id: result.recommendedAngleId,
    angles: result.angles,
    ...(followUpEmails ? { follow_ups: followUpEmails } : {}),
  };
}

export async function generateSavedFollowUpPayload(item: SavedItemLike): Promise<any | null> {
  const { outreachAngles } = normalizeStoredOutreachPayload(item.outreach_angles);
  if (!outreachAngles?.angles?.length) return null;

  const recommended = outreachAngles.angles.find(
    (angle) => angle.id === getRecommendedAngleId(outreachAngles)
  );
  const openingEmail = recommended?.variations?.[0];
  if (!openingEmail?.subject || !openingEmail?.body) return null;

  const result = await generateFollowUpEmails(buildAnalysis(item), buildMeta(item), openingEmail);
  if (!result?.emails?.length) return null;

  return {
    generated_at: new Date().toISOString(),
    recommended_angle_id: outreachAngles.recommendedAngleId,
    angles: outreachAngles.angles,
    follow_ups: result,
  };
}
