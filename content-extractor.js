(function () {
  function cleanText(text) {
    return text
      .replace(/\s+/g, " ")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function isMeaningful(text) {
    if (!text) return false;

    const length = text.length;
    if (length < 40 || length > 300) return false;

    const blacklist = [
      "cookie",
      "privacy",
      "terms",
      "subscribe",
      "sign up",
      "login",
      "accept all",
      "©",
    ];

    const lower = text.toLowerCase();
    return !blacklist.some(word => lower.includes(word));
  }

  function detectRestriction() {
    const bodyText = document.body?.innerText?.toLowerCase() || "";

    const restrictedPhrases = [
      "sign in",
      "log in",
      "login to continue",
      "please login",
      "create an account",
      "subscribe to read",
      "accept cookies",
      "enable cookies",
      "access denied",
      "403 forbidden",
      "not authorized",
      "verify you are human"
    ];

    const matched = restrictedPhrases.find(p => bodyText.includes(p));
    if (matched) {
      return `Restricted page detected: "${matched}"`;
    }

    return null;
  }

  function isThinContent(content) {
    const totalTextLength =
      (content.title?.length || 0) +
      (content.metaDescription?.length || 0) +
      content.headings.join("").length +
      content.paragraphs.join("").length;

    return (
      totalTextLength < 300 ||
      content.paragraphs.length < 2
    );
  }

  function extractHeadings() {
    return Array.from(document.querySelectorAll("h1, h2"))
      .map(h => cleanText(h.innerText))
      .filter(Boolean)
      .slice(0, 10);
  }

  function extractParagraphs() {
    const containers =
      document.querySelector("main") ||
      document.querySelector("article") ||
      document.querySelector("section") ||
      document.body;

    const paragraphs = Array.from(containers.querySelectorAll("p"))
      .map(p => cleanText(p.innerText))
      .filter(isMeaningful);

    const unique = Array.from(new Set(paragraphs));

    return unique.slice(0, 15);
  }

  function extractContent() {
    return {
      url: location.href,
      title: document.title || "",
      metaDescription:
        document.querySelector("meta[name='description']")?.content || "",
      headings: extractHeadings(),
      paragraphs: extractParagraphs(),
    };
  }

  chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
    if (msg?.type === "EXTRACT_WEBSITE_CONTENT") {
      try {
        const restriction = detectRestriction();
        if (restriction) {
          sendResponse({
            ok: false,
            reason: "RESTRICTED",
            details: restriction
          });
          return;
        }

        const content = extractContent();

        if (isThinContent(content)) {
          sendResponse({
            ok: false,
            reason: "THIN_CONTENT"
          });
          return;
        }

        sendResponse({ ok: true, content });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    }

    return true;
  });
})();
