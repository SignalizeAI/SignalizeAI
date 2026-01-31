import { analyzeWebsiteContent } from "./src/ai-analyze.js";

if (!window.supabase) {
  throw new Error('Supabase client not initialized. Make sure extension/supabase.bundle.js is loaded.');
}
const supabase = window.supabase;
let lastContentHash = null;
let lastAnalysis = null;
let lastExtractedMeta = null;
let lastAnalyzedDomain = null;
let forceRefresh = false;
let currentView = "analysis";
let selectionMode = false;
let lastSelectedIndex = null;
let selectedSavedIds = new Set();
let isRangeSelecting = false;
let isFinalizingDeletes = false;
let isUndoToastActive = false;
let totalFilteredCount = 0;
let currentPage = 1;
const PAGE_SIZE = 10;
let currentPlan = "free";
let remainingToday = null;
let usedToday = null;
let maxSavedLimit = 5;
let totalSavedCount = 0;
let dailyLimitFromAPI = 0;
let isUserInteracting = false;
let dropdownOpenedAt = 0;
let isAnalysisLoading = false;
let activeFilters = {
  minScore: 0,
  maxScore: 100,
  persona: "",
  searchQuery: "",
  sort: "created_at_desc"
};

const SELECT_ALL_ICON = `
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

const INDETERMINATE_ICON = `
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

