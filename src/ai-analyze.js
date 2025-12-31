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
  const PERSONA_MAP = [
    "Founder / CEO",
    "Enterprise Account Executive",
    "Mid-Market AE",
    "SMB Sales Rep",
    "Product-Led Growth (PLG)",
    "Partnerships / Alliances"
  ];

  const cleanText = (v, max = 240) =>
    typeof v === "string"
      ? v.replace(/\s+/g, " ").trim().slice(0, max)
      : "";

  const normalizePersona = (p) =>
    PERSONA_MAP.find(x => x.toLowerCase() === String(p).toLowerCase())
    || "Mid-Market AE";

  return {
    whatTheyDo: cleanText(raw.whatTheyDo, 200),
    targetCustomer: cleanText(raw.targetCustomer, 180),
    valueProposition: cleanText(raw.valueProposition, 220),
    salesAngle: cleanText(raw.salesAngle, 360),

    salesReadinessScore: Math.max(
      0,
      Math.min(100, Number(raw.salesReadinessScore) || 0)
    ),

    bestSalesPersona: {
      persona: normalizePersona(raw.bestSalesPersona?.persona),
      reason: cleanText(raw.bestSalesPersona?.reason, 160)
    }
  };
}
