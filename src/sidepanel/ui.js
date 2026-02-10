import { headerSubtitle, loginView, userInitialSpan, welcomeView } from "./elements.js";
import { loadQuotaFromAPI } from "./quota.js";
import { loadSettings, applySettingsToUI } from "./settings.js";
import { state } from "./state.js";
import { extractWebsiteContent } from "./analysis.js";
import { exitSelectionMode, loadSavedAnalyses } from "./saved.js";

export function navigateTo(view) {
  const prevView = state.currentView;

  if (view !== "saved" && state.selectionMode) {
    exitSelectionMode();
  }
  if (prevView === view && !welcomeView.classList.contains("hidden")) {
    return;
  }
  state.currentView = view;

  if (prevView !== view && !state.isAnalysisLoading) {
    document.querySelector(".dropdown-card")?.classList.remove("expanded");
    state.isUserInteracting = false;
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

    const dailyLimit = state.dailyLimitFromAPI;
    const saveLimit = state.maxSavedLimit;

    if (usageLimitEl) usageLimitEl.textContent = `${dailyLimit} / day`;
    if (storageLimitEl) {
      storageLimitEl.textContent = `${saveLimit.toLocaleString()} items`;
    }

    const profileRows = document.querySelectorAll("#profile-view .profile-row");
    profileRows.forEach((row) => {
      const label = row.querySelector(".profile-label")?.textContent;
      const value = row.querySelector(".profile-value");
      if (label === "Plan" && value) {
        value.textContent =
          state.currentPlan.charAt(0).toUpperCase() + state.currentPlan.slice(1);
      }
    });
  }

  if (view === "settings") {
    document.getElementById("settings-view")?.classList.remove("hidden");
  }
}

export async function updateUI(session) {
  if (session) {
    const isAlreadyLoggedIn = !welcomeView.classList.contains("hidden");

    loginView.classList.add("hidden");
    welcomeView.classList.remove("hidden");

    const user = session.user;
    const fullName = user?.user_metadata?.full_name || user?.email || "";

    if (userInitialSpan && fullName) {
      userInitialSpan.textContent = fullName.charAt(0).toUpperCase();
    }
    const statusMsg = document.getElementById("status-msg");
    if (statusMsg) statusMsg.textContent = "";
    await loadQuotaFromAPI();

    const isMenuOpen = document
      .querySelector(".dropdown-card")
      ?.classList.contains("expanded");

    if (!isAlreadyLoggedIn && !isMenuOpen) {
      navigateTo("analysis");
    }

    const settings = await loadSettings();
    applySettingsToUI(settings);

    if (state.currentView === "analysis" && !state.isAnalysisLoading) {
      setTimeout(extractWebsiteContent, 0);
    }
  } else {
    document.getElementById("limit-modal")?.classList.add("hidden");
    loginView.classList.remove("hidden");
    welcomeView.classList.add("hidden");
  }
}

export function isMenuOpen() {
  return document
    .querySelector(".dropdown-card")
    ?.classList.contains("expanded");
}
