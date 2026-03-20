type AngleId = 'observation' | 'pain_point' | 'curiosity';

interface VariationLike {
  subject?: string;
  body?: string;
}

interface AngleLike {
  id?: string;
  variations?: VariationLike[];
}

interface OutreachPayloadLike {
  generated_at?: string;
  angles?: AngleLike[];
}

function readPayload(row: Record<string, any>): OutreachPayloadLike | null {
  const payload = row.outreach_angles;
  if (!payload || typeof payload !== 'object') return null;
  return payload as OutreachPayloadLike;
}

function getAngleMap(row: Record<string, any>): Map<string, AngleLike> {
  const payload = readPayload(row);
  const angles = Array.isArray(payload?.angles) ? payload.angles : [];
  return new Map(
    angles
      .filter((angle) => angle && typeof angle === 'object' && typeof angle.id === 'string')
      .map((angle) => [angle.id as string, angle as AngleLike])
  );
}

function readVariation(
  row: Record<string, any>,
  angleId: AngleId,
  index: number,
  field: 'subject' | 'body'
): string {
  const angleMap = getAngleMap(row);
  const angle = angleMap.get(angleId);
  const value = angle?.variations?.[index]?.[field];
  if (typeof value === 'string') return value;

  const flatKey = `${angleId}_${field}_${index + 1}`;
  return typeof row[flatKey] === 'string' ? row[flatKey] : '';
}

export const OUTREACH_EXPORT_HEADERS = [
  'Outreach Generated At',
  'Pain Point Subject 1',
  'Pain Point Body 1',
  'Observation Subject 1',
  'Observation Body 1',
  'Curiosity Subject 1',
  'Curiosity Body 1',
] as const;

export const OUTREACH_EXPORT_COLUMNS = [
  { header: 'Outreach Generated At', key: 'outreach_generated_at', width: 24 },
  { header: 'Pain Point Subject 1', key: 'pain_point_subject_1', width: 28 },
  { header: 'Pain Point Body 1', key: 'pain_point_body_1', width: 42 },
  { header: 'Observation Subject 1', key: 'observation_subject_1', width: 28 },
  { header: 'Observation Body 1', key: 'observation_body_1', width: 42 },
  { header: 'Curiosity Subject 1', key: 'curiosity_subject_1', width: 28 },
  { header: 'Curiosity Body 1', key: 'curiosity_body_1', width: 42 },
] as const;

export function flattenOutreachExportFields(row: Record<string, any>): Record<string, string> {
  const payload = readPayload(row);

  return {
    outreach_generated_at:
      typeof row.outreach_generated_at === 'string'
        ? row.outreach_generated_at
        : payload?.generated_at || '',
    pain_point_subject_1: readVariation(row, 'pain_point', 0, 'subject'),
    pain_point_body_1: readVariation(row, 'pain_point', 0, 'body'),
    observation_subject_1: readVariation(row, 'observation', 0, 'subject'),
    observation_body_1: readVariation(row, 'observation', 0, 'body'),
    curiosity_subject_1: readVariation(row, 'curiosity', 0, 'subject'),
    curiosity_body_1: readVariation(row, 'curiosity', 0, 'body'),
  };
}
