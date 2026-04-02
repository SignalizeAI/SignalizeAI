import { buildPersistedOutreachAngle } from '../../analysis/outreach-angle.js';
import type { BatchResult, Content } from './types.js';

export function parseUrlsFromText(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const urls: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.includes('.') && !trimmed.includes(' ')) {
      const fullUrl = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      try {
        new URL(fullUrl);
        urls.push(fullUrl);
      } catch {
        // ignore invalid URL rows
      }
    }
  }
  return urls;
}

export function parseUrlsFromCsv(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const urls: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split(',');
    for (const col of cols) {
      const cleanCol = col.replace(/^["']|["']$/g, '').trim();
      if (cleanCol.includes('.') && !cleanCol.includes(' ')) {
        const fullUrl = cleanCol.startsWith('http') ? cleanCol : `https://${cleanCol}`;
        try {
          new URL(fullUrl);
          urls.push(fullUrl);
          break;
        } catch {
          // ignore invalid URL values
        }
      }
    }
  }
  return urls;
}

export function mapBatchResultToExportItem(r: BatchResult) {
  const outreachAngles = r.outreachAngles?.angles?.length
    ? {
        generated_at: r.outreachGeneratedAt,
        recommended_angle_id: r.outreachAngles.recommendedAngleId,
        angles: r.outreachAngles.angles,
        ...(r.followUpEmails?.emails?.length ? { follow_ups: r.followUpEmails } : {}),
      }
    : null;

  return {
    title: r.content.title,
    domain: r.domain,
    url: r.url,
    description: r.content.metaDescription,
    sales_readiness_score: r.analysis.salesReadinessScore,
    what_they_do: r.analysis.whatTheyDo,
    target_customer: r.analysis.targetCustomer,
    value_proposition: r.analysis.valueProposition,
    best_sales_persona: r.analysis.bestSalesPersona?.persona,
    best_sales_persona_reason: r.analysis.bestSalesPersona?.reason,
    recommended_outreach_goal: r.analysis.recommendedOutreach?.goal,
    recommended_outreach_angle: buildPersistedOutreachAngle(r.analysis),
    outreach_angles: outreachAngles,
  };
}

export function cleanTitle(title: string): string {
  if (!title) return '';
  const match = title.match(/^(.+?)(?:\s*[-|:]\s*|\s*[–—]\s*)(.+)$/);
  return match && match[1].length > 3 ? match[1].trim() : title.trim();
}

export function trimContentForAnalyze(content: Content): Content {
  const title = (content.title || '').trim().slice(0, 220);
  const metaDescription = (content.metaDescription || '').trim().slice(0, 320);

  const headings = content.headings
    .map((h) => (h || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((h) => h.slice(0, 140));

  let totalParagraphChars = 0;
  const paragraphs: string[] = [];
  for (const raw of content.paragraphs) {
    if (paragraphs.length >= 10) break;
    const cleaned = (raw || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;

    const clipped = cleaned.slice(0, 260);
    if (totalParagraphChars + clipped.length > 3200) break;

    paragraphs.push(clipped);
    totalParagraphChars += clipped.length;
  }

  return {
    ...content,
    title,
    metaDescription,
    headings,
    paragraphs,
  };
}

export function shouldUseUrlOnlyFallback(errorMessage: string): boolean {
  const msg = (errorMessage || '').toLowerCase();
  if (!msg) return false;

  const code = parseStatusCode(msg);
  if (code !== null) {
    if ([401, 403, 405, 406, 408, 409, 415, 425, 429, 500, 502, 503, 504].includes(code))
      return true;
    if (code >= 400 && code < 500) return false;
  }

  return (
    msg.includes('restricted') ||
    msg.includes('forbidden') ||
    msg.includes('blocked') ||
    msg.includes('thin_content') ||
    msg.includes('timeout') ||
    msg.includes('failed to fetch') ||
    msg.includes('network')
  );
}

export function buildUrlOnlyContent(url: string, reason: string): Content {
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  const label = hostname.split('.').filter(Boolean)[0] || hostname;
  const title = label.charAt(0).toUpperCase() + label.slice(1);

  return {
    url,
    title,
    metaDescription: `Limited prospect data: content extraction unavailable (${reason}).`,
    headings: [title, hostname],
    paragraphs: [`Website: ${hostname}`, `URL: ${url}`, `Extraction issue: ${reason}`],
  };
}

export function buildDegradedAnalysis(content: Content, reason: string) {
  const domain = new URL(content.url).hostname.replace(/^www\./, '');
  const fallbackSummary =
    content.metaDescription?.replace(/\s+/g, ' ').trim().slice(0, 140) ||
    `${cleanTitle(content.title || domain)} website`;
  return {
    whatTheyDo: fallbackSummary,
    targetCustomer: 'Target buyer needs a quick manual review.',
    valueProposition: 'Confirm the core offer from the live site before pitching.',
    salesAngle: 'Keep the opener neutral and validate fit from the site copy.',
    salesReadinessScore: 20,
    bestSalesPersona: {
      persona: 'Mid-Market AE',
      reason: 'Use a general outbound motion until the sales path is clearer.',
    },
    recommendedOutreach: {
      persona: 'Account Executive',
      goal: 'Get a quick response',
      angle: [
        '- Reference visible site copy only',
        '- Keep the opener brief',
        '- Validate fit before pitching',
        '- Use one concrete observation',
      ].join('\n'),
      message: `Hi ${domain}, came across your site and wanted to reach out. If improving prospecting or first-touch outreach is relevant right now, happy to share a quick idea.`,
    },
  };
}

export function normalizeErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err || 'Error');
  return message?.trim() || 'Error';
}

export function parseStatusCode(message: string): number | null {
  const match = message.match(/\b(4\d{2}|5\d{2})\b/);
  if (!match) return null;
  const code = Number(match[1]);
  return Number.isFinite(code) ? code : null;
}

export function isQuotaError(err: unknown): boolean {
  const message = normalizeErrorMessage(err).toLowerCase();
  return (
    message.includes('daily limit reached') ||
    message.includes('quota reached') ||
    message.includes('limit reached')
  );
}

export function isRetryableError(err: unknown): boolean {
  const message = normalizeErrorMessage(err).toLowerCase();
  if (!message) return false;
  if (isQuotaError(err) || message.includes('not logged in')) return false;

  const code = parseStatusCode(message);
  if (code !== null) {
    if ([408, 409, 425, 429, 500, 502, 503, 504].includes(code)) return true;
    if (code >= 400 && code < 500) return false;
  }

  const retryableMarkers = [
    'service unavailable',
    'ai service unavailable',
    'prospecting request failed',
    'invalid json from backend',
    'network',
    'failed to fetch',
    'timeout',
    'timed out',
    'temporarily unavailable',
    'rate limit',
    'too many requests',
    'gateway',
    'econnreset',
    'socket hang up',
  ];

  return retryableMarkers.some((marker) => message.includes(marker));
}