const DESELECT_ALL_ICON = `
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

const DEFAULT_SETTINGS = {
  autoReanalysis: true,
  reanalysisMode: "content-change", 
  copyFormat: "full"
};
const headerSubtitle = document.querySelector(
  "#welcome-view .user-email-text"
);
const loginView = document.getElementById('login-view');
const welcomeView = document.getElementById('welcome-view');
const userInitialSpan = document.getElementById('user-initial');
const signInBtn = document.getElementById('google-signin');
const signOutBtn = document.getElementById('sign-out');
const statusMsg = document.getElementById('status-msg');
const settingsMenu = document.querySelector('.menu-item img[src*="settings"]')?.closest('.menu-item');
const settingsView = document.getElementById("settings-view");
const multiSelectToggle = document.getElementById("multi-select-toggle");
const selectionBackBtn = document.getElementById("selection-back-btn");
const selectAllBtn = document.getElementById("select-all-btn");

async function signInWithGoogle() {
  try {
    statusMsg.textContent = "Logging in...";

    chrome.runtime.sendMessage({ type: "LOGIN_GOOGLE" });

  } catch (err) {
    console.error("Login failed:", err);
    statusMsg.textContent = "Login failed. Please try again.";
  }
}

async function loadQuotaFromAPI() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return;

  const jwt = data.session.access_token;

  try {
    const res = await fetch("https://api.signalizeai.org/quota", {
      headers: { Authorization: `Bearer ${jwt}` }
    });

    if (!res.ok) {
      console.warn("Quota fetch failed:", res.status);
      currentPlan = currentPlan || "free";
      remainingToday = null;
      usedToday = null;
      dailyLimitFromAPI = dailyLimitFromAPI || 5;
      maxSavedLimit = maxSavedLimit || 3;
      totalSavedCount = totalSavedCount || 0;
      renderQuotaBanner();
      return;
    }

    const dataJson = await res.json();

    if (dataJson.plan) {
      currentPlan = dataJson.plan;
      remainingToday = dataJson.remaining_today;
      usedToday = dataJson.used_today;
      dailyLimitFromAPI = dataJson.daily_limit;
      maxSavedLimit = dataJson.max_saved || 0;
      totalSavedCount = dataJson.total_saved || 0;
      
      renderQuotaBanner();
    }
  } catch (e) {
    console.warn("Quota fetch failed", e);
    currentPlan = currentPlan || "free";
    remainingToday = null;
    usedToday = null;
    dailyLimitFromAPI = dailyLimitFromAPI || 5;
    maxSavedLimit = maxSavedLimit || 3;
    totalSavedCount = totalSavedCount || 0;
    renderQuotaBanner();
  }
}

function renderQuotaBanner() {
  const banner = document.getElementById("quota-banner");
  const text = document.getElementById("quota-text");
  const btn = document.getElementById("upgrade-btn");
  const badge = document.getElementById("plan-badge");
  const progressBar = document.getElementById("quota-progress-fill");

  if (badge) {
    badge.textContent = currentPlan.toUpperCase();
    badge.className = "badge";
    badge.classList.add(`badge-${currentPlan.toLowerCase()}`);
  }

  if (!banner || !text || !btn) return;

  banner.classList.remove("hidden");
  const used = Number(usedToday ?? 0);
  const totalLimit = Math.max(1, Number(dailyLimitFromAPI ?? 0));
  const percentage = Math.min(100, (used / totalLimit) * 100);


  if (progressBar) {
    progressBar.style.width = `${percentage}%`;

    if (remainingToday === null) {
      progressBar.classList.remove("danger");
    } else if (Number(remainingToday ?? 0) <= 0) {
      progressBar.classList.add("danger");
    } else {
      progressBar.classList.remove("danger");
    }
  }

  const savedText = `${Number(totalSavedCount ?? 0)} / ${Number(maxSavedLimit ?? 0)} saved`;

  if (remainingToday === null) {
    text.textContent = `Usage unavailable, ${savedText}`;
    btn.classList.add("hidden");
  } else if (Number(remainingToday ?? 0) > 0) {
    text.textContent = `${used} / ${totalLimit} analyses, ${savedText}`;
    
    if (currentPlan === "team") {
      btn.classList.add("hidden");
    } else {
      btn.classList.remove("hidden");
      btn.textContent = currentPlan === "pro" ? "Upgrade to Team" : "Upgrade";
    }
  } else {
    text.textContent = `Daily limit reached, ${savedText}`;
    btn.classList.remove("hidden");
    btn.textContent = currentPlan === "pro" ? "Upgrade to Team" : "Upgrade to continue";
  }
}

function updateDeleteState() {
  if (!multiSelectToggle) return;

  const countIndicator = document.getElementById("selection-count-indicator");
  const count = selectedSavedIds.size;
  
  const totalVisible = Array.from(document.querySelectorAll("#saved-list .saved-item"))
    .filter(item => !item.classList.contains("pending-delete")).length;

  if (countIndicator) {
    if (selectionMode && count > 0) {
      countIndicator.textContent = (count === totalVisible) ? `All (${count})` : `(${count})`;
      countIndicator.classList.remove("hidden");
    } else {
      countIndicator.classList.add("hidden");
    }
  }

  const shouldDisable = selectionMode && count === 0;
  multiSelectToggle.classList.toggle("disabled", shouldDisable);
  multiSelectToggle.setAttribute(
    "aria-disabled",
    shouldDisable ? "true" : "false"
  );
}

function navigateTo(view) {
  const prevView = currentView;

  if (view !== "saved" && selectionMode) {
    exitSelectionMode();
  }
  if (prevView === view && !welcomeView.classList.contains('hidden')) {
    return;
  }
  currentView = view;

  if (prevView !== view && !isAnalysisLoading) {
    document.querySelector(".dropdown-card")?.classList.remove("expanded");
    isUserInteracting = false;
  }
  document.getElementById("ai-analysis")?.classList.add("hidden");
  document.getElementById("empty-tab-view")?.classList.add("hidden");
  document.getElementById("saved-analyses")?.classList.add("hidden");
  document.getElementById("profile-view")?.classList.add("hidden");
  document.getElementById("settings-view")?.classList.add("hidden");

  document.getElementById("ai-loading")?.classList.add("hidden");
  document.getElementById("filter-panel")?.classList.add("hidden");

  if (headerSubtitle) {
    if (view === "analysis") {
      headerSubtitle.textContent = "Cursor for sales pages";
      headerSubtitle.style.cursor = "default";
      headerSubtitle.onclick = null;
    } else {
      headerSubtitle.textContent = "Back to Website Information";
      headerSubtitle.style.cursor = "pointer";
      headerSubtitle.onclick = (e) => {
        e.stopPropagation();
        navigateTo("analysis");
      };
    }
  }

  if (view === "analysis") {
    document.getElementById("ai-analysis")?.classList.remove("hidden");
    extractWebsiteContent();
  }

  if (view === "saved") {
    document.getElementById("saved-analyses")?.classList.remove("hidden");
    loadSavedAnalyses();
  }

  if (view === "profile") {
    document.getElementById("profile-view")?.classList.remove("hidden");
    
    const usageLimitEl = document.getElementById("profile-usage-limit");
    const storageLimitEl = document.getElementById("profile-storage-limit");
    const planNameEl = document.querySelector("#profile-view .profile-value");

    let dailyLimit = dailyLimitFromAPI;
    let saveLimit = maxSavedLimit;

    if (usageLimitEl) usageLimitEl.textContent = `${dailyLimit} / day`;
    if (storageLimitEl) storageLimitEl.textContent = `${saveLimit.toLocaleString()} items`;
    
    const profileRows = document.querySelectorAll("#profile-view .profile-row");
    profileRows.forEach(row => {
      const label = row.querySelector(".profile-label")?.textContent;
      const value = row.querySelector(".profile-value");
      if (label === "Plan" && value) {
        value.textContent = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
      }
    });
  }

  if (view === "settings") {
    document.getElementById("settings-view")?.classList.remove("hidden");
  }
}

async function signOut() {
  currentView = null;
  forceRefresh = false;
  selectionMode = false;

  remainingToday = null;
  usedToday = null;
  totalSavedCount = 0;
  currentPlan = null;

  await chrome.storage.local.remove("supabaseSession");

  const { data } = await supabase.auth.getSession();

  if (data?.session) {
    const { error } = await supabase.auth.signOut();
    if (error && error.name !== "AuthSessionMissingError") {
      console.error("Sign out error:", error);
    }
  }

  updateUI(null);
}

async function hashContent(content) {
  const text = [
    content.title,
    content.metaDescription,
    ...(content.headings || []),
    ...(content.paragraphs || [])
  ].join(" ");

  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
  });
}

function saveSettings(partial) {
  chrome.storage.sync.set(partial);
}

function extractRootDomain(hostname) {
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return hostname;
  }
  
  const parts = hostname.split(".");
  
  if (parts.length <= 2) {
    return hostname;
  }

  return parts.slice(-2).join(".");
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

async function wasDomainAnalyzedToday(domain) {
  return new Promise(resolve => {
    const key = makeDomainAnalyzedTodayKey(domain);
    chrome.storage.local.get(key, obj => {
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

function markDomainAnalyzedToday(domain) {
  const key = makeDomainAnalyzedTodayKey(domain);
  chrome.storage.local.set({ [key]: { timestamp: Date.now() } });
}

async function getCachedAnalysis(url) {
  return new Promise(resolve => {
    const key = makeCacheKey(url);
    chrome.storage.local.get(key, obj => {
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

async function getCachedAnalysisByDomain(domain) {
  return new Promise(resolve => {
    const key = makeDomainCacheKey(domain);
    chrome.storage.local.get(key, obj => {
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

function setCachedAnalysis(url, payload) {
  const key = makeCacheKey(url);
  const value = {
    analysis: payload.analysis,
    meta: payload.meta,
    timestamp: Date.now()
  };
  chrome.storage.local.set({ [key]: value });
}

function setCachedAnalysisByDomain(domain, payload) {
  const key = makeDomainCacheKey(domain);
  const value = {
    analysis: payload.analysis,
    meta: payload.meta,
    timestamp: Date.now()
  };
  chrome.storage.local.set({ [key]: value });
}

function showContentBlocked(message, options = {}) {
  endAnalysisLoading();
  
  const aiCard = document.getElementById("ai-analysis");
  const contentLoading = document.getElementById("ai-loading");
  const contentError = document.getElementById("content-error");
  const saveBtn = document.getElementById("saveButton");

  document.getElementById("ai-data")?.classList.add("hidden");
  if (contentLoading) contentLoading.classList.add("hidden");

  if (contentError) {
    contentError.innerHTML = `
      <div class="blocked-message">
        <p>${message}</p>

        ${
          options.allowHomepageFallback
            ? `<button id="analyze-homepage-btn" class="primary-btn">
                Analyze homepage instead
              </button>`
            : ""
        }
      </div>
    `;
    contentError.classList.remove("hidden");
  }

  if (options.allowHomepageFallback) {
    setTimeout(() => {
      const btn = document.getElementById("analyze-homepage-btn");
      if (!btn) return;

      btn.addEventListener("click", () => {
        const homepageUrl = new URL(options.originalUrl).origin;
        analyzeSpecificUrl(homepageUrl);
      });
    }, 0);
  }

  if (aiCard) aiCard.classList.add("hidden");
  if (saveBtn) {
    saveBtn.classList.remove("active");
  }


  lastAnalysis = null;
  lastContentHash = null;
  lastExtractedMeta = null;
  lastAnalyzedDomain = null;
  forceRefresh = false;
}

function highlightText(text, query) {
  if (!query || !text) return text;
  
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  
  return text.replace(regex, '<mark>$1</mark>');
}

function cleanTitle(title = "") {
  return title.replace(/^\(\d+\)\s*/, "").trim();
}

function applySettingsToUI(settings) {
  document.getElementById("setting-auto-reanalysis") &&
    (document.getElementById("setting-auto-reanalysis").checked = settings.autoReanalysis);

  document.querySelector(`input[name="reanalysis-mode"][value="${settings.reanalysisMode}"]`)?.click();
  document.querySelector(`input[name="copy-format"][value="${settings.copyFormat}"]`)?.click();

  updateReanalysisUI(settings);
}

function updateReanalysisUI(settings) {
  const section = document.getElementById("reanalysis-section");
  if (!section) return;

  if (!settings.autoReanalysis) {
    section.classList.add("disabled");
  } else {
    section.classList.remove("disabled");
  }
}

async function updateUI(session) {
  if (session) {
    const isAlreadyLoggedIn = !welcomeView.classList.contains('hidden');

    loginView.classList.add('hidden');
    welcomeView.classList.remove('hidden');

    const user = session.user;
    const fullName = user?.user_metadata?.full_name || user?.email || "";

    if (userInitialSpan && fullName) {
      userInitialSpan.textContent = fullName.charAt(0).toUpperCase();
    }
    statusMsg.textContent = "";
    await loadQuotaFromAPI(); 

    const isMenuOpen = document
      .querySelector(".dropdown-card")
      ?.classList.contains("expanded");

    if (!isAlreadyLoggedIn && !isMenuOpen) {
      navigateTo("analysis");
    }

    const settings = await loadSettings();
    applySettingsToUI(settings);
  } else {
    document.getElementById("limit-modal")?.classList.add("hidden");
    loginView.classList.remove('hidden');
    welcomeView.classList.add('hidden');
  }
}

function updateSavedActionsVisibility(count) {
  const filterToggle = document.getElementById("filter-toggle");
  const exportToggle = document.getElementById("export-menu-toggle");
  const multiSelectToggle = document.getElementById("multi-select-toggle");
  const searchToggleBtn = document.getElementById("search-toggle");

  const showBasicActions = count > 0 ? "" : "none";
  if (filterToggle) filterToggle.style.display = showBasicActions;
  if (exportToggle) exportToggle.style.display = showBasicActions;

  if (searchToggleBtn) {
    searchToggleBtn.style.display = count > 1 ? "" : "none";
  }

  if (multiSelectToggle) {
    multiSelectToggle.style.display = count > 1 ? "" : "none";
  }
}

function updateSavedEmptyState(visibleCount) {
  const emptyEl = document.getElementById("saved-empty");
  const filterEmptyEl = document.getElementById("filter-empty");

  const isFiltering = areFiltersActive();

  if (totalFilteredCount === 0 && !isFiltering) {
    emptyEl.classList.remove("hidden");
    filterEmptyEl.classList.add("hidden");
  }
  else if (totalFilteredCount === 0 && isFiltering) {
    emptyEl.classList.add("hidden");
    filterEmptyEl.classList.remove("hidden");
  }
  else {
    emptyEl.classList.add("hidden");
    filterEmptyEl.classList.add("hidden");
  }

  updateSavedActionsVisibility(visibleCount);
}

document.getElementById("start-analysis-btn")?.addEventListener("click", () => {
  navigateTo("analysis");
});

document.getElementById("no-results-reset")?.addEventListener("click", () => {
  const searchInput = document.getElementById("saved-search-input");
  if (searchInput) {
    searchInput.value = "";
    document.getElementById("clear-search-btn")?.classList.add("hidden");
  }
  activeFilters.searchQuery = "";
  
  const resetBtn = document.querySelector(".filter-reset");
  if (resetBtn) {
    resetBtn.click(); 
  }
  updateSavedEmptyState(); 
});

async function shouldAutoAnalyze() {
  const settings = await loadSettings();
  return settings.autoReanalysis;
}

function endAnalysisLoading() {
  isAnalysisLoading = false;
  const refreshBtn = document.getElementById("refreshButton");
  if (refreshBtn) {
    refreshBtn.disabled = false;
  }
}

async function extractWebsiteContent() {
  if (isUserInteracting) {
    document.getElementById("ai-loading")?.classList.add("hidden");
    endAnalysisLoading();
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    document.getElementById("ai-loading")?.classList.add("hidden");
    endAnalysisLoading();
    return;
  }

  await loadQuotaFromAPI();

  if (
    remainingToday !== null && 
    remainingToday <= 0 && 
    currentPlan === "free"
  ) {
    document.getElementById("ai-loading")?.classList.add("hidden");
    endAnalysisLoading();
    showLimitModal("analysis");
    return;
  }
  if (currentView !== "analysis") {
    document.getElementById("ai-loading")?.classList.add("hidden");
    endAnalysisLoading();
    return;
  }
  const aiCard = document.getElementById('ai-analysis');
  const contentLoading = document.getElementById('ai-loading');
  const contentError = document.getElementById('content-error');
  const contentData = document.getElementById('ai-data');

  if (contentLoading && !contentLoading.classList.contains("hidden") && !forceRefresh) {
    endAnalysisLoading();
    return;
  }

  const settings = await loadSettings();

  // Show loading state
  if (aiCard) aiCard.classList.remove('hidden');
  if (contentLoading) contentLoading.classList.remove('hidden');
  if (contentError) contentError.classList.add('hidden');
  if (contentData) contentData.classList.add('hidden');
  document.getElementById("empty-tab-view")?.classList.add('hidden');
  isAnalysisLoading = true;

  try {
    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tabs.length || !tabs[0]?.url) {
      tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    }
    
    const tab = tabs[0];

    if (!tab?.id) {
      endAnalysisLoading();
      if (contentLoading) contentLoading.classList.add('hidden');
      if (contentError) {
        contentError.innerHTML = '<div class="blocked-message"><p>Unable to access tab information.</p></div>';
        contentError.classList.remove('hidden');
      }
      return;
    }

    if (!tab.url) {
      endAnalysisLoading();
      if (contentLoading) contentLoading.classList.add('hidden');
      if (contentError) {
        contentError.innerHTML = '<div class="blocked-message"><p>Please navigate to a website to analyze.</p></div>';
        contentError.classList.remove('hidden');
      }
      return;
    }

    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("about:") ||
      tab.url.startsWith("edge://")
    ) {
      endAnalysisLoading();
      document.getElementById("ai-analysis")?.classList.add("hidden");
      document.getElementById("ai-loading")?.classList.add("hidden");
      document.getElementById("empty-tab-view")?.classList.remove("hidden");
      console.info("Empty tab or browser system page:", tab.url);
      return;
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        document.getElementById("ai-loading")?.classList.add("hidden");
        showContentBlocked("Timed out while analyzing. Please try again.");
        resolve();
      }, 15000);

      chrome.tabs.sendMessage(
        tab.id,
        { type: "EXTRACT_WEBSITE_CONTENT" },
        async (response) => {
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          endAnalysisLoading();
          showContentBlocked("Failed to extract page content. This page may not be accessible.");
          resolve();
          return;
        }
        
        if (!response) {
          endAnalysisLoading();
          showContentBlocked("No response from content script");
          resolve();
          return;
        }

        if (response?.ok && response.content) {
          const previousUrl = lastExtractedMeta?.url || null;

          lastExtractedMeta = {
            title: cleanTitle(response.content.title),
            description: response.content.metaDescription,
            url: response.content.url,
            domain: new URL(response.content.url).hostname
          };

          const currentDomain = lastExtractedMeta.domain;
          const currentUrl = lastExtractedMeta.url;
          lastContentHash = await hashContent(response.content);

          const btn = document.getElementById("saveButton");
          btn?.classList.remove("active");
          if (btn) btn.title = "Save";

          const { data: sessionData } = await supabase.auth.getSession();
          const user = sessionData?.session?.user;

          let existing = null;
          let cached = null;

          if (user) {
            const { data } = await supabase
              .from("saved_analyses")
              .select("*")
              .eq("user_id", user.id)
              .eq("domain", lastExtractedMeta.domain)
              .maybeSingle();

            existing = data;

            if (existing) {
              btn?.classList.add("active");
              if (btn) btn.title = "Remove";
            }
          }
          // Only check URL-level cache (exact same URL)
          cached = await getCachedAnalysis(currentUrl);

          try {
            const aiCard = document.getElementById('ai-analysis');
            const aiLoading = document.getElementById('ai-loading');
            const aiData = document.getElementById('ai-data');

            if (aiCard) aiCard.classList.remove('hidden');

            const reuseAllowed = settings.reanalysisMode === "content-change" && !forceRefresh;
            // Only reuse if it's the EXACT same URL
            const canReuseExisting = reuseAllowed && existing && existing.content_hash === lastContentHash && existing.url === currentUrl;
            const canReuseCached = reuseAllowed && cached && cached.meta?.url === currentUrl;
            
            const shouldReuse = canReuseExisting || canReuseCached;

            if (shouldReuse) {
              if (aiLoading) aiLoading.classList.add("hidden");
              
              if (canReuseExisting) {
                lastAnalysis = {
                  whatTheyDo: existing.what_they_do,
                  targetCustomer: existing.target_customer,
                  valueProposition: existing.value_proposition,
                  salesAngle: existing.sales_angle,
                  salesReadinessScore: existing.sales_readiness_score,
                  bestSalesPersona: {
                    persona: existing.best_sales_persona,
                    reason: existing.best_sales_persona_reason
                  },
                  recommendedOutreach: {
                    persona: existing?.recommended_outreach_persona || "",
                    goal: existing?.recommended_outreach_goal || "",
                    angle: existing?.recommended_outreach_angle || "",
                    message: existing?.recommended_outreach_message || ""
                  }
                };

                lastExtractedMeta = {
                  title: cleanTitle(existing.title),
                  description: existing.description,
                  url: existing.url,
                  domain: existing.domain
                };
              } else if (canReuseCached) {
                lastAnalysis = cached.analysis;
                lastExtractedMeta = cached.meta;
              }

              displayAIAnalysis(lastAnalysis);
              endAnalysisLoading();
              
              lastAnalyzedDomain = currentDomain;
              
              resolve();

            } else {
              const rootDomain = extractRootDomain(currentDomain);
              const lastRootDomain = lastAnalyzedDomain
                ? extractRootDomain(lastAnalyzedDomain)
                : null;

              const isNewRootDomain = !lastRootDomain || lastRootDomain !== rootDomain;
              const isNewUrl = previousUrl !== currentUrl;
              if (!forceRefresh && !isNewRootDomain && !isNewUrl) {
                if (aiLoading) aiLoading.classList.add("hidden");
                if (aiData) aiData.classList.add("hidden");
                showContentBlocked("Click the refresh button to analyze this page.");
                resolve();
                return;
              }

              if (aiLoading) aiLoading.classList.remove("hidden");
              if (aiData) aiData.classList.add("hidden");

              if (!response.content.paragraphs?.length && !response.content.headings?.length) {
                showContentBlocked("Not enough readable content to analyze.");
                resolve();
                return;
              }

            const urlObj = new URL(response.content.url);
            const isInternal = urlObj.hostname === "signalizeai.org" || urlObj.hostname === "www.signalizeai.org";
            
            // Check if this domain was already analyzed today
            const domainAnalyzedToday = await wasDomainAnalyzedToday(currentDomain);
            
            const result = await analyzeWebsiteContent(response.content, isInternal, domainAnalyzedToday);

            if (result.quota) {
              currentPlan = result.quota.plan;
              usedToday = result.quota.used_today;
              remainingToday = result.quota.remaining_today;
              dailyLimitFromAPI = result.quota.daily_limit;
              maxSavedLimit = result.quota.max_saved;
              totalSavedCount = result.quota.total_saved;
              renderQuotaBanner();
            }

            if (result.blocked) {
              document.getElementById("ai-loading")?.classList.add("hidden");
              document.getElementById("ai-data")?.classList.add("hidden");
              endAnalysisLoading();
              showLimitModal("analysis");
              resolve();
              return;
            }

            if (!result.analysis) {
              showContentBlocked("Failed to generate analysis");
              endAnalysisLoading();
              resolve();
              return;
            }

              const analysis = result.analysis;
              lastAnalysis = analysis;
              displayAIAnalysis(analysis);
              lastAnalyzedDomain = currentDomain;
              markDomainAnalyzedToday(currentDomain);

              setCachedAnalysis(currentUrl, {
                content_hash: lastContentHash,
                analysis,
                meta: lastExtractedMeta
              });
              setCachedAnalysisByDomain(currentDomain, {
                analysis,
                meta: lastExtractedMeta
              });

              if (existing) {
                await supabase
                  .from("saved_analyses")
                  .update({
                    content_hash: lastContentHash,
                    last_analyzed_at: new Date().toISOString(),
                    title: lastExtractedMeta.title,
                    description: lastExtractedMeta.description,
                    url: lastExtractedMeta.url,
                    what_they_do: analysis.whatTheyDo,
                    target_customer: analysis.targetCustomer,
                    value_proposition: analysis.valueProposition,
                    sales_angle: analysis.salesAngle,
                    sales_readiness_score: analysis.salesReadinessScore,
                    best_sales_persona: analysis.bestSalesPersona?.persona,
                    best_sales_persona_reason: analysis.bestSalesPersona?.reason,
                    recommended_outreach_persona: analysis.recommendedOutreach?.persona,
                    recommended_outreach_goal: analysis.recommendedOutreach?.goal,
                    recommended_outreach_angle: analysis.recommendedOutreach?.angle,
                    recommended_outreach_message: analysis.recommendedOutreach?.message
                  })
                  .eq("id", existing.id);
              }
              resolve();
            }
          } catch (err) {
            showContentBlocked("Failed to analyze page: " + err.message);
            endAnalysisLoading();
            resolve();
          }

        }
        else if (response?.reason === "THIN_CONTENT") {
          endAnalysisLoading();
          showContentBlocked(
            "This page has limited public content.",
            {
              allowHomepageFallback: true,
              originalUrl: tab.url
            }
          );
          resolve();
          return;
        }
        else if (response?.reason === "RESTRICTED") {
          endAnalysisLoading();
          showContentBlocked(
            "This page requires login or consent before content can be analyzed.",
            {
              allowHomepageFallback: true,
              originalUrl: tab.url
            }
          );
          resolve();
          return;
        }
        else {
          if (response.error) {
            showContentBlocked(`Error: ${response.error}`);
          } else {
            showContentBlocked("Unable to analyze this page.");
          }
        }
        resolve();
      }
    );
    });
  } catch (err) {
    endAnalysisLoading();
  }
}

async function analyzeSpecificUrl(url) {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return;

  await loadQuotaFromAPI();

  if (currentPlan === "free" && remainingToday !== null && remainingToday <= 0) {
    showLimitModal("analysis");
    return;
  }

  const contentLoading = document.getElementById('ai-loading');
  const contentError = document.getElementById('content-error');

  if (contentError) contentError.classList.add("hidden");
  if (contentLoading) contentLoading.classList.remove("hidden");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  chrome.tabs.sendMessage(
    tab.id,
    {
      type: "EXTRACT_WEBSITE_CONTENT",
      overrideUrl: url
    },
    async (response) => {
      if (contentLoading) contentLoading.classList.add("hidden");

      if (!response?.ok || !response.content) {
        showContentBlocked("Unable to analyze homepage.");
        return;
      }

      lastExtractedMeta = {
        title: cleanTitle(response.content.title),
        description: response.content.metaDescription,
        url: response.content.url,
        domain: new URL(response.content.url).hostname
      };

      lastContentHash = await hashContent(response.content);
      lastAnalyzedDomain = lastExtractedMeta.domain;
      const settings = await loadSettings();
      const reuseAllowed = settings.reanalysisMode === "content-change" && !forceRefresh;
      const cached = await getCachedAnalysis(lastAnalyzedDomain);

      if (reuseAllowed && cached) {
        lastAnalysis = cached.analysis;
        lastExtractedMeta = cached.meta;
        displayAIAnalysis(lastAnalysis);
        return;
      }

      const urlObj = new URL(response.content.url);
      const isInternal = urlObj.hostname === "signalizeai.org" || urlObj.hostname === "www.signalizeai.org";
      const result = await analyzeWebsiteContent(response.content, isInternal);

      if (result.quota) {
        currentPlan = result.quota.plan;
        usedToday = result.quota.used_today;
        remainingToday = result.quota.remaining_today;
        dailyLimitFromAPI = result.quota.daily_limit;
        maxSavedLimit = result.quota.max_saved;
        totalSavedCount = result.quota.total_saved;
        renderQuotaBanner();
      }

      if (result.blocked) {
        endAnalysisLoading();
        showLimitModal("analysis");
        return;
      }

      lastAnalysis = result.analysis;
      displayAIAnalysis(result.analysis);

      setCachedAnalysis(lastAnalyzedDomain, {
        content_hash: lastContentHash,
        analysis: result.analysis,
        meta: lastExtractedMeta
      });
    }
  );
}

function displayAIAnalysis(analysis) {
  endAnalysisLoading();
  
  const aiCard = document.getElementById('ai-analysis');
  const aiLoading = document.getElementById('ai-loading');
  const aiData = document.getElementById('ai-data');
  const refreshBtn = document.getElementById('refreshButton');

  if (aiCard) aiCard.classList.remove('hidden');
  if (aiLoading) aiLoading.classList.add('hidden');
  if (aiData) aiData.classList.remove('hidden');
  if (refreshBtn) refreshBtn.disabled = false;

  const aiTitleEl = document.getElementById('ai-title-text');
  if (aiTitleEl && lastExtractedMeta?.title) {
    aiTitleEl.textContent = lastExtractedMeta.title || '—';
  }

  const aiDescEl = document.getElementById('ai-description-text');
  if (aiDescEl && lastExtractedMeta?.description) {
    aiDescEl.textContent = lastExtractedMeta.description || '—';
  }

  const aiUrlEl = document.getElementById('ai-url-text');
  if (aiUrlEl && lastExtractedMeta?.url) {
    aiUrlEl.href = lastExtractedMeta.url;
    aiUrlEl.textContent = lastExtractedMeta.url;
  }

  const whatEl = document.getElementById('ai-what-they-do');
  const targetEl = document.getElementById('ai-target-customer');
  const valueEl = document.getElementById('ai-value-prop');
  const salesEl = document.getElementById('ai-sales-angle');
  const scoreEl = document.getElementById('ai-sales-score');
  const personaEl = document.getElementById('ai-sales-persona');
  const personaReasonEl = document.getElementById('ai-sales-persona-reason');
  const outreachPersonaEl = document.getElementById("ai-outreach-persona");
  const outreachGoalEl = document.getElementById("ai-outreach-goal");
  const outreachAngleEl = document.getElementById("ai-outreach-angle");
  const outreachMessageEl = document.getElementById("ai-outreach-message");

  if (whatEl) whatEl.textContent = analysis.whatTheyDo || '—';
  if (targetEl) targetEl.textContent = analysis.targetCustomer || '—';
  if (valueEl) valueEl.textContent = analysis.valueProposition || '—';
  if (salesEl) salesEl.textContent = analysis.salesAngle || '—';
  if (scoreEl) scoreEl.textContent = analysis.salesReadinessScore ?? '—';
  if (personaEl) personaEl.textContent =
   analysis.bestSalesPersona?.persona || 'Mid-Market AE';
  if (personaReasonEl) {
    const reason = analysis.bestSalesPersona?.reason || '';
    personaReasonEl.textContent = reason ? `(${reason})` : '—';
  }
  if (outreachPersonaEl) outreachPersonaEl.textContent = analysis.recommendedOutreach?.persona || "—";
  if (outreachGoalEl) outreachGoalEl.textContent = analysis.recommendedOutreach?.goal || "—";
  if (outreachAngleEl) outreachAngleEl.textContent = analysis.recommendedOutreach?.angle || "—";
  if (outreachMessageEl) outreachMessageEl.textContent = analysis.recommendedOutreach?.message || "—";
}

function renderSavedItem(item) {
  const wrapper = document.createElement("div");
  wrapper.dataset.salesScore = Number(item.sales_readiness_score ?? 0);
  wrapper.dataset.persona = (item.best_sales_persona || "")
    .toLowerCase()
    .trim();
  wrapper.className = "saved-item";

  wrapper.innerHTML = `
  <div class="saved-item-header">
    <div class="header-info">
      <strong>${item.title || item.domain}</strong>
      <div style="font-size:12px; opacity:0.7">${item.domain}</div>
    </div>

    <div class="header-actions">
      <button class="copy-btn copy-saved-btn" title="Copy analysis">
        <svg viewBox="0 0 24 24" class="copy-icon">
          <rect x="9" y="9" width="13" height="13" rx="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>

      <button class="delete-saved-btn" title="Remove">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
          <path d="M10 11v6"></path>
          <path d="M14 11v6"></path>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
        </svg>
      </button>
    </div>
      <input
        type="checkbox"
        class="saved-select-checkbox hidden"
        data-id="${item.id}"
        aria-label="Select saved analysis ${item.title || item.domain}"
      />
  </div>

  <div class="saved-item-body hidden">
    <p><strong>Sales readiness:</strong> ${item.sales_readiness_score ?? "—"}</p>
    <p><strong>What they do:</strong> ${item.what_they_do || "—"}</p>
    <p><strong>Target customer:</strong> ${item.target_customer || "—"}</p>
    <p><strong>Value proposition:</strong> ${item.value_proposition || "—"}</p>
    <p>
      <strong>Best sales persona:</strong> ${item.best_sales_persona || "—"}
      <span style="opacity:0.7; font-size:13px">
        ${item.best_sales_persona_reason ? `(${item.best_sales_persona_reason})` : ""}
      </span>
    </p>
    <p><strong>Sales angle:</strong> ${item.sales_angle || "—"}</p>

    <hr style="margin:10px 0; opacity:0.25" />

    <p><strong>Recommended outreach</strong></p>

    <p>
      <strong>Who:</strong>
      ${item.recommended_outreach_persona || "—"}
    </p>

    <p>
      <strong>Goal:</strong>
      ${item.recommended_outreach_goal || "—"}
    </p>

    <p>
      <strong>Angle:</strong>
      ${item.recommended_outreach_angle || "—"}
    </p>

    <p style="opacity:0.9; font-size:13px">
      <strong>Message:</strong><br />
      ${item.recommended_outreach_message || "—"}
    </p>

    <hr style="margin:8px 0; opacity:0.3" />

    <p style="opacity:0.85">
      <strong>Company overview:</strong>
      ${item.description || "—"}
    </p>

    ${
      item.url
        ? `
          <p>
            <strong>URL:</strong>
            <a
              href="${item.url}"
              target="_blank"
              class="saved-url"
            >
              ${item.url}
            </a>
          </p>
        `
        : ""
    }
  </div>
