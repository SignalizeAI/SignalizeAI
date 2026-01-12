export async function analyzeWebsiteContent(extracted) {
  const response = await fetch(
    "https://api.signalizeai.org",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ extracted })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Backend error ${response.status}: ${errText}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Invalid JSON from backend");
  }

  return normalizeAnalysis(data);
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
