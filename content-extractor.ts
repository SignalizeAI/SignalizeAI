interface ExtractedContent {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
}

interface ExtractionMessage {
  type: string;
  overrideUrl?: string;
}

(function () {
  function cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function isMeaningful(text: string): boolean {
    if (!text) return false;

    const length = text.length;

    if (length < 12 || length > 500) return false;

    const blacklist = [
      'cookie',
      'privacy',
      'terms',
      'subscribe',
      'sign up',
      'login',
      'accept all',
      '©',
      'home',
      'menu',
    ];

    const lower = text.toLowerCase();
    return !blacklist.some((word) => lower.includes(word));
  }

  function detectRestriction(): string | null {
    const bodyText = document.body?.innerText?.toLowerCase() || '';

    const HARD_BLOCKERS = [
      'verify you are human',
      'checking your browser',
      'access denied',
      '403 forbidden',
      '401 unauthorized',
      'enable javascript to view',
      'please enable javascript',
      'captcha verification',
    ];

    const matched = HARD_BLOCKERS.find((p) => bodyText.includes(p));
    return matched ? `Hard restricted page: "${matched}"` : null;
  }

  function isThinContent(content: ExtractedContent): boolean {
    const totalTextLength =
      (content.title?.length || 0) +
      (content.metaDescription?.length || 0) +
      content.headings.join('').length +
      content.paragraphs.join('').length;

    return totalTextLength < 100 && content.paragraphs.length < 2 && content.headings.length < 1;
  }

  function extractHeadings(doc: Document): string[] {
    return Array.from(doc.querySelectorAll('h1, h2'))
      .map((h) => cleanText(h.textContent || ''))
      .filter(Boolean)
      .slice(0, 10);
  }

  function extractParagraphs(doc: Document): string[] {
    const containers =
      doc.querySelector('main') ||
      doc.querySelector('article') ||
      doc.querySelector('section') ||
      doc.body;

    const elements = Array.from(containers.querySelectorAll('p, div, span'));

    const texts = elements.map((el) => cleanText(el.textContent || '')).filter(isMeaningful);

    const unique = Array.from(new Set(texts));

    return unique.slice(0, 20);
  }

  function extractContent(doc: Document, url: string): ExtractedContent {
    return {
      url,
      title: doc.title || '',
      metaDescription: doc.querySelector("meta[name='description']")?.getAttribute('content') || '',
      headings: extractHeadings(doc),
      paragraphs: extractParagraphs(doc),
    };
  }

  chrome.runtime.onMessage.addListener(
    (
      msg: ExtractionMessage,
      _: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      if ((msg as any)?.type === '__PING__') {
        sendResponse({ ok: true });
        return false;
      }

      if (msg?.type !== 'EXTRACT_WEBSITE_CONTENT') return;

      try {
        const targetUrl = msg.overrideUrl || window.location.href;

        if (msg.overrideUrl && msg.overrideUrl !== window.location.href) {
          fetch(targetUrl)
            .then((res) => res.text())
            .then((html) => {
              const doc = new DOMParser().parseFromString(html, 'text/html');
              const content = extractContent(doc, targetUrl);

              if (isThinContent(content)) {
                sendResponse({ ok: false, reason: 'THIN_CONTENT' });
                return;
              }

              sendResponse({ ok: true, content });
            })
            .catch((err: Error) => {
              sendResponse({ ok: false, error: err.message });
            });

          return true;
        }

        const restriction = detectRestriction();
        if (restriction) {
          sendResponse({
            ok: false,
            reason: 'RESTRICTED',
            details: restriction,
          });
          return false;
        }

        const content = extractContent(document, window.location.href);

        if (isThinContent(content)) {
          sendResponse({ ok: false, reason: 'THIN_CONTENT' });
          return false;
        }

        sendResponse({ ok: true, content });
        return false;
      } catch (err) {
        sendResponse({ ok: false, error: (err as Error).message });
        return false;
      }
    }
  );
})();
