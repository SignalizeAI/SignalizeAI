export async function analyzeWebsiteContent(extracted) {
  const apiKey = "gsk_XXXXXXXXXXXXXXXXXXXXXXXX";

  const prompt = `
You are a business analyst.

Return ONLY valid JSON in this exact shape:
{
  "whatTheyDo": "",
  "targetCustomer": "",
  "valueProposition": "",
  "salesAngle": "",
  "salesReadinessScore": 0,
  "bestSalesPersona": {
    "persona": "",
    "reason": ""
  }
}

Rules:
- No markdown
- No explanations
- No extra text
- Strings only
- persona must be ONE of the following EXACT values:
  - "Founder / CEO"
  - "Enterprise Account Executive"
  - "Mid-Market AE"
  - "SMB Sales Rep"
  - "Product-Led Growth (PLG)"
  - "Partnerships / Alliances"

Guidelines for salesAngle:
- One short paragraph
- Explain how someone could approach, pitch, or engage this business
- Focus on their audience, offering, or positioning

salesReadinessScore rules:
- Integer between 0 and 100
- Higher = easier to sell to
- Consider clarity, maturity, and market focus

bestSalesPersona rules:
- Choose the MOST suitable persona from the list
- Base decision on company size, sales motion, and buying complexity
- reason must be ONE concise sentence

Website information:
Title: ${extracted.title}
Meta description: ${extracted.metaDescription}
Headings: ${(extracted.headings || []).join(" | ")}
Content: ${(extracted.paragraphs || []).join(" ").slice(0, 2000)}
`;

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 400
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error("No AI response");
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeAnalysis(parsed);
  } catch {
    console.error("Raw AI output:", raw);
    throw new Error("AI did not return valid JSON");
  }
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
