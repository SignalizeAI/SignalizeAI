import { analyzeWebsiteContent } from "./src/ai-analyze.js";
import * as XLSX from "xlsx";

if (!window.supabase) {
  throw new Error('Supabase client not initialized. Make sure extension/supabase.bundle.js is loaded.');
}
const supabase = window.supabase;
let lastContentHash = null;
let lastAnalysis = null;
let lastExtractedMeta = null;
let lastAnalyzedDomain = null;
let forceRefresh = false;

const loginView = document.getElementById('login-view');
const welcomeView = document.getElementById('welcome-view');
const userNameSpan = document.getElementById('user-name');
const userEmailSpan = document.getElementById('user-email');
const userInitialSpan = document.getElementById('user-initial');
const signInBtn = document.getElementById('google-signin');
const signOutBtn = document.getElementById('sign-out');
const statusMsg = document.getElementById('status-msg');

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

function showContentBlocked(message) {
  const contentCard = document.getElementById("website-content");
  const contentLoading = document.getElementById("content-loading");
  const contentError = document.getElementById("content-error");
  const aiCard = document.getElementById("ai-analysis");
  const saveBtn = document.getElementById("saveButton");

  if (contentCard) contentCard.classList.add("hidden")
  if (contentLoading) contentLoading.classList.add("hidden");

  if (contentError) {
    contentError.textContent = message;
    contentError.classList.remove("hidden");
  }

  if (aiCard) aiCard.classList.add("hidden");
  if (saveBtn) {
    saveBtn.classList.remove("active");
    saveBtn.dataset.label = "Save";
  }


  lastAnalysis = null;
  lastContentHash = null;
  lastExtractedMeta = null;
  lastAnalyzedDomain = null;
  forceRefresh = false;
}

function showSavedAnalysesView() {
  document.getElementById("website-content")?.classList.add("hidden");
  document.getElementById("ai-analysis")?.classList.add("hidden");

  document.getElementById("content-loading")?.classList.add("hidden");
  document.getElementById("ai-loading")?.classList.add("hidden");

  document.getElementById("saved-analyses")?.classList.remove("hidden");

  loadSavedAnalyses();
}

function updateUI(session) {
  if (session) {
    loginView.classList.add('hidden');
    welcomeView.classList.remove('hidden');

    const user = session.user;
    const fullName = user.user_metadata.full_name || user.email;
    if (userNameSpan) userNameSpan.textContent = fullName;
    if (userEmailSpan) {
      userEmailSpan.textContent = user.email || 'user@signalize.ai';
    }
    if (userInitialSpan && fullName && fullName.length > 0) {
      userInitialSpan.textContent = fullName.charAt(0).toUpperCase();
    }
    statusMsg.textContent = "";

    extractWebsiteContent();

  } else {
    loginView.classList.remove('hidden');
    welcomeView.classList.add('hidden');
  }
}

async function extractWebsiteContent() {
  const contentCard = document.getElementById('website-content');
  const contentLoading = document.getElementById('content-loading');
  const contentError = document.getElementById('content-error');
  const contentData = document.getElementById('content-data');

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
          console.warn("Extractor not available on this page");
          if (contentError) contentError.classList.remove('hidden');
          return;
        }

        if (response?.ok && response.content) {
          console.log("📄 Extracted website content:", response.content);

          lastExtractedMeta = {
            title: response.content.title,
            description: response.content.metaDescription,
            url: response.content.url,
            domain: new URL(response.content.url).hostname
          };

          const currentDomain = lastExtractedMeta.domain;
          const sameDomain = lastAnalyzedDomain === currentDomain;
          lastContentHash = await hashContent(response.content);
          if (
            !forceRefresh &&
            sameDomain &&
            existing &&
            existing.content_hash === lastContentHash
          ) {
            return;
          }
          lastAnalyzedDomain = currentDomain;

          const btn = document.getElementById("saveButton");
          btn?.classList.remove("active");
          if (btn) btn.dataset.label = "Save";

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
              if (btn) btn.dataset.label = "Remove";
            }
          }

          try {
            const aiCard = document.getElementById('ai-analysis');
            const aiLoading = document.getElementById('ai-loading');
            const aiData = document.getElementById('ai-data');

            if (aiCard) aiCard.classList.remove('hidden');

            if (!forceRefresh && existing && existing.content_hash === lastContentHash) {
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
                title: existing.title,
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
            "Not enough public content on this page to analyze."
          );
          return;
        }
        else if (response?.reason === "RESTRICTED") {
          showContentBlocked(
            "This page requires login or consent before content can be analyzed."
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
  wrapper.className = "saved-item";

  wrapper.innerHTML = `
  <div class="saved-item-header">
    <div class="header-info">
      <strong>${item.title || item.domain}</strong>
      <div style="font-size:12px; opacity:0.7">${item.domain}</div>
    </div>

    <div class="header-actions">
      <div class="toggle-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>

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

  header.addEventListener("click", (e) => {
    if (e.target.closest(".delete-saved-btn")) return;

    const container = wrapper.parentElement;
    if (container) {
      container.querySelectorAll(".saved-item-body").forEach((other) => {
        if (other !== body) other.classList.add("hidden");
      });
    }

    body.classList.toggle("hidden");
  });

  wrapper.querySelector(".delete-saved-btn").addEventListener("click", async (e) => {
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
  });

  return wrapper;
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
  a.download = "signalize_saved_analyses.csv";
  a.click();

  URL.revokeObjectURL(url);
}

function exportToExcel(rows) {
  if (!rows.length) return;

  const formatted = rows.map(item => ({
    Title: item.title,
    Domain: item.domain,
    URL: item.url,
    Description: item.description,
    "Sales Readiness": item.sales_readiness_score,
    "What They Do": item.what_they_do,
    "Target Customer": item.target_customer,
    "Value Proposition": item.value_proposition,
    "Best Sales Persona": item.best_sales_persona,
    "Persona Reason": item.best_sales_persona_reason,
    "Sales Angle": item.sales_angle,
    "Saved At": item.created_at
  }));

  const worksheet = XLSX.utils.json_to_sheet(formatted);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Saved Analyses");

  XLSX.writeFile(workbook, "signalize_saved_analyses.xlsx");
}

async function loadSavedAnalyses() {
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
const dropdownContent = document.getElementById('dropdown-content');

if (dropdownHeader && dropdownCard) {
  dropdownHeader.addEventListener('click', () => {
    dropdownCard.classList.toggle('expanded');
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TAB_CHANGED") {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && welcomeView && !welcomeView.classList.contains('hidden')) {
        setTimeout(() => {
          extractWebsiteContent();
        }, 300);
      }
    });
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && welcomeView && !welcomeView.classList.contains('hidden')) {
        setTimeout(() => {
          extractWebsiteContent();
        }, 300);
      }
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
    button.dataset.label = "Save";
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
    button.dataset.label = "Remove";
    loadSavedAnalyses();
  }
});

const refreshBtn = document.getElementById("refreshButton");

refreshBtn?.addEventListener("click", async () => {
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

const profileMenu = document.getElementById("menu-saved-analyses");

profileMenu?.addEventListener("click", (e) => {
  e.preventDefault();

  document.querySelector(".dropdown-card")?.classList.remove("expanded");

  showSavedAnalysesView();
});

document.getElementById("export-csv")?.addEventListener("click", async () => {
  const data = await fetchSavedAnalysesData();
  exportToCSV(data);
});

document.getElementById("export-xlsx")?.addEventListener("click", async () => {
  const data = await fetchSavedAnalysesData();
  exportToExcel(data);
});
