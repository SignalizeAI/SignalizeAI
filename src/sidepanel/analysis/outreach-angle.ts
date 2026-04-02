import type { Analysis } from '../state.js';

const SALES_ANGLE_SKIP_PATTERNS = [
  /limited context/i,
  /discovery questions/i,
  /verify fit manually/i,
  /ai service/i,
  /\bself-serve\b/i,
  /\bproduct-led\b/i,
  /\bplg\b/i,
  /\bfounder-led\b/i,
  /\bsales-led\b/i,
  /\bbuying style\b/i,
];

function normalizeLines(value: string): string[] {
  return value
    .trim()
    .replace(/\s+-\s+/g, '\n- ')
    .replace(/\s+[•*]\s+/g, '\n- ')
    .replace(
      /,\s+(?=(?:Focus|Lead|Position|Tie|Frame|Keep|Show|Use|Align|Target|Pitch)\b)/g,
      '\n- '
    )
    .replace(/\s+(?=(?:Focus|Lead|Position|Tie|Frame|Keep|Show|Use|Align|Target|Pitch)\b)/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .split(/\r?\n+/)
    .flatMap((line) =>
      line.split(/\s*(?:[;|]|\.\s+(?=[A-Z]))\s*/g).map((part) =>
        part
          .replace(/^[-*•]\s*/, '')
          .replace(/\s+/g, ' ')
          .trim()
      )
    )
    .filter(Boolean);
}

export function splitPersistedOutreachAngle(value: string): string[] {
  return normalizeLines(value).slice(0, 6);
}

export function buildOutreachAngleItems(analysis: Analysis): string[] {
  const bulletLines = normalizeLines(analysis.recommendedOutreach?.angle || '');
  const salesAngleLines = normalizeLines(analysis.salesAngle || '');

  salesAngleLines.forEach((line) => {
    if (bulletLines.length >= 4) return;
    if (SALES_ANGLE_SKIP_PATTERNS.some((pattern) => pattern.test(line))) return;

    const hasMatchingLine = bulletLines.some(
      (existingLine) => existingLine.toLowerCase() === line.toLowerCase()
    );
    if (!hasMatchingLine && bulletLines.length < 6) {
      bulletLines.push(line);
    }
  });

  return bulletLines.slice(0, 6);
}

export function buildPersistedOutreachAngle(analysis: Analysis): string {
  const items = buildOutreachAngleItems(analysis);
  if (!items.length) return '';
  return items.map((item) => `- ${item}`).join('\n');
}
