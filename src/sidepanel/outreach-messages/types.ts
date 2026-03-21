/**
 * Shared types and client-side reply probability logic for outreach messages.
 */

export type AngleId = 'observation' | 'pain_point' | 'curiosity';
const ANGLE_IDS: AngleId[] = ['observation', 'pain_point', 'curiosity'];

export interface OutreachVariation {
  subject: string;
  body: string;
}

export interface OutreachAngle {
  id: AngleId;
  label: string;
  rationale: string;
  variations: OutreachVariation[];
}

export interface OutreachAnglesResult {
  recommendedAngleId: AngleId;
  angles: OutreachAngle[];
}

export type FollowUpTone = 'reminder' | 'value_add' | 'breakup';

export interface FollowUpEmail {
  id: FollowUpTone;
  label: string;
  subject: string;
  body: string;
}

export interface FollowUpEmailsResult {
  emails: FollowUpEmail[];
}

type StoredOutreachPayload = Partial<OutreachAnglesResult> & {
  recommended_angle_id?: AngleId;
  follow_ups?: Partial<FollowUpEmailsResult> | null;
};

export type ReplyProbability = 'High' | 'Medium' | 'Low';

/**
 * Compute reply probability client-side from existing analysis data.
 * No extra AI call needed — derived from salesReadinessScore and persona.
 */
export function computeReplyProbability(
  angleId: AngleId,
  score: number,
  _salesPersona: string
): ReplyProbability {
  if (angleId === 'observation') return 'High';
  if (angleId === 'pain_point') return score >= 60 ? 'High' : 'Medium';
  if (angleId === 'curiosity') return score < 50 ? 'High' : 'Medium';
  return 'Medium';
}

export function getRecommendedAngleId(result: OutreachAnglesResult): AngleId {
  const availableIds = new Set(result.angles.map((angle) => angle.id));
  if (availableIds.has(result.recommendedAngleId)) {
    return result.recommendedAngleId;
  }
  if (availableIds.has('observation')) return 'observation';
  if (availableIds.has('pain_point')) return 'pain_point';
  return 'curiosity';
}

export const PROBABILITY_COLOR: Record<ReplyProbability, string> = {
  High: 'var(--reply-prob-high, #22c55e)',
  Medium: 'var(--reply-prob-medium, #f59e0b)',
  Low: 'var(--reply-prob-low, #ef4444)',
};

export function normalizeStoredOutreachPayload(payload: StoredOutreachPayload | null | undefined): {
  outreachAngles: OutreachAnglesResult | null;
  followUpEmails: FollowUpEmailsResult | null;
} {
  const angles = Array.isArray(payload?.angles) ? payload.angles : [];
  const storedRecommendedAngleId = payload?.recommendedAngleId || payload?.recommended_angle_id;
  const outreachAngles =
    angles.length > 0
      ? {
          recommendedAngleId: ANGLE_IDS.includes(storedRecommendedAngleId as AngleId)
            ? (storedRecommendedAngleId as AngleId)
            : 'observation',
          angles,
        }
      : null;

  const rawEmails = Array.isArray(payload?.follow_ups?.emails) ? payload?.follow_ups?.emails : [];
  const followUpEmails =
    rawEmails.length > 0
      ? {
          emails: rawEmails
            .map((email) => ({
              id: email?.id,
              label: email?.label,
              subject: email?.subject,
              body: email?.body,
            }))
            .filter(
              (email): email is FollowUpEmail =>
                typeof email.id === 'string' &&
                typeof email.label === 'string' &&
                typeof email.subject === 'string' &&
                typeof email.body === 'string'
            ),
        }
      : null;

  return { outreachAngles, followUpEmails };
}
