import type { Analysis } from '../../state.js';
import type { FollowUpEmailsResult, OutreachAnglesResult } from '../../outreach-messages/types.js';

type BatchMeta = {
  title: string;
  url: string;
  domain: string;
};

const BAD_MARKERS = [
  'unknown',
  'temporarily unavailable',
  'automatic fallback summary',
  'could not be reliably inferred',
  'limited prospect data',
  'extraction unavailable',
];

function compact(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function toTitleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function cleanCompany(meta: BatchMeta): string {
  const domainRoot = meta.domain.replace(/^www\./, '').split('.')[0] || meta.domain;
  const domainName = toTitleCase(domainRoot);
  const title = compact(meta.title);
  const titleParts = title
    .split(/\s*[|:\-–—]\s*/)
    .map((part) => compact(part))
    .filter(Boolean);
  const titleCandidate = titleParts.find((part) => part.split(/\s+/).length <= 3);
  return (titleCandidate || domainName).slice(0, 36);
}

function safeAnalysisValue(value: string | undefined, fallback: string): string {
  const cleaned = compact(value);
  if (!cleaned) return fallback;
  const lower = cleaned.toLowerCase();
  if (BAD_MARKERS.some((marker) => lower.includes(marker))) {
    return fallback;
  }
  return cleaned.slice(0, 80);
}

function finalize(text: string, max = 150): string {
  const cleaned = compact(text);
  if (cleaned.length <= max) return cleaned;
  const clipped = cleaned.slice(0, max - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).trim();
}

export function buildFallbackOutreachAngles(
  analysis: Analysis,
  meta: BatchMeta
): OutreachAnglesResult {
  const company = cleanCompany(meta);
  const whatTheyDo = safeAnalysisValue(analysis.whatTheyDo, 'a fast-moving commercial team');

  return {
    recommendedAngleId: 'observation',
    angles: [
      {
        id: 'observation',
        label: 'Observation Approach',
        rationale: 'Lead with what they do and tie it to a practical workflow improvement.',
        variations: [
          {
            subject: finalize(`Idea for ${company}`, 48),
            body: finalize(
              `Saw ${company} is focused on ${whatTheyDo}. Curious if speeding up prospect research and first-touch outreach is on the radar right now.`
            ),
          },
        ],
      },
      {
        id: 'pain_point',
        label: 'Pain-Point Approach',
        rationale:
          'Center the note on the time lost to manual research and inconsistent follow-through.',
        variations: [
          {
            subject: finalize('Cut research time?', 48),
            body: finalize(
              `A lot of teams lose time before the first message is even ready to send. If reducing that manual work is a priority, this may be worth comparing.`
            ),
          },
        ],
      },
      {
        id: 'curiosity',
        label: 'Curiosity Approach',
        rationale: 'Use a short question to open a conversation without over-pitching.',
        variations: [
          {
            subject: finalize('Quick prospecting question', 48),
            body: finalize(
              `Quick question: how much rep time still goes into turning website research into usable outreach? There may be a lighter way to handle that.`
            ),
          },
        ],
      },
    ],
  };
}

export function buildFallbackFollowUpEmails(
  analysis: Analysis,
  meta: BatchMeta
): FollowUpEmailsResult {
  const company = cleanCompany(meta);
  const value = safeAnalysisValue(
    analysis.valueProposition,
    'save time and tighten outreach quality'
  );

  return {
    emails: [
      {
        id: 'reminder',
        label: 'Reminder Follow-Up',
        subject: finalize(`Following up on ${company}`, 48),
        body: finalize(
          `Wanted to circle back on my earlier note. If improving how your team handles research and first-touch outreach is still relevant, happy to share a simple approach.`
        ),
      },
      {
        id: 'value_add',
        label: 'Value-Add Follow-Up',
        subject: finalize('One more angle', 48),
        body: finalize(
          `One more thought: the biggest win is usually less manual work before a rep can send something useful. If ${value} matters right now, this may be worth a quick look.`
        ),
      },
      {
        id: 'breakup',
        label: 'Breakup Follow-Up',
        subject: finalize('Close the loop?', 48),
        body: finalize(
          `I’ll close the loop after this. If streamlining prospecting and outreach is a priority later, I’d be glad to reconnect.`
        ),
      },
    ],
  };
}
