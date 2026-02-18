import { TWO_PART_TLDS } from './constants.js';

export async function hashContent(content) {
  const text = [
    content.title,
    content.metaDescription,
    ...(content.headings || []),
    ...(content.paragraphs || []),
  ].join(' ');

  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function extractRootDomain(hostname) {
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return hostname;
  }

  const parts = hostname.split('.');

  if (parts.length <= 2) {
    return hostname;
  }

  const lastTwo = parts.slice(-2).join('.');
  const lastThree = parts.slice(-3).join('.');

  if (TWO_PART_TLDS.includes(lastTwo)) {
    return lastThree;
  }

  return lastTwo;
}

function makeCacheKey(url) {
  return `analysis_cache:${url}`;
}

function makeDomainCacheKey(domain) {
  const rootDomain = extractRootDomain(domain);
  return `analysis_cache:domain:${rootDomain}`;
}

function makeDomainAnalyzedTodayKey(domain) {
  const rootDomain = extractRootDomain(domain);
  return `domain_analyzed_today:${rootDomain}`;
}

export async function wasDomainAnalyzedToday(domain) {
  return new Promise((resolve) => {
    const key = makeDomainAnalyzedTodayKey(domain);
    chrome.storage.local.get(key, (obj) => {
      const entry = obj[key];
      if (!entry) {
        resolve(false);
        return;
      }
      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;
      if (now - entry.timestamp < DAY_MS) {
        resolve(true);
      } else {
        chrome.storage.local.remove(key);
        resolve(false);
      }
    });
  });
}

export function markDomainAnalyzedToday(domain) {
  const key = makeDomainAnalyzedTodayKey(domain);
  chrome.storage.local.set({ [key]: { timestamp: Date.now() } });
}

export async function getCachedAnalysis(url) {
  return new Promise((resolve) => {
    const key = makeCacheKey(url);
    chrome.storage.local.get(key, (obj) => {
      const cached = obj[key];
      if (!cached) {
        resolve(null);
        return;
      }
      const now = Date.now();
      const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
      if (now - cached.timestamp > CACHE_TTL_MS) {
        chrome.storage.local.remove(key);
        resolve(null);
      } else {
        resolve(cached);
      }
    });
  });
}

export async function getCachedAnalysisByDomain(domain) {
  return new Promise((resolve) => {
    const key = makeDomainCacheKey(domain);
    chrome.storage.local.get(key, (obj) => {
      const cached = obj[key];
      if (!cached) {
        resolve(null);
        return;
      }
      const now = Date.now();
      const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
      if (now - cached.timestamp > CACHE_TTL_MS) {
        chrome.storage.local.remove(key);
        resolve(null);
      } else {
        resolve(cached);
      }
    });
  });
}

export function setCachedAnalysis(url, payload) {
  const key = makeCacheKey(url);
  const value = {
    analysis: payload.analysis,
    meta: payload.meta,
    timestamp: Date.now(),
  };
  chrome.storage.local.set({ [key]: value });
}

export function setCachedAnalysisByDomain(domain, payload) {
  const key = makeDomainCacheKey(domain);
  const value = {
    analysis: payload.analysis,
    meta: payload.meta,
    timestamp: Date.now(),
  };
  chrome.storage.local.set({ [key]: value });
}
