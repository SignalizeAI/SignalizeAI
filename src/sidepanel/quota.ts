import { QUOTA_TTL } from './constants.js';
import { supabase } from './supabase.js';
import { state } from './state.js';
import { API_BASE_URL } from '../config.js';

interface QuotaResponse {
  plan: string;
  remaining_today: number;
  used_today: number;
  daily_limit: number;
  max_saved: number;
  total_saved: number;
}

export async function loadQuotaFromAPI(force = false): Promise<void> {
  if (!force && Date.now() - state.lastQuotaFetch < QUOTA_TTL) return;
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return;
  state.lastQuotaFetch = Date.now();

  const jwt = data.session.access_token;

  try {
    const res = await fetch(`${API_BASE_URL}/quota`, {
      headers: { Authorization: `Bearer ${jwt}` },
      credentials: 'omit',
      mode: 'cors',
    });

    if (!res.ok) {
      console.warn('Quota fetch failed:', res.status);
      state.currentPlan = state.currentPlan || 'free';
      state.remainingToday = null;
      state.usedToday = null;
      state.dailyLimitFromAPI = state.dailyLimitFromAPI ?? 5;
      state.maxSavedLimit = state.maxSavedLimit ?? 3;
      state.totalSavedCount = state.totalSavedCount ?? 0;
      renderQuotaBanner();
      return;
    }

    const dataJson = (await res.json()) as QuotaResponse;

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
    console.warn('Quota fetch failed', e);
    state.currentPlan = state.currentPlan || 'free';
    state.remainingToday = null;
    state.usedToday = null;
    state.dailyLimitFromAPI = state.dailyLimitFromAPI ?? 5;
    state.maxSavedLimit = state.maxSavedLimit ?? 3;
    state.totalSavedCount = state.totalSavedCount ?? 0;
    renderQuotaBanner();
  }
}

export function renderQuotaBanner(): void {
  const banner = document.getElementById('quota-banner');
  const text = document.getElementById('quota-text');
  const btn = document.getElementById('upgrade-btn');
  const badge = document.getElementById('plan-badge');
  const usageRing = document.getElementById('quota-usage-ring') as HTMLElement | null;
  const resetTooltip = document.getElementById('quota-reset-tooltip');

  if (badge && state.currentPlan) {
    badge.textContent = state.currentPlan.toUpperCase();
    badge.className = 'badge';
    badge.classList.add(`badge-${state.currentPlan.toLowerCase()}`);
  }

  if (!banner || !text || !btn) return;

  banner.classList.remove('hidden');
  const used = Number(state.usedToday ?? 0);
  const totalLimit = Math.max(1, Number(state.dailyLimitFromAPI ?? 0));
  const usedPercent = Math.max(0, Math.min(100, Math.round((used / totalLimit) * 100)));
  const usedDegrees = Math.round((usedPercent / 100) * 360);

  const savedText = `${Number(state.totalSavedCount ?? 0)} / ${Number(
    state.maxSavedLimit ?? 0
  )} saved`;

  if (state.remainingToday === null) {
    text.textContent = `Usage unavailable • ${savedText}`;
    if (usageRing) usageRing.style.setProperty('--progress-deg', '0deg');
    if (resetTooltip) resetTooltip.textContent = 'Daily quota resets at 00:00 UTC';
    btn.classList.add('hidden');
  } else if (Number(state.remainingToday ?? 0) > 0) {
    text.textContent = `${used} / ${totalLimit} prospects • ${savedText}`;
    if (usageRing) usageRing.style.setProperty('--progress-deg', `${usedDegrees}deg`);
    if (resetTooltip) resetTooltip.textContent = 'Daily quota resets at 00:00 UTC';

    if (state.currentPlan === 'team') {
      btn.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
      btn.textContent = 'Upgrade';
    }
  } else {
    text.textContent = `Daily limit reached • ${savedText}`;
    if (usageRing) usageRing.style.setProperty('--progress-deg', '360deg');
    if (resetTooltip) resetTooltip.textContent = 'Daily quota resets at 00:00 UTC';
    if (state.currentPlan === 'team') {
      btn.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
      btn.textContent = 'Upgrade';
    }
  }

  const quotaLeft = banner.querySelector('.quota-left') as HTMLElement | null;
  if (btn.classList.contains('hidden')) {
    banner.style.justifyContent = 'center';
    if (quotaLeft) quotaLeft.style.justifyContent = 'center';
  } else {
    banner.style.justifyContent = 'space-between';
    if (quotaLeft) quotaLeft.style.justifyContent = 'flex-start';
  }

  const batchMenuBtn = document.getElementById('menu-batch-analysis');
  if (batchMenuBtn) {
    const isFreePlan = (state.currentPlan || '').toLowerCase() === 'free';
    batchMenuBtn.style.display = isFreePlan ? 'none' : 'flex';
  }
}
