async function getAccessToken() {
  const { data, error } = await window.supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}

export async function analyzeWebsiteContent(extracted) {

  const token = await getAccessToken();

  const res = await fetch("https://api.signalizeai.org/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ extracted })
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("Invalid JSON from backend");
  }

  if (data?.upgrade_required || data?.error === "limit_reached") {
    return {
      blocked: true,
      plan: data.plan || "free",
      remaining_today: 0
    };
  }

  if (!res.ok) {
    throw new Error(data?.error || "Backend error");
  }

  return {
    blocked: false,
    plan: data.plan,
    remaining_today: data.remaining_today,
    ...normalizeAnalysis(data)
  };
}

export async function fetchQuota() {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch("https://api.signalizeai.org/quota", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) return null;
  return await res.json();
}

function normalizeAnalysis(raw) {
  const BUYER_PERSONAS = [
    "Founder / CEO",
    "Enterprise Account Executive",
    "Mid-Market AE",
    "SMB Sales Rep",
    "Product-Led Growth (PLG)",
    "Partnerships / Alliances"
  ];

  const OUTREACH_PERSONAS = [
    "SDR",
    "Account Executive",
    "Enterprise AE",
    "Partnerships Manager",
    "Founder"
  ];

  const cleanText = (v, max = 240) =>
    typeof v === "string"
      ? v.replace(/\s+/g, " ").trim().slice(0, max)
      : "";

  const normalizeBuyerPersona = p =>
    BUYER_PERSONAS.find(x => x.toLowerCase() === String(p).toLowerCase())
    || "Mid-Market AE";

  const normalizeOutreachPersona = p =>
    OUTREACH_PERSONAS.find(x => x.toLowerCase() === String(p).toLowerCase())
    || "Account Executive";

  return {
    whatTheyDo: cleanText(raw.whatTheyDo, 200),
    targetCustomer: cleanText(raw.targetCustomer, 180),
    valueProposition: cleanText(raw.valueProposition, 220),
    salesAngle: cleanText(raw.salesAngle, 500),

    salesReadinessScore: Math.max(
      0,
      Math.min(100, Number(raw.salesReadinessScore) || 0)
    ),

    bestSalesPersona: {
      persona: normalizeBuyerPersona(raw.bestSalesPersona?.persona),
      reason: cleanText(raw.bestSalesPersona?.reason, 160)
    },

    recommendedOutreach: {
      persona: normalizeOutreachPersona(raw.recommendedOutreach?.persona),
      goal: cleanText(raw.recommendedOutreach?.goal, 160),
      angle: cleanText(raw.recommendedOutreach?.angle, 220),
      message: cleanText(raw.recommendedOutreach?.message, 420)
    }
  };
}
