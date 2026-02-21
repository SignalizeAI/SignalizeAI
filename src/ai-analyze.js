async function getAccessToken() {
  const { data, error } = await window.supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}

export async function analyzeWebsiteContent(
  extracted,
  isInternal = false,
  domainAnalyzedToday = false
) {
  const token = await getAccessToken();

  const res = await fetch('https://api.signalizeai.org/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ extracted, isInternal, domainAnalyzedToday }),
    credentials: 'omit',
    mode: 'cors',
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Invalid JSON from backend');
  }

  const isLimit = data?.upgrade_required || data?.error === 'limit_reached';

  if (!res.ok && !isLimit) {
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

export async function fetchQuota() {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch('https://api.signalizeai.org/quota', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: 'omit',
    mode: 'cors',
  });

  if (!res.ok) return null;
  return await res.json();
}

function normalizeAnalysis(raw) {
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

  const cleanText = (v, max = 240) =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';

  const normalizeBuyerPersona = (p) =>
    BUYER_PERSONAS.find((x) => x.toLowerCase() === String(p).toLowerCase()) || 'Mid-Market AE';

  const normalizeOutreachPersona = (p) =>
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
