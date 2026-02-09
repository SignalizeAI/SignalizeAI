import { analyzeWebsiteContent } from "../ai-analyze.js";
import {
  extractRootDomain,
  getCachedAnalysis,
  getCachedAnalysisByDomain,
  hashContent,
  markDomainAnalyzedToday,
  setCachedAnalysis,
  setCachedAnalysisByDomain,
  wasDomainAnalyzedToday
} from "./cache.js";
import { IRRELEVANT_DOMAINS } from "./constants.js";
import { loadSettings } from "./settings.js";
import { loadQuotaFromAPI, renderQuotaBanner } from "./quota.js";
import { supabase } from "./supabase.js";
import { state } from "./state.js";
import { showLimitModal } from "./modal.js";
import { showToast } from "./toast.js";

export function endAnalysisLoading() {
  state.isAnalysisLoading = false;
  const refreshBtn = document.getElementById("refreshButton");
  if (refreshBtn) {
    refreshBtn.disabled = false;
  }
}

export function showContentBlocked(message, options = {}) {
  endAnalysisLoading();

  const aiCard = document.getElementById("ai-analysis");
  const contentLoading = document.getElementById("ai-loading");
  const contentError = document.getElementById("content-error");
  const saveBtn = document.getElementById("saveButton");

  document.getElementById("ai-data")?.classList.add("hidden");
  if (contentLoading) contentLoading.classList.add("hidden");

  if (contentError) {
    contentError.textContent = "";
    const wrapper = document.createElement("div");
    wrapper.className = "blocked-message";

    const messageEl = document.createElement("p");
    messageEl.textContent = message;
    wrapper.appendChild(messageEl);

    if (options.allowHomepageFallback) {
      const btn = document.createElement("button");
      btn.id = "analyze-homepage-btn";
      btn.className = "primary-btn";
      btn.textContent = "Analyze homepage instead";
      wrapper.appendChild(btn);
    }

    contentError.appendChild(wrapper);
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

  state.lastAnalysis = null;
  state.lastContentHash = null;
  state.lastExtractedMeta = null;
  state.lastAnalyzedDomain = null;
  state.forceRefresh = false;
}

export function highlightText(text, query) {
  if (!query || !text) return text;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");

  return text.replace(regex, "<mark>$1</mark>");
}

export function cleanTitle(title = "") {
  return title.replace(/^\(\d+\)\s*/, "").trim();
}

export async function shouldAutoAnalyze(url = "") {
  const settings = await loadSettings();
  if (!settings.autoReanalysis) return false;

  url = url?.toLowerCase() || "";
  for (const domain of IRRELEVANT_DOMAINS) {
    if (url.includes(domain)) {
      return false;
    }
  }

  return true;
}

export function showIrrelevantDomainView() {
  document.getElementById("ai-analysis")?.classList.add("hidden");
  document.getElementById("ai-loading")?.classList.add("hidden");
  const emptyView = document.getElementById("empty-tab-view");
  if (emptyView) {
    const titleEl = emptyView.querySelector(".empty-tab-title");
    const descEl = emptyView.querySelector(".empty-tab-description");
    if (titleEl) titleEl.textContent = "Search engines & social media excluded";
    if (descEl) {
      descEl.textContent =
        "Analysis is automatically skipped on search engines and social media to save your credits. Navigate to a business website for analysis.";
    }
    emptyView.classList.remove("hidden");
  }
}

export async function extractWebsiteContent() {
  if (state.isUserInteracting) {
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
    state.remainingToday !== null &&
    state.remainingToday <= 0 &&
    state.currentPlan === "free"
  ) {
    document.getElementById("ai-loading")?.classList.add("hidden");
    endAnalysisLoading();
    showLimitModal("analysis");
    return;
  }
  if (state.currentView !== "analysis") {
    document.getElementById("ai-loading")?.classList.add("hidden");
    endAnalysisLoading();
    return;
  }
  const aiCard = document.getElementById("ai-analysis");
  const contentLoading = document.getElementById("ai-loading");
  const contentError = document.getElementById("content-error");
  const contentData = document.getElementById("ai-data");

  if (
    contentLoading &&
    !contentLoading.classList.contains("hidden") &&
    !state.forceRefresh
  ) {
    endAnalysisLoading();
    return;
  }

  const settings = await loadSettings();

  if (aiCard) aiCard.classList.remove("hidden");
  if (contentLoading) contentLoading.classList.remove("hidden");
  if (contentError) contentError.classList.add("hidden");
  if (contentData) contentData.classList.add("hidden");
  document.getElementById("empty-tab-view")?.classList.add("hidden");
  state.isAnalysisLoading = true;

  try {
    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tabs.length || !tabs[0]?.url) {
      tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    }

    const tab = tabs[0];

    if (!tab?.id) {
      endAnalysisLoading();
      if (contentLoading) contentLoading.classList.add("hidden");
      showContentBlocked("Unable to access tab information.");
      return;
    }

    if (!tab.url) {
      endAnalysisLoading();
      if (contentLoading) contentLoading.classList.add("hidden");
      showContentBlocked("Please navigate to a website to analyze.");
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
      const emptyView = document.getElementById("empty-tab-view");
      if (emptyView) {
        const titleEl = emptyView.querySelector(".empty-tab-title");
        const descEl = emptyView.querySelector(".empty-tab-description");
        if (titleEl) titleEl.textContent = "No website open";
        if (descEl) {
          descEl.textContent =
            "Navigate to any business website to see AI-powered sales insights instantly.";
        }
        emptyView.classList.remove("hidden");
      }
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
            showContentBlocked(
              "Failed to extract page content. This page may not be accessible."
            );
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
            const previousUrl = state.lastExtractedMeta?.url || null;

            state.lastExtractedMeta = {
              title: cleanTitle(response.content.title),
              description: response.content.metaDescription,
              url: response.content.url,
              domain: new URL(response.content.url).hostname
            };

            const currentDomain = state.lastExtractedMeta.domain;
            const currentUrl = state.lastExtractedMeta.url;
            const previousContentHash = state.lastContentHash;
            state.lastContentHash = await hashContent(response.content);

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
                .eq("url", currentUrl)
                .maybeSingle();

              existing = data;

              if (existing) {
                btn?.classList.add("active");
                if (btn) btn.title = "Remove";
                if (btn) btn.dataset.savedId = existing.id;
              } else if (btn) {
                delete btn.dataset.savedId;
              }
            }

            cached = await getCachedAnalysis(currentUrl);

            try {
              const aiCard = document.getElementById("ai-analysis");
              const aiLoading = document.getElementById("ai-loading");
              const aiData = document.getElementById("ai-data");

              if (aiCard) aiCard.classList.remove("hidden");

              const reuseAllowed =
                settings.reanalysisMode === "content-change" &&
                !state.forceRefresh;
              const canReuseExisting =
                reuseAllowed &&
                existing &&
                existing.content_hash === state.lastContentHash &&
                existing.url === currentUrl;
              const canReuseCached =
                reuseAllowed && cached && cached.meta?.url === currentUrl;

              const shouldReuse = canReuseExisting || canReuseCached;

              if (shouldReuse) {
                if (aiLoading) aiLoading.classList.add("hidden");

                if (canReuseExisting) {
                  state.lastAnalysis = {
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

                  state.lastExtractedMeta = {
                    title: cleanTitle(existing.title),
                    description: existing.description,
                    url: existing.url,
                    domain: existing.domain
                  };
                } else if (canReuseCached) {
                  state.lastAnalysis = cached.analysis;
                  state.lastExtractedMeta = cached.meta;
                }

                displayAIAnalysis(state.lastAnalysis);
                endAnalysisLoading();

                state.lastAnalyzedDomain = currentDomain;

                resolve();
              } else {
                const rootDomain = extractRootDomain(currentDomain);
                const lastRootDomain = state.lastAnalyzedDomain
                  ? extractRootDomain(state.lastAnalyzedDomain)
                  : null;

                const isNewRootDomain =
                  !lastRootDomain || lastRootDomain !== rootDomain;
                const isNewUrl = previousUrl !== currentUrl;
                const contentChanged =
                  previousContentHash &&
                  previousContentHash !== state.lastContentHash;
                if (
                  !state.forceRefresh &&
                  !isNewRootDomain &&
                  !isNewUrl &&
                  !contentChanged
                ) {
                  if (aiLoading) aiLoading.classList.add("hidden");
                  if (aiData) aiData.classList.add("hidden");
                  showContentBlocked("Click the refresh button to analyze this page.");
                  resolve();
                  return;
                }

                if (aiLoading) aiLoading.classList.remove("hidden");
                if (aiData) aiData.classList.add("hidden");

                if (
                  !response.content.paragraphs?.length &&
                  !response.content.headings?.length
                ) {
                  showContentBlocked("Not enough readable content to analyze.");
                  resolve();
                  return;
                }

                const urlObj = new URL(response.content.url);
                const isInternal =
                  urlObj.hostname === "signalizeai.org" ||
                  urlObj.hostname === "www.signalizeai.org" ||
                  urlObj.hostname === "signalizeaipay.lemonsqueezy.com";

                const domainAnalyzedToday = await wasDomainAnalyzedToday(
                  currentDomain
                );

                const result = await analyzeWebsiteContent(
                  response.content,
                  isInternal,
                  domainAnalyzedToday
                );

                if (result.quota) {
                  state.currentPlan = result.quota.plan;
                  state.usedToday = result.quota.used_today;
                  state.remainingToday = result.quota.remaining_today;
                  state.dailyLimitFromAPI = result.quota.daily_limit;
                  state.maxSavedLimit = result.quota.max_saved;
                  state.totalSavedCount = result.quota.total_saved;
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
                state.lastAnalysis = analysis;
                displayAIAnalysis(analysis);
                state.lastAnalyzedDomain = currentDomain;
                markDomainAnalyzedToday(currentDomain);

                setCachedAnalysis(currentUrl, {
                  content_hash: state.lastContentHash,
                  analysis,
                  meta: state.lastExtractedMeta
                });
                setCachedAnalysisByDomain(currentDomain, {
                  analysis,
                  meta: state.lastExtractedMeta
                });

                if (existing) {
                  const { error: updateError } = await supabase
                    .from("saved_analyses")
                    .update({
                      content_hash: state.lastContentHash,
                      last_analyzed_at: new Date().toISOString(),
                      title: state.lastExtractedMeta.title,
                      description: state.lastExtractedMeta.description,
                      url: state.lastExtractedMeta.url,
                      what_they_do: analysis.whatTheyDo,
                      target_customer: analysis.targetCustomer,
                      value_proposition: analysis.valueProposition,
                      sales_angle: analysis.salesAngle,
                      sales_readiness_score: analysis.salesReadinessScore,
                      best_sales_persona: analysis.bestSalesPersona?.persona,
                      best_sales_persona_reason: analysis.bestSalesPersona?.reason,
                      recommended_outreach_persona:
                        analysis.recommendedOutreach?.persona,
                      recommended_outreach_goal:
                        analysis.recommendedOutreach?.goal,
                      recommended_outreach_angle:
                        analysis.recommendedOutreach?.angle,
                      recommended_outreach_message:
                        analysis.recommendedOutreach?.message
                    })
                    .eq("id", existing.id);

                  if (updateError) {
                    console.error("Failed to update saved analysis:", updateError);
                    showToast("Failed to update saved analysis. Try again.");
                  }
                }
                resolve();
              }
            } catch (err) {
              showContentBlocked("Failed to analyze page: " + err.message);
              endAnalysisLoading();
              resolve();
            }
          } else if (response?.reason === "THIN_CONTENT") {
            endAnalysisLoading();
            showContentBlocked("This page has limited public content.", {
              allowHomepageFallback: true,
              originalUrl: tab.url
            });
            resolve();
            return;
          } else if (response?.reason === "RESTRICTED") {
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
          } else {
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

export async function analyzeSpecificUrl(url) {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return;

  await loadQuotaFromAPI();

  if (state.currentPlan === "free" && state.remainingToday !== null && state.remainingToday <= 0) {
    showLimitModal("analysis");
    return;
  }

  const contentLoading = document.getElementById("ai-loading");
  const contentError = document.getElementById("content-error");

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

      state.lastExtractedMeta = {
        title: cleanTitle(response.content.title),
        description: response.content.metaDescription,
        url: response.content.url,
        domain: new URL(response.content.url).hostname
      };

      state.lastContentHash = await hashContent(response.content);
      state.lastAnalyzedDomain = state.lastExtractedMeta.domain;
      const settings = await loadSettings();
      const reuseAllowed =
        settings.reanalysisMode === "content-change" && !state.forceRefresh;
      const cached = await getCachedAnalysisByDomain(state.lastAnalyzedDomain);

      if (reuseAllowed && cached) {
        state.lastAnalysis = cached.analysis;
        state.lastExtractedMeta = {
          ...cached.meta,
          url,
          domain: state.lastAnalyzedDomain
        };
        displayAIAnalysis(state.lastAnalysis);
        return;
      }

      const urlObj = new URL(response.content.url);
      const isInternal =
        urlObj.hostname === "signalizeai.org" ||
        urlObj.hostname === "www.signalizeai.org" ||
        urlObj.hostname === "signalizeaipay.lemonsqueezy.com";
      const domainAnalyzedToday = await wasDomainAnalyzedToday(
        state.lastAnalyzedDomain
      );
      const result = await analyzeWebsiteContent(
        response.content,
        isInternal,
        domainAnalyzedToday
      );

      if (result.quota) {
        state.currentPlan = result.quota.plan;
        state.usedToday = result.quota.used_today;
        state.remainingToday = result.quota.remaining_today;
        state.dailyLimitFromAPI = result.quota.daily_limit;
        state.maxSavedLimit = result.quota.max_saved;
        state.totalSavedCount = result.quota.total_saved;
        renderQuotaBanner();
      }

      if (result.blocked) {
        endAnalysisLoading();
        showLimitModal("analysis");
        return;
      }

      state.lastAnalysis = result.analysis;
      displayAIAnalysis(result.analysis);
      markDomainAnalyzedToday(state.lastAnalyzedDomain);

      setCachedAnalysis(state.lastExtractedMeta.url, {
        analysis: result.analysis,
        meta: state.lastExtractedMeta
      });
      setCachedAnalysisByDomain(state.lastAnalyzedDomain, {
        analysis: result.analysis,
        meta: state.lastExtractedMeta
      });
    }
  );
}

export function displayAIAnalysis(analysis) {
  endAnalysisLoading();

  const aiCard = document.getElementById("ai-analysis");
  const aiLoading = document.getElementById("ai-loading");
  const aiData = document.getElementById("ai-data");
  const refreshBtn = document.getElementById("refreshButton");

  if (aiCard) aiCard.classList.remove("hidden");
  if (aiLoading) aiLoading.classList.add("hidden");
  if (aiData) aiData.classList.remove("hidden");
  if (refreshBtn) refreshBtn.disabled = false;

  const aiTitleEl = document.getElementById("ai-title-text");
  if (aiTitleEl && state.lastExtractedMeta?.title) {
    aiTitleEl.textContent = state.lastExtractedMeta.title || "—";
  }

  const aiDescEl = document.getElementById("ai-description-text");
  if (aiDescEl && state.lastExtractedMeta?.description) {
    aiDescEl.textContent = state.lastExtractedMeta.description || "—";
  }

  const aiUrlEl = document.getElementById("ai-url-text");
  if (aiUrlEl && state.lastExtractedMeta?.url) {
    aiUrlEl.href = state.lastExtractedMeta.url;
    aiUrlEl.textContent = state.lastExtractedMeta.url;
  }

  const whatEl = document.getElementById("ai-what-they-do");
  const targetEl = document.getElementById("ai-target-customer");
  const valueEl = document.getElementById("ai-value-prop");
  const salesEl = document.getElementById("ai-sales-angle");
  const scoreEl = document.getElementById("ai-sales-score");
  const personaEl = document.getElementById("ai-sales-persona");
  const personaReasonEl = document.getElementById("ai-sales-persona-reason");
  const outreachPersonaEl = document.getElementById("ai-outreach-persona");
  const outreachGoalEl = document.getElementById("ai-outreach-goal");
  const outreachAngleEl = document.getElementById("ai-outreach-angle");
  const outreachMessageEl = document.getElementById("ai-outreach-message");

  if (whatEl) whatEl.textContent = analysis.whatTheyDo || "—";
  if (targetEl) targetEl.textContent = analysis.targetCustomer || "—";
  if (valueEl) valueEl.textContent = analysis.valueProposition || "—";
  if (salesEl) salesEl.textContent = analysis.salesAngle || "—";
  if (scoreEl) scoreEl.textContent = analysis.salesReadinessScore ?? "—";
  if (personaEl) {
    personaEl.textContent = analysis.bestSalesPersona?.persona || "Mid-Market AE";
  }
  if (personaReasonEl) {
    const reason = analysis.bestSalesPersona?.reason || "";
    personaReasonEl.textContent = reason ? `(${reason})` : "—";
  }
  if (outreachPersonaEl) {
    outreachPersonaEl.textContent =
      analysis.recommendedOutreach?.persona || "—";
  }
  if (outreachGoalEl) {
    outreachGoalEl.textContent = analysis.recommendedOutreach?.goal || "—";
  }
  if (outreachAngleEl) {
    outreachAngleEl.textContent = analysis.recommendedOutreach?.angle || "—";
  }
  if (outreachMessageEl) {
    outreachMessageEl.textContent =
      analysis.recommendedOutreach?.message || "—";
  }
}
