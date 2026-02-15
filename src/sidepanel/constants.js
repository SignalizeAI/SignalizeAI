export const IRRELEVANT_DOMAINS = [
  'google.com',
  'google.',
  'bing.com',
  'bing.',
  'yahoo.com',
  'duckduckgo.com',
  'baidu.com',
  'yandex.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'tiktok.com',
  'reddit.com',
  'linkedin.com',
  'youtube.com',
  'pinterest.com',
  'snapchat.com',
  'wikipedia.org',
  'github.com',
];

export const TWO_PART_TLDS = ['co.uk', 'com.au', 'co.in', 'org.uk'];

export const SELECT_ALL_ICON = `
<svg
  width="18"
  height="18"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <rect x="3" y="3" width="18" height="18" rx="3"></rect>
  <path d="M7 12l3 3 7-7"></path>
</svg>
`;

export const INDETERMINATE_ICON = `
<svg
  width="18"
  height="18"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <rect x="3" y="3" width="18" height="18" rx="3"></rect>
  <line x1="7" y1="12" x2="17" y2="12"></line>
</svg>
`;

export const DESELECT_ALL_ICON = `
<svg
  width="18"
  height="18"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <rect x="3" y="3" width="18" height="18" rx="3"></rect>
  <line x1="9" y1="9" x2="15" y2="15"></line>
  <line x1="15" y1="9" x2="9" y2="15"></line>
</svg>
`;

export const DEFAULT_SETTINGS = {
  autoReanalysis: true,
  reanalysisMode: 'content-change',
  copyFormat: 'full',
};

export const PAGE_SIZE = 10;
export const QUOTA_TTL = 30_000;
export const AUTO_ANALYZE_DEBOUNCE = 500;
