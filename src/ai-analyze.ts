import { supabase } from './sidepanel/supabase.js';
import { API_BASE_URL } from './config.js';

interface ExtractedContent {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
}

interface Quota {
  plan: string;
  used_today: number;
  daily_limit: number;
  remaining_today: number;
  max_saved: number;
  total_saved: number;
}

interface BestSalesPersona {
  persona: string;
  reason: string;
}

interface RecommendedOutreach {
  persona: string;
  goal: string;
  angle: string;
  message: string;
}

interface Analysis {
  whatTheyDo: string;
  targetCustomer: string;
  valueProposition: string;
  salesAngle: string;
  salesReadinessScore: number;
  bestSalesPersona: BestSalesPersona;
  recommendedOutreach: RecommendedOutreach;
}

interface AnalysisResultSuccess {
  blocked: false;
  quota: Quota;
  analysis: Analysis;
}

interface AnalysisResultBlocked {
  blocked: true;
  reason: string;
  quota: Quota;
}

type AnalysisResult = AnalysisResultSuccess | AnalysisResultBlocked;

const BG_ANALYZE_TIMEOUT_MS = 45000;
const BG_MESSAGE_TIMEOUT_MS = 50000;

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}

export async function analyzeWebsiteContent(
  extracted: ExtractedContent,
  isInternal: boolean = false,
  domainAnalyzedToday: boolean = false,
  viaBackground: boolean = false
): Promise<AnalysisResult> {
  const token = await getAccessToken();

  const payload = { extracted, isInternal, domainAnalyzedToday };
  let status: number;
  let data: any;

  if (viaBackground) {
    const bgResponse = await sendBackgroundAnalyze(API_BASE_URL, token, payload);
    if (!bgResponse.ok) throw new Error(bgResponse.error || 'Analysis request failed');
    status = bgResponse.status || 0;
    if (bgResponse.parseError) throw new Error('Invalid JSON from backend');
    data = bgResponse.data;
  } else {
    const res = await fetch(`${API_BASE_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: 'omit',
      mode: 'cors',
    });
    status = res.status;
    try {
      data = await res.json();
    } catch {
      throw new Error('Invalid JSON from backend');
    }
  }

  const isLimit = data?.upgrade_required || data?.error === 'limit_reached';

  if ((status < 200 || status >= 300) && !isLimit) {
    throw new Error(data?.error || 'Analysis request failed');
  }

  if (isLimit) {
    return {
      blocked: true,
      reason: 'limit',
      quota: {
        plan: data.plan || 'free',
        used_today: data.used_today ?? 0,
        daily_limit: data.daily_limit ?? 0,
        remaining_today: data.remaining_today ?? 0,
        max_saved: data.max_saved ?? 0,
        total_saved: data.total_saved ?? 0,
      },
    };
  }

  return {
    blocked: false,

    quota: {
      plan: data.plan,
      used_today: data.used_today,
      daily_limit: data.daily_limit,
      remaining_today: data.remaining_today,
      max_saved: data.max_saved,
      total_saved: data.total_saved,
    },
    analysis: normalizeAnalysis(data),
  };
}

async function sendBackgroundAnalyze(
  apiBaseUrl: string,
  token: string | null,
  payload: any
): Promise<any> {
  return await new Promise((resolve) => {
    let isResolved = false;
    const timeoutId = setTimeout(() => {
      if (isResolved) return;
      isResolved = true;
      resolve({ ok: false, error: 'Background analyze timeout' });
    }, BG_MESSAGE_TIMEOUT_MS);

    chrome.runtime.sendMessage(
      { type: 'BG_ANALYZE', apiBaseUrl, token, payload, timeoutMs: BG_ANALYZE_TIMEOUT_MS },
      (response) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError.message || 'Background analyze failed',
          });
          return;
        }
        resolve(response || { ok: false, error: 'No response from background' });
      }
    );
  });
}

export async function fetchQuota(): Promise<Quota | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE_URL}/quota`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: 'omit',
    mode: 'cors',
  });

  if (!res.ok) return null;
  return await res.json();
}

export async function generateOutreachAngles(
  analysis: Analysis,
  meta: {
    title: string;
    url: string;
    domain: string;
    evidence?: {
      metaDescription?: string;
      headings?: string[];
      paragraphs?: string[];
    };
  }
): Promise<import('./sidepanel/outreach-messages/types.js').OutreachAnglesResult | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/outreach-messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'omit',
      mode: 'cors',
      body: JSON.stringify({ analysis, meta }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateFollowUpEmails(
  analysis: Analysis,
  meta: {
    title: string;
    url: string;
    domain: string;
    evidence?: {
      metaDescription?: string;
      headings?: string[];
      paragraphs?: string[];
    };
  },
  openingEmail: { subject: string; body: string }
): Promise<import('./sidepanel/outreach-messages/types.js').FollowUpEmailsResult | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/outreach-followups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      credentials: 'omit',
      mode: 'cors',
      body: JSON.stringify({ analysis, meta, openingEmail }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeAnalysis(raw: any): Analysis {
  const BUYER_PERSONAS = [
    'Founder / CEO',
    'Enterprise Account Executive',
    'Mid-Market AE',
    'SMB Sales Rep',
    'Product-Led Growth (PLG)',
    'Partnerships / Alliances',
  ];

  const OUTREACH_PERSONAS = [
    'SDR',
    'Account Executive',
    'Enterprise AE',
    'Partnerships Manager',
    'Founder',
  ];

  const cleanText = (v: any, max: number = 240): string =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

  const normalizeBuyerPersona = (p: any): string =>
    BUYER_PERSONAS.find((x) => x.toLowerCase() === String(p).toLowerCase()) || 'Mid-Market AE';

  const normalizeOutreachPersona = (p: any): string =>
    OUTREACH_PERSONAS.find((x) => x.toLowerCase() === String(p).toLowerCase()) ||
    'Account Executive';

  return {
    whatTheyDo: cleanText(raw.whatTheyDo, 200),
    targetCustomer: cleanText(raw.targetCustomer, 180),
    valueProposition: cleanText(raw.valueProposition, 220),
    salesAngle: cleanText(raw.salesAngle, 500),

    salesReadinessScore: Math.max(0, Math.min(100, Number(raw.salesReadinessScore) || 0)),

    bestSalesPersona: {
      persona: normalizeBuyerPersona(raw.bestSalesPersona?.persona),
      reason: cleanText(raw.bestSalesPersona?.reason, 160),
    },

    recommendedOutreach: {
      persona: normalizeOutreachPersona(raw.recommendedOutreach?.persona),
      goal: cleanText(raw.recommendedOutreach?.goal, 160),
      angle: cleanText(raw.recommendedOutreach?.angle, 220),
      message: cleanText(raw.recommendedOutreach?.message, 420),
    },
  };
}