`;

  const header = wrapper.querySelector(".saved-item-header");
  const body = wrapper.querySelector(".saved-item-body");
  const checkbox = wrapper.querySelector(".saved-select-checkbox");

  const copySavedBtn = wrapper.querySelector(".copy-saved-btn");

  copySavedBtn.addEventListener("click", async (e) => {
    e.stopPropagation();

    const settings = await loadSettings();
    const formatLabel = settings.copyFormat === "short" ? "short" : "full";

    const text = await buildSavedCopyText(item);
    copyAnalysisText(text, copySavedBtn, formatLabel);
  });

  const handleSelection = (isShift, forceState = null) => {
    const items = Array.from(document.querySelectorAll("#saved-list .saved-item")).filter(i => !i.classList.contains("pending-delete"));

    const currentIndex = items.indexOf(wrapper);
    const shouldSelect = forceState !== null ? forceState : checkbox.checked;

    if (selectionMode && isShift && lastSelectedIndex !== null) {
      const [start, end] = [Math.min(lastSelectedIndex, currentIndex), Math.max(lastSelectedIndex, currentIndex)];
      isRangeSelecting = true;
      items.slice(start, end + 1).forEach(itemEl => {
        const cb = itemEl.querySelector(".saved-select-checkbox");
        if (cb) {
          cb.checked = shouldSelect;
          itemEl.classList.toggle("selected", shouldSelect);
          if (shouldSelect) selectedSavedIds.add(cb.dataset.id);
          else selectedSavedIds.delete(cb.dataset.id);
        }
      });
      isRangeSelecting = false;
    } else {
      checkbox.checked = shouldSelect;
      wrapper.classList.toggle("selected", shouldSelect);
      if (shouldSelect) selectedSavedIds.add(checkbox.dataset.id);
      else selectedSavedIds.delete(checkbox.dataset.id);
    }
    lastSelectedIndex = currentIndex;
    updateDeleteState();
    updateSelectAllIcon();
  };

  checkbox?.addEventListener("click", (e) => {
    e.stopPropagation();
    handleSelection(e.shiftKey);
  });

  wrapper.querySelector(".delete-saved-btn").addEventListener("click", (e) => {
    if (selectionMode || isUndoToastActive) return;
    e.stopPropagation();

    const itemId = item.id;
    
    wrapper.dataset.isPendingDelete = "true";
    wrapper.classList.add("pending-delete");

    pendingDeleteMap.set(itemId, {
      element: wrapper,
      finalize: async () => {
        const { data } = await supabase.auth.getSession();
        if (!data?.session?.user) return;

        await supabase
          .from("saved_analyses")
          .delete()
          .eq("user_id", data.session.user.id)
          .eq("id", itemId);

        wrapper.remove();
      }
    });

    showUndoToast();
  });

  let pressTimer;
  let preventNextClick = false;

  const startPress = (e) => {
    if (selectionMode || (e.type === "mousedown" && e.button !== 0)) return;

    const visibleItems = Array.from(document.querySelectorAll("#saved-list .saved-item"))
      .filter(item => !item.classList.contains("pending-delete") && item.dataset.isPendingDelete !== "true");

    if (visibleItems.length <= 1) return;

    preventNextClick = false;

    pressTimer = setTimeout(() => {
      enterSelectionModeFromItem();
    }, 600);
  };

  const cancelPress = () => {
    clearTimeout(pressTimer);
  };

  const enterSelectionModeFromItem = () => {
    selectionMode = true;
    preventNextClick = true;
    updateSelectionUI();
    handleSelection(false, true); 
  };

  header.addEventListener("mousedown", startPress);
  header.addEventListener("mouseup", cancelPress);
  header.addEventListener("mouseleave", cancelPress);

  header.addEventListener("touchstart", startPress, { passive: true });
  header.addEventListener("touchend", cancelPress);
  header.addEventListener("touchcancel", cancelPress);

  header.addEventListener("click", (e) => {
    if (preventNextClick) {
      e.preventDefault();
      e.stopPropagation();
      preventNextClick = false;
      return;
    }

    if (selectionMode) {
      if (e.target === checkbox) return;
      handleSelection(e.shiftKey, !checkbox.checked);
      return;
    }

    if (
      e.target.closest(".delete-saved-btn") ||
      e.target.closest(".copy-saved-btn")
    ) return;

    const container = wrapper.parentElement;
    if (container) {
      container.querySelectorAll(".saved-item-body").forEach((other) => {
        if (other !== body) other.classList.add("hidden");
      });
    }

    body.classList.toggle("hidden");
  }, true);

  return wrapper;
}

function toggleSelectAllVisible() {
  const items = Array.from(
    document.querySelectorAll("#saved-list .saved-item")
  ).filter(item => !item.classList.contains("pending-delete"));

  if (!items.length) return;

  const selectedCount = items.filter(item => item.querySelector(".saved-select-checkbox")?.checked).length;
  
  const shouldSelectAll = selectedCount < items.length;

  items.forEach(item => {
    const cb = item.querySelector(".saved-select-checkbox");
    if (!cb) return;

    if (cb.checked !== shouldSelectAll) {
      cb.checked = shouldSelectAll;
      const wrapper = item.closest('.saved-item');
      wrapper.classList.toggle("selected", shouldSelectAll);
      if (shouldSelectAll) selectedSavedIds.add(cb.dataset.id);
      else selectedSavedIds.delete(cb.dataset.id);
    }
  });

  updateDeleteState();
  updateSelectAllIcon();
}

function updateSelectAllIcon() {
  if (!selectAllBtn || !selectionMode) return;

  const items = Array.from(
    document.querySelectorAll("#saved-list .saved-item")
  ).filter(item => !item.classList.contains("pending-delete"));

  if (!items.length) {
    selectAllBtn.innerHTML = SELECT_ALL_ICON;
    return;
  }

  const selectedCount = items.filter(item => {
    const cb = item.querySelector(".saved-select-checkbox");
    return cb?.checked;
  }).length;

  const allSelected = selectedCount === items.length;
  const noneSelected = selectedCount === 0;
  const isIndeterminate = selectedCount > 0 && selectedCount < items.length;

  if (allSelected) {
    selectAllBtn.innerHTML = DESELECT_ALL_ICON;
    selectAllBtn.title = "Deselect all";
  } else if (isIndeterminate) {
    selectAllBtn.innerHTML = INDETERMINATE_ICON;
    selectAllBtn.title = "Select all";
  } else {
    selectAllBtn.innerHTML = SELECT_ALL_ICON;
    selectAllBtn.title = "Select all";
  }
}

function exportToCSV(rows) {
  if (!rows.length) return;

  const headers = [
    "Title",
    "Domain",
    "URL",
    "Description",
    "Sales Readiness Score",
    "What They Do",
    "Target Customer",
    "Value Proposition",
    "Best Sales Persona",
    "Persona Reason",
    "Sales Angle",
    "Outreach Persona",
    "Outreach Goal",
    "Outreach Angle",
    "Outreach Message",
    "Saved At"
  ];

  const csvRows = [
    headers.join(","),
    ...rows.map(item => [
      item.title,
      item.domain,
      item.url,
      `"${item.description || ""}"`,
      item.sales_readiness_score,
      `"${item.what_they_do || ""}"`,
      `"${item.target_customer || ""}"`,
      `"${item.value_proposition || ""}"`,
      item.best_sales_persona,
      `"${item.best_sales_persona_reason || ""}"`,
      `"${item.sales_angle || ""}"`,
      item.recommended_outreach_persona,
      `"${item.recommended_outreach_goal || ""}"`,
      `"${item.recommended_outreach_angle || ""}"`,
      `"${item.recommended_outreach_message || ""}"`,
      item.created_at
    ].join(","))
  ];

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "signalizeai_saved_analyses.csv";
  a.click();

  URL.revokeObjectURL(url);
}

async function exportToExcel(rows) {
  if (!rows.length) return;

  const { default: ExcelJS } = await import(
    "exceljs/dist/exceljs.min.js"
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Saved Analyses");

  sheet.columns = [
    { header: "Title", key: "title", width: 30 },
    { header: "Domain", key: "domain", width: 22 },
    { header: "URL", key: "url", width: 35 },
    { header: "Description", key: "description", width: 40 },
    { header: "Sales Readiness", key: "sales_readiness_score", width: 18 },
    { header: "What They Do", key: "what_they_do", width: 35 },
    { header: "Target Customer", key: "target_customer", width: 30 },
    { header: "Value Proposition", key: "value_proposition", width: 35 },
    { header: "Best Sales Persona", key: "best_sales_persona", width: 22 },
    { header: "Persona Reason", key: "best_sales_persona_reason", width: 30 },
    { header: "Sales Angle", key: "sales_angle", width: 35 },
    { header: "Outreach Persona", key: "recommended_outreach_persona", width: 24 },
    { header: "Outreach Goal", key: "recommended_outreach_goal", width: 30 },
    { header: "Outreach Angle", key: "recommended_outreach_angle", width: 35 },
    { header: "Outreach Message", key: "recommended_outreach_message", width: 45 },
    { header: "Saved At", key: "created_at", width: 22 }
  ];

  rows.forEach(item => sheet.addRow(item));

  sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "signalizeai_saved_analyses.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

async function loadSavedAnalyses() {
  currentPage = 1;
  exitSelectionMode();
  lastSelectedIndex = null;

  const listEl = document.getElementById("saved-list");
  const loadingEl = document.getElementById("saved-loading");
  const emptyEl = document.getElementById("saved-empty");

  listEl.innerHTML = "";
  loadingEl.classList.remove("hidden");
  emptyEl.classList.add("hidden");

  await fetchAndRenderPage();
}

async function fetchAndRenderPage() {
  const listEl = document.getElementById("saved-list");
  const loadingEl = document.getElementById("saved-loading");

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  loadingEl.classList.remove("hidden");
  listEl.innerHTML = "";

  let countQuery = supabase
    .from("saved_analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (activeFilters.minScore > 0)
    countQuery = countQuery.gte("sales_readiness_score", activeFilters.minScore);

  if (activeFilters.maxScore < 100)
    countQuery = countQuery.lte("sales_readiness_score", activeFilters.maxScore);

  if (activeFilters.persona)
    countQuery = countQuery.ilike("best_sales_persona", activeFilters.persona);

  if (activeFilters.searchQuery) {
    const q = `%${activeFilters.searchQuery}%`;
    countQuery = countQuery.or(`title.ilike.${q},domain.ilike.${q}`);
  }

  const { count, error: countError } = await countQuery;

  if (countError) {
    console.error(countError);
    loadingEl.classList.add("hidden");
    return;
  }

  totalFilteredCount = count || 0;

  let dataQuery = supabase
    .from("saved_analyses")
    .select(`
      *,
      recommended_outreach_persona,
      recommended_outreach_goal,
      recommended_outreach_angle,
      recommended_outreach_message
    `)
    .eq("user_id", user.id);

  if (activeFilters.minScore > 0)
    dataQuery = dataQuery.gte("sales_readiness_score", activeFilters.minScore);
  if (activeFilters.maxScore < 100)
    dataQuery = dataQuery.lte("sales_readiness_score", activeFilters.maxScore);
  if (activeFilters.persona)
    dataQuery = dataQuery.ilike("best_sales_persona", activeFilters.persona);
  if (activeFilters.searchQuery) {
    const q = `%${activeFilters.searchQuery}%`;
    dataQuery = dataQuery.or(`title.ilike.${q},domain.ilike.${q}`);
  }

  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let sortColumn = "created_at";
  let sortAsc = false;

  switch (activeFilters.sort) {
    case "created_at_asc":
      sortColumn = "created_at";
      sortAsc = true;
      break;

    case "created_at_desc":
      sortColumn = "created_at";
      sortAsc = false;
      break;

    case "last_analyzed_at_desc":
      sortColumn = "last_analyzed_at";
      sortAsc = false;
      break;

    case "sales_readiness_score_desc":
      sortColumn = "sales_readiness_score";
      sortAsc = false;
      break;

    case "sales_readiness_score_asc":
      sortColumn = "sales_readiness_score";
      sortAsc = true;
      break;

    case "domain_asc":
      sortColumn = "title";
      sortAsc = true;
      break;

    case "domain_desc":
      sortColumn = "title";
      sortAsc = false;
      break;
  }

  const { data, error } = await dataQuery
    .order(sortColumn, { ascending: sortAsc })
    .range(from, to);

  loadingEl.classList.add("hidden");

  if (error) {
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    updateSavedEmptyState(0);
    renderPagination(0);
    return;
  }

  data.forEach(row => {
    listEl.appendChild(renderSavedItem(row));
  });

  updateSavedEmptyState(data.length);
  renderPagination(Math.ceil(totalFilteredCount / PAGE_SIZE));
  updateFilterBanner();
}

function renderPagination(totalPages) {
  const bar = document.getElementById("pagination-bar");
  const container = document.getElementById("page-numbers");

  if (!bar || !container) return;

  container.innerHTML = "";

  if (totalPages <= 1) {
    bar.classList.add("hidden");
    return;
  }

  bar.classList.remove("hidden");

  const maxVisible = 5;

  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, currentPage + 2);

  if (end - start < maxVisible - 1) {
    if (start === 1) {
      end = Math.min(totalPages, start + maxVisible - 1);
    } else if (end === totalPages) {
      start = Math.max(1, end - maxVisible + 1);
    }
  }

  if (start > 1) {
    container.appendChild(makePageBtn(1));
    if (start > 2) container.appendChild(makeEllipsis());
  }

  for (let i = start; i <= end; i++) {
    container.appendChild(makePageBtn(i));
  }

  if (end < totalPages) {
    if (end < totalPages - 1) container.appendChild(makeEllipsis());
    container.appendChild(makePageBtn(totalPages));
  }
}

async function fetchSavedAnalysesData() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from("saved_analyses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data;
}

function areFiltersActive() {
  return (
    activeFilters.minScore > 0 ||
    activeFilters.maxScore < 100 ||
    activeFilters.persona !== "" ||
    (activeFilters.searchQuery && activeFilters.searchQuery.length > 0) ||
    activeFilters.sort !== "created_at_desc"
  );
}

function updateFilterBanner() {
  const banner = document.getElementById("active-filter-banner");
  const text = document.getElementById("filter-banner-text");

  if (!banner || !text) return;

  const isFiltering = areFiltersActive();
  const isNoResults = totalFilteredCount === 0;
  const searchOpen = !searchContainer.classList.contains("hidden");

  if (isFiltering && !isNoResults) {
    const shownSoFar = Math.min(
      currentPage * PAGE_SIZE,
      totalFilteredCount
    );

    banner.classList.remove("hidden");
    text.textContent = formatResultsText(shownSoFar, totalFilteredCount);
  } else {
    banner.classList.add("hidden");
  }
}

function makePageBtn(page) {
  const btn = document.createElement("button");
  btn.textContent = page;
  btn.className = "page-number" + (page === currentPage ? " active" : "");
  btn.onclick = async () => {
    currentPage = page;
    await fetchAndRenderPage();
  };
  return btn;
}

function makeEllipsis() {
  const span = document.createElement("span");
  span.textContent = "…";
  span.className = "page-ellipsis";
  return span;
}

document.getElementById("page-prev")?.addEventListener("click", async () => {
  if (currentPage > 1) {
    currentPage--;
    await fetchAndRenderPage();
  }
});

document.getElementById("page-next")?.addEventListener("click", async () => {
  const totalPages = Math.ceil(totalFilteredCount / PAGE_SIZE);
  if (currentPage < totalPages) {
    currentPage++;
    await fetchAndRenderPage();
  }
});

if (signInBtn) signInBtn.addEventListener('click', signInWithGoogle);
if (signOutBtn) signOutBtn.addEventListener('click', signOut);

const dropdownHeader = document.getElementById('dropdown-header');
const dropdownCard = document.querySelector('.dropdown-card');

if (dropdownHeader && dropdownCard) {
  dropdownHeader.addEventListener('click', (e) => {
    e.stopPropagation();

    const isOpening = !dropdownCard.classList.contains("expanded");

    if (isOpening) {
      dropdownOpenedAt = Date.now();
      isUserInteracting = true;
    }

    dropdownCard.classList.toggle('expanded');
  });
}

const homeTitle = document.querySelector(
  "#welcome-view .user-name-text"
);

homeTitle?.addEventListener("click", (e) => {
  e.stopPropagation();
  navigateTo("analysis");
});

document.addEventListener("click", (e) => {
  if (!dropdownCard) return;
  if (isAnalysisLoading) return;

  if (Date.now() - dropdownOpenedAt < 150) return;

  if (
    dropdownCard.classList.contains("expanded") &&
    !dropdownCard.contains(e.target)
  ) {
    dropdownCard.classList.remove("expanded");
    isUserInteracting = false;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TAB_CHANGED") {
    if (isUserInteracting || isMenuOpen()) return;
    shouldAutoAnalyze().then(enabled => {
      if (!enabled) return;

      supabase.auth.getSession().then(({ data }) => {
        if (currentView === "analysis") {
          setTimeout(extractWebsiteContent, 100);
        }
      });
    });
  }
});

document.addEventListener('visibilitychange', () => {
  if (isUserInteracting || isMenuOpen()) return;
  if (!document.hidden) {
    shouldAutoAnalyze().then(enabled => {
      if (!enabled) return;

      supabase.auth.getSession().then(({ data }) => {
        if (currentView === "analysis") {
          setTimeout(extractWebsiteContent, 100);
        }
      });
    });
  }
});

function isMenuOpen() {
  return document.querySelector(".dropdown-card")?.classList.contains("expanded");
}

const button = document.getElementById("saveButton");

button?.addEventListener("click", async () => {
  if (!lastAnalysis || !lastExtractedMeta) return;
  await loadQuotaFromAPI();

  if (!button.classList.contains("active") && totalSavedCount >= maxSavedLimit) {
    showLimitModal("save");
    return;
  }

  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return;

  const domain = lastExtractedMeta.domain;

  if (button.classList.contains("active")) {
    const { error } = await supabase
      .from("saved_analyses")
      .delete()
      .eq("user_id", user.id)
      .eq("domain", domain);

    if (error) {
      console.error("Failed to delete:", error);
      return;
    }

    button.classList.remove("active");
    button.title = "Save";
    loadSavedAnalyses();
    await loadQuotaFromAPI();
  } else {
    const { error } = await supabase.from("saved_analyses").insert({
      user_id: user.id,
      domain: lastExtractedMeta.domain,
      url: lastExtractedMeta.url,
      title: lastExtractedMeta.title,
      description: lastExtractedMeta.description,
      content_hash: lastContentHash,
      last_analyzed_at: new Date().toISOString(),
      what_they_do: lastAnalysis.whatTheyDo,
      target_customer: lastAnalysis.targetCustomer,
      value_proposition: lastAnalysis.valueProposition,
      sales_angle: lastAnalysis.salesAngle,
      sales_readiness_score: lastAnalysis.salesReadinessScore,
      best_sales_persona: lastAnalysis.bestSalesPersona?.persona,
      best_sales_persona_reason: lastAnalysis.bestSalesPersona?.reason,
      recommended_outreach_persona: lastAnalysis.recommendedOutreach?.persona,
      recommended_outreach_goal: lastAnalysis.recommendedOutreach?.goal,
      recommended_outreach_angle: lastAnalysis.recommendedOutreach?.angle,
      recommended_outreach_message: lastAnalysis.recommendedOutreach?.message
    });

    if (error) {
      console.error("Failed to save:", error);
      return;
    }

    button.classList.add("active");
    button.title = "Remove";
    loadSavedAnalyses();
    await loadQuotaFromAPI();
  }
});

settingsMenu?.addEventListener("click", (e) => {
  e.preventDefault();
  navigateTo("settings");
});

const autoReanalysisCheckbox = document.getElementById("setting-auto-reanalysis");

autoReanalysisCheckbox?.addEventListener("change", async (e) => {
  const autoReanalysis = e.target.checked;

  saveSettings({ autoReanalysis });

  const settings = await loadSettings();
  updateReanalysisUI(settings);
});

const refreshBtn = document.getElementById("refreshButton");

// Initialize refresh button as disabled
if (refreshBtn) {
  refreshBtn.disabled = true;
}

refreshBtn?.addEventListener("click", async () => {
  if (currentView !== "analysis") return;
  if (!lastExtractedMeta || refreshBtn.disabled) return;

  refreshBtn.disabled = true;
  forceRefresh = true;

  document.getElementById("ai-analysis")?.classList.remove("hidden");
  document.getElementById("content-error")?.classList.add("hidden");
  document.getElementById("ai-data")?.classList.add("hidden");
  document.getElementById("ai-loading")?.classList.remove("hidden");

  try {
    await extractWebsiteContent();
  } finally {
    forceRefresh = false;
    refreshBtn.disabled = false;
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  updateUI(session);
});

supabase.auth.getSession().then(({ data }) => {
  updateUI(data.session);
});

const dropdownMenu = document.getElementById("menu-saved-analyses");

dropdownMenu?.addEventListener("click", (e) => {
  e.preventDefault();
  navigateTo("saved");
});

const subscriptionMenu = document.getElementById("menu-subscription");

subscriptionMenu?.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "https://signalizeai.org/pricing" });
});

document.getElementById("export-csv")?.addEventListener("click", async () => {
  const data = await fetchSavedAnalysesData();
  exportToCSV(data);
});

document.getElementById("export-xlsx")?.addEventListener("click", async () => {
  const data = await fetchSavedAnalysesData();
  exportToExcel(data);
});

const exportToggle = document.getElementById("export-menu-toggle");
const exportMenu = document.getElementById("export-menu");

exportToggle?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  exportMenu?.classList.toggle("hidden");
  const expanded = exportToggle.getAttribute("aria-expanded") === "true";
  exportToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
});

document.addEventListener("click", () => {
  if (!exportMenu?.classList.contains("hidden")) {
    exportMenu.classList.add("hidden");
    exportToggle?.setAttribute("aria-expanded", "false");
  }
});

async function buildCopyText() {
  if (!lastAnalysis || !lastExtractedMeta) return "";

  const settings = await loadSettings();
  const isShort = settings.copyFormat === "short";

  let text = `
