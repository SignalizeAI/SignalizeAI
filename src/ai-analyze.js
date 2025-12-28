export async function analyzeWebsiteContent(extracted) {
  const apiKey = "gsk_XXXXXXXXXXXXXXXXXXXXXXXX";

  const prompt = `
You are a business analyst.

Return ONLY valid JSON in this exact shape:
{
  "whatTheyDo": "",
  "targetCustomer": "",
  "valueProposition": "",
  "salesAngle": ""
}

Rules:
- No markdown
- No explanations
- No extra text
- Strings only

Guidelines for salesAngle:
- One short paragraph
- Explain how someone could approach, pitch, or engage this business
- Focus on their audience, offering, or positioning

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
    return JSON.parse(raw);
  } catch {
    console.error("Raw AI output:", raw);
    throw new Error("AI did not return valid JSON");
  }
}
