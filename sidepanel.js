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
let activeFilters = {
  minScore: 0,
  persona: ""
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

    const redirectUrl = chrome.identity.getRedirectURL('supabase-auth');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true
      }
    });

    if (error) throw error;

    chrome.identity.launchWebAuthFlow(
      {
        url: data.url,
        interactive: true
      },
      async (redirectUrl) => {
        if (chrome.runtime.lastError || !redirectUrl) {
          statusMsg.textContent = "Login cancelled.";
          return;
        }

        if (!redirectUrl.includes('access_token')) {
          statusMsg.textContent = "Authentication failed.";
          return;
        }

        const url = new URL(redirectUrl);
        const params = new URLSearchParams(url.hash.substring(1));

        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (!accessToken) {
          statusMsg.textContent = "No access token received.";
          return;
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        if (sessionError) throw sessionError;
      }
    );

  } catch (err) {
    console.error("Login failed:", err);
    statusMsg.textContent = "Login failed. Please try again.";
  }
}

function updateDeleteState() {
  if (!multiSelectToggle) return;

  const shouldDisable =
    selectionMode && selectedSavedIds.size === 0;

  multiSelectToggle.classList.toggle("disabled", shouldDisable);
  multiSelectToggle.setAttribute(
    "aria-disabled",
    shouldDisable ? "true" : "false"
  );
}

function navigateTo(view) {

  if (view !== "saved" && selectionMode) {
    exitSelectionMode();
  }
  currentView = view;

  document.getElementById("ai-analysis")?.classList.add("hidden");
  document.getElementById("saved-analyses")?.classList.add("hidden");
  document.getElementById("profile-view")?.classList.add("hidden");
  document.getElementById("settings-view")?.classList.add("hidden");

  document.getElementById("ai-loading")?.classList.add("hidden");
  document.getElementById("filter-panel")?.classList.add("hidden");

  document.querySelector(".dropdown-card")?.classList.remove("expanded");

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
  }

  if (view === "settings") {
    document.getElementById("settings-view")?.classList.remove("hidden");
  }
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) console.error("Sign out error:", error);
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