Website: ${lastExtractedMeta.title || ""}
Domain: ${lastExtractedMeta.domain || ""}
URL: ${lastExtractedMeta.url || ""}

What they do:
${lastAnalysis.whatTheyDo || "—"}

Target customer:
${lastAnalysis.targetCustomer || "—"}

Sales readiness score:
${lastAnalysis.salesReadinessScore ?? "—"}
`.trim();

  if (!isShort) {
    text += `

Value proposition:
${lastAnalysis.valueProposition || "—"}

Sales angle:
${lastAnalysis.salesAngle || "—"}

Best sales persona:
${lastAnalysis.bestSalesPersona?.persona || "—"}
${lastAnalysis.bestSalesPersona?.reason ? `(${lastAnalysis.bestSalesPersona.reason})` : ""}

Recommended outreach:
Who: ${lastAnalysis.recommendedOutreach?.persona || "—"}
Goal: ${lastAnalysis.recommendedOutreach?.goal || "—"}
Angle: ${lastAnalysis.recommendedOutreach?.angle || "—"}
Message:
${lastAnalysis.recommendedOutreach?.message || "—"}
`;
  }

  return text.trim();
}

async function buildSavedCopyText(item) {
  const settings = await loadSettings();
  const isShort = settings.copyFormat === "short";

  let text = `
