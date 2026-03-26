interface VariationLike {
  subject?: string;
  body?: string;
}

interface AngleLike {
  id?: string;
  label?: string;
  variations?: VariationLike[];
}

interface FollowUpLike {
  label?: string;
  subject?: string;
  body?: string;
}

interface OutreachPayloadLike {
  generated_at?: string;
  recommended_angle_id?: string;
  angles?: AngleLike[];
  follow_ups?: {
    emails?: FollowUpLike[];
  };
}

function readPayload(row: Record<string, any>): OutreachPayloadLike | null {
  const payload = row.outreach_angles;
  if (!payload || typeof payload !== 'object') return null;
  return payload as OutreachPayloadLike;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getRecommendedAngle(payload: OutreachPayloadLike | null): AngleLike | null {
  const angles = Array.isArray(payload?.angles) ? payload.angles : [];
  if (!angles.length) return null;
  return (
    angles.find((angle) => angle?.id && angle.id === payload?.recommended_angle_id) || angles[0]
  );
}

function getSecondaryAngles(
  payload: OutreachPayloadLike | null,
  recommendedId?: string
): AngleLike[] {
  const angles = Array.isArray(payload?.angles) ? payload.angles : [];
  return angles.filter((angle) => angle?.id !== recommendedId);
}

function getPrimaryVariation(angle: AngleLike | null): VariationLike {
  return angle?.variations?.[0] || {};
}

function getAngleLabel(angle: AngleLike | null, fallback: string): string {
  return normalizeText(angle?.label) || fallback;
}

function getFollowUps(payload: OutreachPayloadLike | null): FollowUpLike[] {
  return Array.isArray(payload?.follow_ups?.emails) ? payload.follow_ups?.emails : [];
}

export const OUTREACH_EXPORT_HEADERS = [
  'Outreach Generated At',
  'Recommended Label',
  'Recommended Subject',
  'Recommended Body',
  'Email 2 Label',
  'Email 2 Subject',
  'Email 2 Body',
  'Email 3 Label',
  'Email 3 Subject',
  'Email 3 Body',
  'Follow-Up 1 Label',
  'Follow-Up 1 Subject',
  'Follow-Up 1 Body',
  'Follow-Up 2 Label',
  'Follow-Up 2 Subject',
  'Follow-Up 2 Body',
  'Follow-Up 3 Label',
  'Follow-Up 3 Subject',
  'Follow-Up 3 Body',
] as const;

export const OUTREACH_EXPORT_COLUMNS = [
  { header: 'Outreach Generated At', key: 'outreach_generated_at', width: 24 },
  { header: 'Recommended Label', key: 'recommended_email_label', width: 24 },
  { header: 'Recommended Subject', key: 'recommended_email_subject', width: 32 },
  { header: 'Recommended Body', key: 'recommended_email_body', width: 46 },
  { header: 'Email 2 Label', key: 'secondary_email_1_label', width: 22 },
  { header: 'Email 2 Subject', key: 'secondary_email_1_subject', width: 32 },
  { header: 'Email 2 Body', key: 'secondary_email_1_body', width: 46 },
  { header: 'Email 3 Label', key: 'secondary_email_2_label', width: 22 },
  { header: 'Email 3 Subject', key: 'secondary_email_2_subject', width: 32 },
  { header: 'Email 3 Body', key: 'secondary_email_2_body', width: 46 },
  { header: 'Follow-Up 1 Label', key: 'follow_up_1_label', width: 22 },
  { header: 'Follow-Up 1 Subject', key: 'follow_up_1_subject', width: 32 },
  { header: 'Follow-Up 1 Body', key: 'follow_up_1_body', width: 46 },
  { header: 'Follow-Up 2 Label', key: 'follow_up_2_label', width: 22 },
  { header: 'Follow-Up 2 Subject', key: 'follow_up_2_subject', width: 32 },
  { header: 'Follow-Up 2 Body', key: 'follow_up_2_body', width: 46 },
  { header: 'Follow-Up 3 Label', key: 'follow_up_3_label', width: 22 },
  { header: 'Follow-Up 3 Subject', key: 'follow_up_3_subject', width: 32 },
  { header: 'Follow-Up 3 Body', key: 'follow_up_3_body', width: 46 },
] as const;

export function flattenOutreachExportFields(row: Record<string, any>): Record<string, string> {
  const payload = readPayload(row);
  const recommended = getRecommendedAngle(payload);
  const secondaryAngles = getSecondaryAngles(payload, recommended?.id);
  const secondaryOne = secondaryAngles[0] || null;
  const secondaryTwo = secondaryAngles[1] || null;
  const followUps = getFollowUps(payload);
  const followUpOne = followUps[0] || null;
  const followUpTwo = followUps[1] || null;
  const followUpThree = followUps[2] || null;

  return {
    outreach_generated_at:
      typeof row.outreach_generated_at === 'string'
        ? row.outreach_generated_at
        : normalizeText(payload?.generated_at),
    recommended_email_label: getAngleLabel(recommended, 'Recommended'),
    recommended_email_subject: normalizeText(getPrimaryVariation(recommended).subject),
    recommended_email_body: normalizeText(getPrimaryVariation(recommended).body),
    secondary_email_1_label: getAngleLabel(secondaryOne, ''),
    secondary_email_1_subject: normalizeText(getPrimaryVariation(secondaryOne).subject),
    secondary_email_1_body: normalizeText(getPrimaryVariation(secondaryOne).body),
    secondary_email_2_label: getAngleLabel(secondaryTwo, ''),
    secondary_email_2_subject: normalizeText(getPrimaryVariation(secondaryTwo).subject),
    secondary_email_2_body: normalizeText(getPrimaryVariation(secondaryTwo).body),
    follow_up_1_label: normalizeText(followUpOne?.label),
    follow_up_1_subject: normalizeText(followUpOne?.subject),
    follow_up_1_body: normalizeText(followUpOne?.body),
    follow_up_2_label: normalizeText(followUpTwo?.label),
    follow_up_2_subject: normalizeText(followUpTwo?.subject),
    follow_up_2_body: normalizeText(followUpTwo?.body),
    follow_up_3_label: normalizeText(followUpThree?.label),
    follow_up_3_subject: normalizeText(followUpThree?.subject),
    follow_up_3_body: normalizeText(followUpThree?.body),
  };
}
