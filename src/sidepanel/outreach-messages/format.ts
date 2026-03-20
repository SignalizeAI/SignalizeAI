import { state } from '../state.js';
import type { AngleId, ReplyProbability } from './types.js';
import { computeReplyProbability } from './types.js';

export function getSignedInUserName(): string {
  return state.currentUserName?.trim() || 'Your Name';
}

function extractRootDomain(value?: string | null): string {
  const text = String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  if (!text) return '';

  const parts = text
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || '';
}

function cleanTitleSegments(value?: string | null): string[] {
  return String(value || '')
    .split(/\s*[|>\-•:/]\s*/g)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => !/^https?:\/\//i.test(segment));
}

function prettifyRootDomain(value: string): string {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getCompanyDisplayName(value?: string | null, domain?: string | null): string {
  const rootDomain = extractRootDomain(domain || value);
  const normalizedRoot = rootDomain.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (normalizedRoot) {
    const titleMatch = cleanTitleSegments(value).find(
      (segment) => segment.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedRoot
    );
    if (titleMatch) return titleMatch;
    return prettifyRootDomain(rootDomain);
  }

  const segments = cleanTitleSegments(value);
  if (segments.length > 0) return segments[segments.length - 1];
  return 'there';
}

export function formatOutreachEmailBody(
  body: string,
  companyName?: string | null,
  userName?: string | null
): string[] {
  const raw = String(body || '').trim();
  const salutationPattern =
    /^(?:hi|hello|hey|dear)\s+(?:[a-z0-9.&'-]+(?:\s+[a-z0-9.&'-]+){0,3})?,?\s*/i;
  const cleanedLines = raw
    .split(/\n+/)
    .map((line, index) => {
      const trimmed = line.trim();
      if (index !== 0) return trimmed;
      return trimmed.replace(salutationPattern, '').trim();
    })
    .filter(Boolean)
    .filter((line, index, allLines) => {
      if (/^(thanks|thank you|best|best regards|regards|sincerely|cheers)[,!\s]*$/i.test(line)) {
        return false;
      }
      if (
        index > 0 &&
        /^(thanks|thank you|best|best regards|regards|sincerely|cheers)[,!\s]*$/i.test(
          allLines[index - 1] || ''
        )
      ) {
        return false;
      }
      return true;
    });
  const cleanedRaw = cleanedLines.join(' ').trim();
  const bodyParagraphs =
    cleanedLines.length > 1
      ? cleanedLines
      : (() => {
          const sentences =
            cleanedRaw
              .match(/[^.!?]+[.!?]?/g)
              ?.map((sentence) => sentence.trim())
              .filter(Boolean) || [];

          if (sentences.length <= 1) return sentences;
          if (sentences.length === 2) return [sentences[0], sentences[1]];
          if (sentences.length === 3) return [sentences[0], sentences.slice(1).join(' ')];
          return [sentences.slice(0, 2).join(' '), sentences.slice(2).join(' ')];
        })();

  const greeting = `Hi ${getCompanyDisplayName(companyName)},`;
  const signoffName = String(userName || '').trim() || getSignedInUserName();

  return [greeting, ...bodyParagraphs, `Thanks,\n${signoffName}`];
}

export function getOutreachReplyProbability(
  angleId: AngleId,
  recommendedAngleId: AngleId,
  score: number,
  salesPersona: string
): ReplyProbability {
  if (angleId === recommendedAngleId) return 'High';

  const baseProbability = computeReplyProbability(angleId, score, salesPersona);
  if (baseProbability === 'High') return 'Medium';
  if (baseProbability === 'Medium') return 'Low';
  return 'Low';
}