Website: ${item.title || ""}
Domain: ${item.domain || ""}
URL: ${item.url || ""}

What they do:
${item.what_they_do || "—"}

Target customer:
${item.target_customer || "—"}

Sales readiness score:
${item.sales_readiness_score ?? "—"}
`.trim();

  if (!isShort) {
    text += `

Value proposition:
${item.value_proposition || "—"}

Sales angle:
${item.sales_angle || "—"}

Best sales persona:
${item.best_sales_persona || "—"}
${item.best_sales_persona_reason ? `(${item.best_sales_persona_reason})` : ""}

Recommended outreach:
Who: ${item.recommended_outreach_persona || "—"}
Goal: ${item.recommended_outreach_goal || "—"}
Angle: ${item.recommended_outreach_angle || "—"}
Message:
${item.recommended_outreach_message || "—"}
`;
  }

  return text.trim();
}

function exitSelectionMode() {
  selectionMode = false;
  selectedSavedIds.clear();
  lastSelectedIndex = null;
  if (selectAllBtn) {
    selectAllBtn.innerHTML = SELECT_ALL_ICON;
    selectAllBtn.title = "Select all";
  }

  document.querySelectorAll(".saved-item.selected")
    .forEach(el => el.classList.remove("selected"));

  const visibleCount = Array.from(document.querySelectorAll("#saved-list .saved-item"))
    .filter(item => !item.classList.contains("pending-delete")).length;
  updateSelectionUI();
  updateDeleteState();
  updateSavedActionsVisibility(visibleCount);
}

function updateSelectionUI() {
  document.querySelectorAll(".saved-item").forEach(item =>
    toggleItemSelectionUI(item, selectionMode)
  );

  if (exportToggle) {
    exportToggle.classList.toggle("hidden", selectionMode);
  }

  if (filterToggle) {
    filterToggle.classList.toggle("hidden", selectionMode);
  }

  if (selectionBackBtn) {
    selectionBackBtn.classList.toggle("hidden", !selectionMode);
  }

  if (selectAllBtn) {
    selectAllBtn.classList.toggle("hidden", !selectionMode);

    if (selectionMode) {
      updateSelectAllIcon();
    }
  }

  const countIndicator = document.getElementById("selection-count-indicator");

  if (countIndicator) {
    if (!selectionMode) {
      countIndicator.classList.add("hidden");
    } else {
      updateDeleteState();
    }
  }

  if (!multiSelectToggle) return;

  if (selectionMode) {
    multiSelectToggle.title = "Delete selected";
    multiSelectToggle.setAttribute("aria-label", "Delete selected analyses");
    multiSelectToggle.innerHTML = `
      <svg
        class="multi-select-icon danger"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
      </svg>
    `;
  } else {
    multiSelectToggle.title = "Select multiple";
    multiSelectToggle.setAttribute("aria-label", "Select multiple analyses");
    multiSelectToggle.innerHTML = `
      <svg
        class="multi-select-icon"
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
        <path d="M9 12l2 2 4-4"></path>
      </svg>
    `;
  }
}

function toggleItemSelectionUI(itemEl, enable) {
  const checkbox = itemEl.querySelector(".saved-select-checkbox");
  const copyBtn = itemEl.querySelector(".copy-saved-btn");
  const deleteBtn = itemEl.querySelector(".delete-saved-btn");

  if (enable) {
    checkbox?.classList.remove("hidden");
    copyBtn?.classList.add("hidden");
    deleteBtn?.classList.add("hidden");
  } else {
    if (checkbox) checkbox.checked = false;
    checkbox?.classList.add("hidden");
    copyBtn?.classList.remove("hidden");
    deleteBtn?.classList.remove("hidden");
  }
}

function copyAnalysisText(text, anchorEl, formatLabel = "") {
  if (!text || !anchorEl) return;

  navigator.clipboard.writeText(text).then(() => {
    const existingTooltip = anchorEl.querySelector(".copy-tooltip");
    if (existingTooltip) existingTooltip.remove();

    const tooltip = document.createElement("span");
    tooltip.className = "copy-tooltip";
    tooltip.textContent = formatLabel
      ? `Copied (${formatLabel})`
      : "Copied";

    Object.assign(tooltip.style, {
      position: "absolute",
      top: "-28px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.85)",
      color: "#fff",
      fontSize: "11px",
      padding: "4px 6px",
      borderRadius: "4px",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      zIndex: "9999"
    });

    anchorEl.style.position = "relative";
    anchorEl.appendChild(tooltip);

    setTimeout(() => tooltip.remove(), 1200);
  }).catch(err => {
    console.error("Copy failed:", err);
  });
}

const copyBtn = document.getElementById("copyButton");

copyBtn?.addEventListener("click", async () => {
  const settings = await loadSettings();
  const formatLabel = settings.copyFormat === "short" ? "short" : "full";

  const text = await buildCopyText();
  copyAnalysisText(text, copyBtn, formatLabel);
});

document.querySelectorAll('input[name="copy-format"]').forEach(radio => {
  radio.addEventListener("change", (e) => {
    saveSettings({ copyFormat: e.target.value });
  });
});

const clearCacheBtn = document.getElementById("clear-cache-btn");

clearCacheBtn?.addEventListener("click", async () => {
  // Clear local state
  lastAnalysis = null;
  lastContentHash = null;
  lastExtractedMeta = null;
  lastAnalyzedDomain = null;

  chrome.storage.local.clear();

  const originalText = clearCacheBtn.textContent;
  clearCacheBtn.textContent = "Cleared";
  clearCacheBtn.classList.add("cleared");

  setTimeout(() => {
    clearCacheBtn.textContent = originalText;
    clearCacheBtn.classList.remove("cleared");
  }, 1200);
});

const profileMenuItem = document.getElementById("menu-profile");
const profileView = document.getElementById("profile-view");

profileMenuItem?.addEventListener("click", async (e) => {
  e.preventDefault();
  navigateTo("profile");

  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;

  if (user) {
    document.getElementById("profile-name").textContent =
      user.user_metadata?.full_name || "—";

    document.getElementById("profile-email").textContent =
      user.email || "—";
  }
});

const filterToggle = document.getElementById("filter-toggle");
const filterPanel = document.getElementById("filter-panel");
const exportToggleBtn = document.getElementById("export-menu-toggle");

filterToggle?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  // Close export menu if open
  document.getElementById("export-menu")?.classList.add("hidden");
  exportToggleBtn?.setAttribute("aria-expanded", "false");

  filterPanel?.classList.toggle("hidden");

  const expanded = filterToggle.getAttribute("aria-expanded") === "true";
  filterToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
});

document.addEventListener("click", (e) => {
  if (!filterPanel || filterPanel.classList.contains("hidden")) return;

  if (
    !filterPanel.contains(e.target) &&
    !filterToggle.contains(e.target)
  ) {
    filterPanel.classList.add("hidden");
    filterToggle.setAttribute("aria-expanded", "false");
  }
});

multiSelectToggle?.addEventListener("click", async () => {
  if (isUndoToastActive) return;
  if (multiSelectToggle.classList.contains("disabled")) return;

  if (!selectionMode) {
    selectionMode = true;
    selectedSavedIds.clear();
    updateSelectionUI();
    updateDeleteState();
    return;
  }

  if (selectedSavedIds.size === 0) return;

  const idsToDelete = Array.from(selectedSavedIds);
  const elementsToFlag = [];

  document.querySelectorAll(".saved-item").forEach(el => {
    const cb = el.querySelector(".saved-select-checkbox");
    if (cb && idsToDelete.includes(cb.dataset.id)) {
      el.dataset.isPendingDelete = "true";
      el.classList.add("pending-delete");
      elementsToFlag.push(el);
    }
  });

  exitSelectionMode();

  idsToDelete.forEach(id => {
    const el = document.querySelector(`.saved-select-checkbox[data-id="${id}"]`)?.closest(".saved-item");
    if (!el) return;

    pendingDeleteMap.set(id, {
      element: el,
      finalize: async () => {
        const { data } = await supabase.auth.getSession();
        if (!data?.session?.user) return;
        await supabase
          .from("saved_analyses")
          .delete()
          .eq("user_id", data.session.user.id)
          .eq("id", id);
        el.remove();
      }
    });
  });
  showUndoToast(); 
});

const filterApplyBtn = document.querySelector(".filter-apply");

filterApplyBtn?.addEventListener("click", async () => {
  activeFilters.minScore = Number(document.getElementById("filter-min-score")?.value || 0);
  activeFilters.maxScore = Number(document.getElementById("filter-max-score")?.value || 100);

  activeFilters.persona =
    document.getElementById("filter-persona")?.value
      .toLowerCase()
      .trim();

  const sortValue = document.querySelector('input[name="sort"]:checked')?.value;
  if (sortValue) {
    activeFilters.sort = sortValue;
  }

  currentPage = 1;
  filterPanel?.classList.add("hidden");
  filterToggle?.setAttribute("aria-expanded", "false");

  await fetchAndRenderPage();
  updateFilterBanner();
});

const filterResetBtn = document.querySelector(".filter-reset");

filterResetBtn?.addEventListener("click", async () => {
  activeFilters.minScore = 0;
  activeFilters.maxScore = 100;
  activeFilters.persona = "";
  activeFilters.searchQuery = "";
  activeFilters.sort = "created_at_desc";

  if (minSlider) minSlider.value = 0;
  if (maxSlider) maxSlider.value = 100;
  if (personaInput) personaInput.value = "";
  if (scoreLabel) scoreLabel.textContent = `0 – 100`;

  document.querySelector('input[name="sort"][value="created_at_desc"]')?.click();

  filterPanel?.classList.add("hidden");
  filterToggle?.setAttribute("aria-expanded", "false");

  await fetchAndRenderPage();
  updateFilterBanner();
});

const minSlider = document.getElementById("filter-min-score");
const maxSlider = document.getElementById("filter-max-score");
const scoreLabel = document.getElementById("filter-score-value");
const personaInput = document.getElementById("filter-persona");

function updateScoreFilter() {
  let minVal = Number(minSlider.value);
  let maxVal = Number(maxSlider.value);

  if (minVal > maxVal) {
    minSlider.value = maxVal;
    minVal = maxVal;
  }

  activeFilters.minScore = minVal;
  activeFilters.maxScore = maxVal;

  if (scoreLabel) {
    scoreLabel.textContent = `${minVal} – ${maxVal}`;
  }
}

minSlider?.addEventListener("input", updateScoreFilter);
maxSlider?.addEventListener("input", updateScoreFilter);

selectionBackBtn?.addEventListener("click", () => {
  exitSelectionMode();
});

document.addEventListener("keydown", (e) => {
  if (!selectionMode) return;

  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const selectAllKey = isMac ? e.metaKey : e.ctrlKey;

  if (selectAllKey && e.key.toLowerCase() === "a") {
    e.preventDefault();
    toggleSelectAllVisible();
  }
});

selectAllBtn?.addEventListener("click", () => {
  if (!selectionMode) return;
  toggleSelectAllVisible();
});

let pendingDeleteMap = new Map();
let undoTimer = null;

function showUndoToast() {
  isUndoToastActive = true;
  document.body.classList.add("undo-active");
  let toast = document.getElementById("undo-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "undo-toast";
    toast.className = "toast-snackbar";
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-main">
        <span id="toast-message"></span>
      </div>
      <div class="toast-actions">
        <button id="undo-button">UNDO</button>
        <button id="close-toast-btn">✕</button>
      </div>
    </div>
    <div class="undo-progress-container">
      <div class="undo-progress-bar"></div>
    </div>
  `;

  document.getElementById("toast-message").textContent =
    `${pendingDeleteMap.size} item(s) deleted`;

  toast.classList.add("show");

  const undoBtn = document.getElementById("undo-button");
  const closeBtn = document.getElementById("close-toast-btn");

  undoBtn.onclick = () => {
    isUndoToastActive = false;
    document.body.classList.remove("undo-active");
    clearTimeout(undoTimer);
    toast.classList.remove("show");

    pendingDeleteMap.forEach(({ element }) => {
      delete element.dataset.isPendingDelete;
      element.classList.remove("pending-delete");
    });

    pendingDeleteMap.clear();
    updateSavedEmptyState();
  };

  closeBtn.onclick = finalizePendingDeletes;

  clearTimeout(undoTimer);
  undoTimer = setTimeout(finalizePendingDeletes, 5000);
}

