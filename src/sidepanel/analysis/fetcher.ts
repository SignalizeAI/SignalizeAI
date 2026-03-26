interface ExtractedContent {
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  paragraphs: string[];
}

const BG_FETCH_TIMEOUT_MS = 30000;
const BG_MESSAGE_TIMEOUT_MS = 35000;

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function isMeaningful(text: string): boolean {
  if (!text) return false;

  const length = text.length;
  // Reduced minimum length to 8 to capture shorter business slogans/values
  if (length < 8 || length > 6000) return false;

  const lower = text.toLowerCase();

  // Only apply the blacklist to very short strings
  if (length < 40) {
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
      'legal',
    ];
    if (blacklist.some((word) => lower.includes(word))) return false;
  }

  return true;
}

function isThinContent(content: ExtractedContent): boolean {
  // If the user provided a URL, we should try to analyze it even if content seems light.
  // AI can often gain context from just the URL and Title.
  if (content.title && content.title.length > 3) return false;

  const totalTextLength =
    (content.title?.length || 0) +
    (content.metaDescription?.length || 0) +
    content.headings.join('').length +
    content.paragraphs.join('').length;

  return totalTextLength < 50;
}

function extractHeadings(doc: Document, limit = 15): string[] {
  return Array.from(doc.querySelectorAll('h1, h2, h3'))
    .map((h) => cleanText(h.textContent || ''))
    .filter(Boolean)
    .slice(0, limit);
}

function extractParagraphs(doc: Document, limit = 50): string[] {
  // We look everywhere in the body if no semantic tags are found
  const container =
    doc.querySelector('main') ||
    doc.querySelector('article') ||
    doc.querySelector('#content') ||
    doc.querySelector('.content') ||
    doc.body;

  if (!container) return [];

  // Capture almost all text-bearing elements
  const elements = Array.from(container.querySelectorAll('p, div, span, li, section, h4, h5'));
  const texts = elements.map((el) => cleanText(el.textContent || '')).filter(isMeaningful);

  // High-performance unique filter
  const unique = Array.from(new Set(texts));

  // Return more content items for AI to have better context
  return unique.slice(0, limit);
}

function extractContentFromDoc(doc: Document, url: string, compact = false): ExtractedContent {
  // Capture various types of description tags
  const description =
    doc.querySelector("meta[name='description']")?.getAttribute('content') ||
    doc.querySelector("meta[property='og:description']")?.getAttribute('content') ||
    doc.querySelector("meta[name='twitter:description']")?.getAttribute('content') ||
    doc.querySelector("meta[name='Description']")?.getAttribute('content') ||
    '';

  return {
    url,
    title: doc.title || '',
    metaDescription: description,
    headings: extractHeadings(doc, compact ? 8 : 15),
    paragraphs: extractParagraphs(doc, compact ? 20 : 50),
  };
}

export async function fetchAndExtractContent(
  url: string,
  viaBackground: boolean = false,
  compact: boolean = false
): Promise<{ ok: boolean; content?: ExtractedContent; reason?: string; error?: string }> {
  try {
    const fetchRes = viaBackground
      ? await sendBackgroundFetchText(url)
      : await (async () => {
          const res = await fetch(url);
          return { ok: true, status: res.status, text: await res.text() };
        })();

    if (!fetchRes.ok) {
      return { ok: false, error: fetchRes.error || 'Fetch failed' };
    }

    if (fetchRes.status < 200 || fetchRes.status >= 300) {
      if (fetchRes.status === 403 || fetchRes.status === 401) {
        return { ok: false, reason: 'RESTRICTED', error: `HTTP Error: ${fetchRes.status}` };
      }
      return { ok: false, error: `HTTP error: ${fetchRes.status}` };
    }

    const html = fetchRes.text;

    // 1. Extract the "Essence": Title and Description
    const titleMatch = html.match(/<title[\s\S]*?>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : '';

    // Improved meta description extraction
    const metaDescMatch =
      html.match(/<meta[^>]*?name=["']description["'][^>]*?content=["']([\s\S]*?)["'][^>]*?>/i) ||
      html.match(/<meta[^>]*?content=["']([\s\S]*?)["'][^>]*?name=["']description["'][^>]*?>/i);
    const metaDesc = metaDescMatch ? metaDescMatch[1] : '';

    // 2. Extract the Body content (everything between <body> tags or the whole thing if no tags)
    const bodyMatch = html.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
    let bodyContent = bodyMatch ? bodyMatch[1] : html;

    // 3. Nuclear Sanitization of the extracted body
    // This wipes EVERY link, script, style, and iframe from the string
    bodyContent = bodyContent
      .replace(
        /<(?:script|style|noscript|iframe|svg|canvas|video|audio|object|embed)[\s\S]*?<\/(?:script|style|noscript|iframe|svg|canvas|video|audio|object|embed)>/gi,
        ''
      )
      .replace(/<(?:link|base|img|source|input|button|hr|br)\b[^>]*>/gi, '')
      .replace(/\s+on\w+="[^"]*"/gi, ''); // Remove inline event handlers (onclick, etc)

    // 4. Rebuild a "Clean Room" HTML structure for the parser
    // This ensures no preloads or headers can EVER trigger browser warnings
    const cleanHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <meta name="description" content="${metaDesc}">
        </head>
        <body>
          ${bodyContent}
        </body>
      </html>
    `;

    const doc = new DOMParser().parseFromString(cleanHtml, 'text/html');
    const content = extractContentFromDoc(doc, url, compact);

    if (isThinContent(content)) {
      return { ok: false, reason: 'THIN_CONTENT' };
    }

    return { ok: true, content };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function sendBackgroundFetchText(
  url: string
): Promise<{ ok: boolean; status?: number; text?: string; error?: string }> {
  return await new Promise((resolve) => {
    let isResolved = false;
    const timeoutId = setTimeout(() => {
      if (isResolved) return;
      isResolved = true;
      resolve({ ok: false, error: 'Background fetch timeout' });
    }, BG_MESSAGE_TIMEOUT_MS);

    chrome.runtime.sendMessage(
      { type: 'BG_FETCH_TEXT', url, timeoutMs: BG_FETCH_TIMEOUT_MS },
      (response) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          resolve({
            ok: false,
            error: chrome.runtime.lastError.message || 'Background fetch failed',
          });
          return;
        }
        resolve(response || { ok: false, error: 'No response from background' });
      }
    );
  });
}