function showContentBlocked(message, options = {}) {
  const contentCard = document.getElementById("website-content");
  const contentLoading = document.getElementById("content-loading");
  const contentError = document.getElementById("content-error");
  const aiCard = document.getElementById("ai-analysis");
  const saveBtn = document.getElementById("saveButton");

  document.getElementById("content-data")?.classList.add("hidden");
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

function applySavedFilters() {
  lastSelectedIndex = null;

  if (selectionMode) {
    selectedSavedIds.clear();
    document
      .querySelectorAll(".saved-item.selected")
      .forEach(el => el.classList.remove("selected"));
    updateDeleteState();
  }

  const items = document.querySelectorAll("#saved-list .saved-item");

  items.forEach(item => {
    let visible = true;

    const itemScore = Number(item.dataset.salesScore || 0);

    if (activeFilters.minScore > 0) {
      visible = itemScore >= activeFilters.minScore;
    }

    if (visible && activeFilters.persona) {
      visible = item.dataset.persona === activeFilters.persona;
    }

    item.style.display = visible ? "" : "none";
  });
  updateSelectAllIcon();
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

function updateUI(session) {
  if (session) {
    loginView.classList.add('hidden');
    welcomeView.classList.remove('hidden');

    const user = session.user;
    const fullName =
      user?.user_metadata?.full_name ||
      user?.email ||
      "";

    if (userInitialSpan && fullName) {
      userInitialSpan.textContent = fullName.charAt(0).toUpperCase();
    }
    statusMsg.textContent = "";
    navigateTo("analysis");

    loadSettings().then(settings => {
      applySettingsToUI(settings);
    });
  } else {
    loginView.classList.remove('hidden');
    welcomeView.classList.add('hidden');
  }
}

function updateSavedEmptyState() {
  const listEl = document.getElementById("saved-list");
  const emptyEl = document.getElementById("saved-empty");

  if (!listEl || !emptyEl) return;

  const hasItems = listEl.querySelector(".saved-item");

  if (hasItems) {
    emptyEl.classList.add("hidden");
  } else {
    emptyEl.classList.remove("hidden");
  }
}

async function shouldAutoAnalyze() {
  const settings = await loadSettings();
  return settings.autoReanalysis;
}

async function extractWebsiteContent() {
  if (currentView !== "analysis") return;
  const contentCard = document.getElementById('website-content');
  const contentLoading = document.getElementById('content-loading');
  const contentError = document.getElementById('content-error');
  const contentData = document.getElementById('content-data');
  const settings = await loadSettings();

  // Show loading state
  if (contentCard) contentCard.classList.remove('hidden');
  if (contentLoading) contentLoading.classList.remove('hidden');
  if (contentError) contentError.classList.add('hidden');
  if (contentData) contentData.classList.add('hidden');

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab?.id || !tab.url) {
      if (contentLoading) contentLoading.classList.add('hidden');
      if (contentError) contentError.classList.remove('hidden');
      return;
    }

    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("about:") ||
      tab.url.startsWith("edge://")
    ) {
      console.info("Skipping extraction on restricted page:", tab.url);
      if (contentLoading) contentLoading.classList.add('hidden');
      if (contentError) contentError.classList.remove('hidden');
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { type: "EXTRACT_WEBSITE_CONTENT" },
      async (response) => {
        if (contentLoading) contentLoading.classList.add('hidden');

        if (chrome.runtime.lastError) {
          if (contentError) contentError.classList.remove('hidden');
          return;
        }

        if (response?.ok && response.content) {
          console.log("📄 Extracted website content:", response.content);

          lastExtractedMeta = {
            title: cleanTitle(response.content.title),
            description: response.content.metaDescription,
            url: response.content.url,
            domain: new URL(response.content.url).hostname
          };

          const currentDomain = lastExtractedMeta.domain;
          lastContentHash = await hashContent(response.content);
          lastAnalyzedDomain = currentDomain;

          const btn = document.getElementById("saveButton");
          btn?.classList.remove("active");
          if (btn) btn.title = "Save";

          const { data: sessionData } = await supabase.auth.getSession();
          const user = sessionData?.session?.user;

          let existing = null;

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

          try {
            const aiCard = document.getElementById('ai-analysis');
            const aiLoading = document.getElementById('ai-loading');
            const aiData = document.getElementById('ai-data');

            if (aiCard) aiCard.classList.remove('hidden');

            const shouldReuse =
              settings.reanalysisMode === "content-change" &&
              !forceRefresh &&
              existing &&
              existing.content_hash === lastContentHash;

            if (shouldReuse) {
              if (aiLoading) aiLoading.classList.add("hidden");
              
              lastAnalysis = {
                whatTheyDo: existing.what_they_do,
                targetCustomer: existing.target_customer,
                valueProposition: existing.value_proposition,
                salesAngle: existing.sales_angle,
                salesReadinessScore: existing.sales_readiness_score,
                bestSalesPersona: {
                  persona: existing.best_sales_persona,
                  reason: existing.best_sales_persona_reason
                }
              };

              lastExtractedMeta = {
                title: cleanTitle(existing.title),
                description: existing.description,
                url: existing.url,
                domain: existing.domain
              };

              displayAIAnalysis(lastAnalysis);

            } else {
              if (aiLoading) aiLoading.classList.remove("hidden");
              if (aiData) aiData.classList.add("hidden");

              if (!response.content.paragraphs?.length && !response.content.headings?.length) {
                showContentBlocked("Not enough readable content to analyze.");
                return;
              }

              const analysis = await analyzeWebsiteContent(response.content);
              lastAnalysis = analysis;
              displayAIAnalysis(analysis);

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
                    best_sales_persona_reason: analysis.bestSalesPersona?.reason
                  })
                  .eq("id", existing.id);
              }
            }
          } catch (err) {
            console.error("AI analysis failed:", err);
          }

        }
        else if (response?.reason === "THIN_CONTENT") {
          showContentBlocked(
            "This page has limited public content.",
            {
              allowHomepageFallback: true,
              originalUrl: tab.url
            }
          );
          return;
        }
        else if (response?.reason === "RESTRICTED") {
          showContentBlocked(
            "This page requires login or consent before content can be analyzed.",
            {
              allowHomepageFallback: true,
              originalUrl: tab.url
            }
          );
          return;
        }
        else {
          console.error("Extraction failed:", response?.error || response);
          showContentBlocked("Unable to analyze this page.");
        }
      }
    );
  } catch (err) {
    console.error("Error extracting website content:", err);
    if (contentLoading) contentLoading.classList.add('hidden');
    if (contentError) contentError.classList.remove('hidden');
  }
}

async function analyzeSpecificUrl(url) {
  const contentLoading = document.getElementById('content-loading');
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

      const analysis = await analyzeWebsiteContent(response.content);
      lastAnalysis = analysis;

      displayAIAnalysis(analysis);
    }
  );
}

function displayAIAnalysis(analysis) {
  const aiCard = document.getElementById('ai-analysis');
  const aiLoading = document.getElementById('ai-loading');
  const aiData = document.getElementById('ai-data');

  if (aiCard) aiCard.classList.remove('hidden');
  if (aiLoading) aiLoading.classList.add('hidden');
  if (aiData) aiData.classList.remove('hidden');

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
    const items = Array.from(document.querySelectorAll("#saved-list .saved-item")).filter(i => i.style.display !== "none");
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

  header.addEventListener("click", (e) => {
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
  });

  wrapper.querySelector(".delete-saved-btn").addEventListener("click", async (e) => {
    if (selectionMode) return;
    e.stopPropagation();

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    await supabase
      .from("saved_analyses")
      .delete()
      .eq("user_id", user.id)
      .eq("id", item.id);

    wrapper.remove();
    updateSavedEmptyState();
  });

  return wrapper;
}