function formatResultsText(shown, total) {
  if (total === 0) return "";

  if (total <= PAGE_SIZE) {
    return total === 1
      ? "1 result found"
      : `${total} results found`;
  }

  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, total);

  return `Showing ${start}–${end} of ${total}`;
}

async function finalizePendingDeletes() {
  if (isFinalizingDeletes) return;
  isFinalizingDeletes = true;

  clearTimeout(undoTimer);
  const toast = document.getElementById("undo-toast");
  toast?.classList.remove("show");

  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) {
    isFinalizingDeletes = false;
    return;
  }

  while (pendingDeleteMap.size > 0) {
    const batch = Array.from(pendingDeleteMap.values());
    pendingDeleteMap.clear();

    for (const item of batch) {
      try {
        await item.finalize();
      } catch (err) {
        console.error("Delete failed:", err);
      }
    }
  }

  isFinalizingDeletes = false;
  isUndoToastActive = false;
  document.body.classList.remove("undo-active");
  await fetchAndRenderPage();
  updateFilterBanner();
  await loadQuotaFromAPI();
}

const searchToggle = document.getElementById("search-toggle");
const searchContainer = document.getElementById("search-bar-container");
const searchInput = document.getElementById("saved-search-input");
const searchCloseBtn = document.getElementById("search-close-btn");

