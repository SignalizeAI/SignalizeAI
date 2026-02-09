import { QUOTA_TTL } from "./constants.js";
import { supabase } from "./supabase.js";
import { state } from "./state.js";

export async function loadQuotaFromAPI(force = false) {
  if (!force && Date.now() - state.lastQuotaFetch < QUOTA_TTL) return;
  state.lastQuotaFetch = Date.now();
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return;

  const jwt = data.session.access_token;

  try {
    const res = await fetch("https://api.signalizeai.org/quota", {
      headers: { Authorization: `Bearer ${jwt}` }
    });

    if (!res.ok) {
      console.warn("Quota fetch failed:", res.status);
      state.currentPlan = state.currentPlan || "free";
      state.remainingToday = null;
      state.usedToday = null;
      state.dailyLimitFromAPI = state.dailyLimitFromAPI ?? 5;
      state.maxSavedLimit = state.maxSavedLimit ?? 3;
      state.totalSavedCount = state.totalSavedCount ?? 0;
      renderQuotaBanner();
      return;
    }

    const dataJson = await res.json();

    if (dataJson.plan) {
      state.currentPlan = dataJson.plan;
      state.remainingToday = dataJson.remaining_today;
      state.usedToday = dataJson.used_today;
      state.dailyLimitFromAPI = dataJson.daily_limit;
      state.maxSavedLimit = dataJson.max_saved ?? 0;
      state.totalSavedCount = dataJson.total_saved ?? 0;

      renderQuotaBanner();
    }
  } catch (e) {
    console.warn("Quota fetch failed", e);
    state.currentPlan = state.currentPlan || "free";
    state.remainingToday = null;
    state.usedToday = null;
    state.dailyLimitFromAPI = state.dailyLimitFromAPI ?? 5;
    state.maxSavedLimit = state.maxSavedLimit ?? 3;
    state.totalSavedCount = state.totalSavedCount ?? 0;
    renderQuotaBanner();
  }
}

export function renderQuotaBanner() {
  const banner = document.getElementById("quota-banner");
  const text = document.getElementById("quota-text");
  const btn = document.getElementById("upgrade-btn");
  const badge = document.getElementById("plan-badge");
  const progressBar = document.getElementById("quota-progress-fill");

  if (badge) {
    badge.textContent = state.currentPlan.toUpperCase();
    badge.className = "badge";
    badge.classList.add(`badge-${state.currentPlan.toLowerCase()}`);
  }

  if (!banner || !text || !btn) return;

  banner.classList.remove("hidden");
  const used = Number(state.usedToday ?? 0);
  const totalLimit = Math.max(1, Number(state.dailyLimitFromAPI ?? 0));
  const percentage = Math.min(100, (used / totalLimit) * 100);

  if (progressBar) {
    progressBar.style.width = `${percentage}%`;

    if (state.remainingToday === null) {
      progressBar.classList.remove("danger");
    } else if (Number(state.remainingToday ?? 0) <= 0) {
      progressBar.classList.add("danger");
    } else {
      progressBar.classList.remove("danger");
    }
  }

  const savedText = `${Number(state.totalSavedCount ?? 0)} / ${Number(
    state.maxSavedLimit ?? 0
  )} saved`;

  if (state.remainingToday === null) {
    text.textContent = `Usage unavailable, ${savedText}`;
    btn.classList.add("hidden");
  } else if (Number(state.remainingToday ?? 0) > 0) {
    text.textContent = `${used} / ${totalLimit} analyses, ${savedText}`;

    if (state.currentPlan === "team") {
      btn.classList.add("hidden");
    } else {
      btn.classList.remove("hidden");
      btn.textContent = state.currentPlan === "pro" ? "Upgrade to Team" : "Upgrade";
    }
  } else {
    text.textContent = `Daily limit reached, ${savedText}`;
    btn.classList.remove("hidden");
    btn.textContent =
      state.currentPlan === "pro" ? "Upgrade to Team" : "Upgrade to continue";
  }
}
