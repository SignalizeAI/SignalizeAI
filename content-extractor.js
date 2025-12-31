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

    if (length < 12 || length > 500) return false;

    const blacklist = [
      "cookie",
      "privacy",
      "terms",
      "subscribe",
      "sign up",
      "login",
      "accept all",
      "©",
      "home",
      "menu"
    ];

    const lower = text.toLowerCase();
    return !blacklist.some(word => lower.includes(word));
  }

  function detectRestriction() {
    const bodyText = document.body?.innerText?.toLowerCase() || "";

    const HARD_BLOCKERS = [
      "verify you are human",
      "checking your browser",
      "access denied",
      "403 forbidden",
      "401 unauthorized",
      "enable javascript",
      "captcha",
      "cloudflare"
    ];

    const matched = HARD_BLOCKERS.find(p => bodyText.includes(p));
    return matched ? `Hard restricted page: "${matched}"` : null;
  }

  function isThinContent(content) {
    const totalTextLength =
      (content.title?.length || 0) +
      (content.metaDescription?.length || 0) +
      content.headings.join("").length +
      content.paragraphs.join("").length;

    return (
      totalTextLength < 180 &&
      content.paragraphs.length < 4 &&
      content.headings.length < 1
    );
  }

  function extractHeadings(doc) {
    return Array.from(doc.querySelectorAll("h1, h2"))
      .map(h => cleanText(h.innerText))
      .filter(Boolean)
      .slice(0, 10);
  }

  function extractParagraphs(doc) {
    const containers =
      doc.querySelector("main") ||
      doc.querySelector("article") ||
      doc.querySelector("section") ||
      doc.body;

    const elements = Array.from(
      containers.querySelectorAll("p, div, span")
    );

    const texts = elements
      .map(el => cleanText(el.innerText))
      .filter(isMeaningful);

    const unique = Array.from(new Set(texts));

    return unique.slice(0, 20);
  }

  function extractContent(doc, url) {
    return {
      url,
      title: doc.title || "",
      metaDescription:
        doc.querySelector("meta[name='description']")?.content || "",
      headings: extractHeadings(doc),
      paragraphs: extractParagraphs(doc)
    };
  }

  chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
    if (msg?.type === "__PING__") {
      sendResponse({ ok: true });
      return false;
    }

    if (msg?.type !== "EXTRACT_WEBSITE_CONTENT") return;

    try {
      const targetUrl = msg.overrideUrl || window.location.href;

      if (msg.overrideUrl && msg.overrideUrl !== window.location.href) {
        fetch(targetUrl)
          .then(res => res.text())
          .then(html => {
            const doc = new DOMParser().parseFromString(html, "text/html");
            const content = extractContent(doc, targetUrl);

            if (isThinContent(content)) {
              sendResponse({ ok: false, reason: "THIN_CONTENT" });
              return;
            }

            sendResponse({ ok: true, content });
          })
          .catch(err => {
            sendResponse({ ok: false, error: err.message });
          });

        return true;
      }

      const restriction = detectRestriction();
      if (restriction) {
        sendResponse({
          ok: false,
          reason: "RESTRICTED",
          details: restriction
        });
        return false;
      }

      const content = extractContent(document, window.location.href);

      if (isThinContent(content)) {
        sendResponse({ ok: false, reason: "THIN_CONTENT" });
        return false;
      }

      sendResponse({ ok: true, content });
      return false;

    } catch (err) {
      sendResponse({ ok: false, error: err.message });
      return false;
    }
  });
})();