async function toggleSearchMode(active) {
  if (isUndoToastActive) return;
  const filterBtn = document.getElementById("filter-toggle");
  const exportBtn = document.getElementById("export-menu-toggle");
  const multiBtn = document.getElementById("multi-select-toggle");
  const searchToggleButton = document.getElementById("search-toggle");

  if (active) {
    searchContainer.classList.remove("hidden");
    
    searchToggleButton?.classList.add("hidden"); 
    
    filterBtn?.classList.add("hidden");
    exportBtn?.classList.add("hidden");
    multiBtn?.classList.add("hidden");
    searchInput.focus();
  } else {
    searchContainer.classList.add("hidden");
    
    searchToggleButton?.classList.remove("hidden"); 
    
    filterBtn?.classList.remove("hidden");
    exportBtn?.classList.remove("hidden");
    updateSavedEmptyState(); 
    
    searchInput.value = "";
    activeFilters.searchQuery = "";
    await fetchAndRenderPage();
    updateFilterBanner();
  }
}

searchToggle?.addEventListener("click", () => toggleSearchMode(true));
searchCloseBtn?.addEventListener("click", () => toggleSearchMode(false));

searchInput?.addEventListener("input", async (e) => {
  const val = e.target.value.toLowerCase().trim();
  
  activeFilters.searchQuery = val;
  
  const clearBtn = document.getElementById("clear-search-btn");
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", val === "");
  }

  await fetchAndRenderPage();
  updateFilterBanner();
});