function toggleSelectAllVisible() {
  const items = Array.from(
    document.querySelectorAll("#saved-list .saved-item")
  ).filter(item => item.style.display !== "none");

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
  ).filter(item => item.style.display !== "none");

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
  exitSelectionMode();
  lastSelectedIndex = null;
  document.getElementById("saved-analyses")?.classList.remove("hidden");
  const listEl = document.getElementById("saved-list");
  const loadingEl = document.getElementById("saved-loading");
  const emptyEl = document.getElementById("saved-empty");

  listEl.innerHTML = "";
  loadingEl.classList.remove("hidden");
  emptyEl.classList.add("hidden");

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return;

  const { data, error } = await supabase
    .from("saved_analyses")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  loadingEl.classList.add("hidden");

  if (error || !data || data.length === 0) {
    emptyEl.classList.remove("hidden");
    return;
  }

  data.forEach(item => {
    listEl.appendChild(renderSavedItem(item));
  });
  applySavedFilters();
  updateSavedEmptyState();
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

if (signInBtn) signInBtn.addEventListener('click', signInWithGoogle);
if (signOutBtn) signOutBtn.addEventListener('click', signOut);

const dropdownHeader = document.getElementById('dropdown-header');
const dropdownCard = document.querySelector('.dropdown-card');

if (dropdownHeader && dropdownCard) {
  dropdownHeader.addEventListener('click', (e) => {
    e.stopPropagation();
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

  if (!dropdownCard.contains(e.target)) {
    dropdownCard.classList.remove("expanded");
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TAB_CHANGED") {
    shouldAutoAnalyze().then(enabled => {
      if (!enabled) return;

      supabase.auth.getSession().then(({ data }) => {
        if (currentView === "analysis") {
          setTimeout(extractWebsiteContent, 300);
        }
      });
    });
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    shouldAutoAnalyze().then(enabled => {
      if (!enabled) return;

      supabase.auth.getSession().then(({ data }) => {
        if (currentView === "analysis") {
          setTimeout(extractWebsiteContent, 300);
        }
      });
    });
  }
});

const button = document.getElementById("saveButton");

button?.addEventListener("click", async () => {
  if (!lastAnalysis || !lastExtractedMeta) return;

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
    });

    if (error) {
      console.error("Failed to save:", error);
      return;
    }

    button.classList.add("active");
    button.title = "Remove";
    loadSavedAnalyses();
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

refreshBtn?.addEventListener("click", async () => {
  if (currentView !== "analysis") return;
  if (!lastExtractedMeta || refreshBtn.disabled) return;

  refreshBtn.disabled = true;
  forceRefresh = true;

  document.getElementById("website-content")?.classList.remove("hidden");
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

  updateSelectionUI();
  updateDeleteState();
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
      selectAllBtn.innerHTML = SELECT_ALL_ICON;
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
  if (multiSelectToggle.classList.contains("disabled")) return;

  if (!selectionMode) {
    selectionMode = true;
    selectedSavedIds.clear();
    updateSelectionUI();
    updateDeleteState();
    return;
  }

  if (selectedSavedIds.size === 0) return;

  const ids = Array.from(selectedSavedIds);

  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return;

  const { error } = await supabase
    .from("saved_analyses")
    .delete()
    .eq("user_id", user.id)
    .in("id", ids);

  if (error) {
    console.warn("Delete failed, UI may be out of sync", error);
    return;
  }

  document.querySelectorAll(".saved-item").forEach(el => {
    const checkbox = el.querySelector(".saved-select-checkbox");
    if (checkbox && ids.includes(checkbox.dataset.id)) {
      el.remove();
    }
  });

  exitSelectionMode();
  updateSavedEmptyState();
  applySavedFilters();
});


const filterApplyBtn = document.querySelector(".filter-apply");

filterApplyBtn?.addEventListener("click", () => {
  activeFilters.minScore = Number(
    document.getElementById("filter-sales-score")?.value || 0
  );

  activeFilters.persona =
    document.getElementById("filter-persona")?.value
      .toLowerCase()
      .trim();

  applySavedFilters();

  filterPanel?.classList.add("hidden");
  filterToggle?.setAttribute("aria-expanded", "false");
});

const filterResetBtn = document.querySelector(".filter-reset");

filterResetBtn?.addEventListener("click", () => {
  activeFilters.minScore = 0;
  activeFilters.persona = "";

  document.getElementById("filter-sales-score").value = 0;
  document.getElementById("filter-persona").value = "";

  document.querySelectorAll("#saved-list .saved-item").forEach(item => {
    item.style.display = "";
  });

  filterPanel?.classList.add("hidden");
  filterToggle?.setAttribute("aria-expanded", "false");
});

const scoreSlider = document.getElementById("filter-sales-score");
const scoreLabel = document.getElementById("filter-score-value");

scoreSlider?.addEventListener("input", () => {
  activeFilters.minScore = Number(scoreSlider.value);
  applySavedFilters();

  if (scoreLabel) {
    scoreLabel.textContent = `${scoreSlider.value} – 100`;
  }
});

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