document.getElementById("clear-search-btn")?.addEventListener("click", () => {
  searchInput.value = "";
  activeFilters.searchQuery = "";
  searchInput.focus();
});

document.getElementById("reset-filters-link")?.addEventListener("click", async () => {
  activeFilters.minScore = 0;
  activeFilters.maxScore = 100;
  activeFilters.persona = "";
  activeFilters.searchQuery = "";
  activeFilters.sort = "created_at_desc";

  if (minSlider) minSlider.value = 0;
  if (maxSlider) maxSlider.value = 100;
  if (personaInput) personaInput.value = "";
  if (scoreLabel) scoreLabel.textContent = "0 – 100";

  if (searchInput) searchInput.value = "";

  document.querySelector('input[name="sort"][value="created_at_desc"]')?.click();

  currentPage = 1;
  await fetchAndRenderPage();
  updateFilterBanner();
});

async function openCheckout(variantId) {
  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) return;

  const email = data.session.user.email;
  const userId = data.session.user.id;

  const checkoutUrl =
    `https://signalizeaipay.lemonsqueezy.com/checkout/buy/${variantId}` +
    `?checkout[email]=${encodeURIComponent(email)}` +
    `&checkout[custom][user_id]=${encodeURIComponent(userId)}` +
    `&media=0&discount=0`;

  chrome.tabs.create({ url: checkoutUrl });
}

function showLimitModal(type) {
  const modal = document.getElementById("limit-modal");
  const msgEl = document.getElementById("limit-modal-message");
  const headerEl = modal?.querySelector(".modal-header h3");
  const proBtn = document.getElementById("modal-upgrade-pro-btn");
  const teamBtn = document.getElementById("modal-upgrade-team-btn");
  
  if (!modal || !msgEl) return;

  let message = "";
  let title = "Limit Reached";

  if (type === "save") {
    message = `You've reached your limit of ${maxSavedLimit} saved items. Upgrade to increase it.`;
  } else if (type === "analysis") {
    message = `You've used all ${dailyLimitFromAPI} analyses for today. Upgrade to increase your limit.`;
  } else {
    title = "Upgrade Plan";
    message = "Unlock higher limits and advanced features by upgrading your plan.";
  }

  if (headerEl) headerEl.textContent = title;
  msgEl.textContent = message;
  modal.classList.remove("hidden");
  
  if (currentPlan === "pro") {
    if (proBtn) proBtn.classList.add("hidden");
    if (teamBtn) teamBtn.textContent = "Upgrade to Team";
  } else {
    if (proBtn) proBtn.classList.remove("hidden");
    if (proBtn) proBtn.textContent = "Upgrade to Pro";
    if (teamBtn) teamBtn.textContent = "Upgrade to Team";
  }
}

document.getElementById("modal-close-btn")?.addEventListener("click", () => {
  document.getElementById("limit-modal").classList.add("hidden");
});

document.getElementById("modal-upgrade-pro-btn")?.addEventListener("click", () => {
  document.getElementById("limit-modal").classList.add("hidden");
  openCheckout("a124318b-c077-4f54-b714-cc77811af78b");
});

document.getElementById("modal-upgrade-team-btn")?.addEventListener("click", () => {
  document.getElementById("limit-modal").classList.add("hidden");
  openCheckout("88e4933d-9fae-4a7a-8c3f-ee72d78018b0");
});

document.getElementById("upgrade-btn")?.addEventListener("click", () => {
  showLimitModal("upgrade");
  
  
});

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === "SESSION_UPDATED") {
    await restoreSessionFromStorage();

    const { data } = await supabase.auth.getSession();
    if (!data?.session) return;

    updateUI(data.session);
  }

  if (msg.type === "PAYMENT_SUCCESS") {
    await loadQuotaFromAPI();
    
    const banner = document.getElementById("quota-banner");
    if (banner) {
      const originalBg = banner.style.backgroundColor;
      banner.style.backgroundColor = "#10b981"; // Green
      setTimeout(() => {
        banner.style.backgroundColor = originalBg;
      }, 2000);
    }
  }
});

async function restoreSessionFromStorage() {
  const { supabaseSession } = await chrome.storage.local.get("supabaseSession");

  if (!supabaseSession?.access_token || !supabaseSession?.refresh_token) {
    console.log("No stored Supabase session");
    return;
  }

  const { error } = await supabase.auth.setSession({
    access_token: supabaseSession.access_token,
    refresh_token: supabaseSession.refresh_token
  });

  if (error) {
    console.error("Failed to restore session", error);
  } else {
    console.log("Supabase session restored in extension");
  }
}

(async () => {
  await restoreSessionFromStorage();

  const { data } = await supabase.auth.getSession();
  updateUI(data.session);
})();
