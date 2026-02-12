import { extractWebsiteContent } from './analysis.js';
import { loadSavedAnalyses } from './saved.js';
import { state } from './state.js';

const viewConfig = {
  analysis: {
    id: 'ai-analysis',
    onEnter: () => requestAnimationFrame(() => extractWebsiteContent()),
  },
  saved: {
    id: 'saved-analyses',
    onEnter: () => requestAnimationFrame(() => loadSavedAnalyses()),
  },
  profile: {
    id: 'profile-view',
    onEnter: () => updateProfileView(),
  },
  settings: {
    id: 'settings-view',
  },
};

const hiddenViewIds = [...Object.values(viewConfig).map((config) => config.id), 'empty-tab-view'];

export function resetViewPanels() {
  hiddenViewIds.forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById('ai-loading')?.classList.add('hidden');
  document.getElementById('filter-panel')?.classList.add('hidden');
}

export function showView(view) {
  resetViewPanels();

  const config = viewConfig[view];
  if (!config) return;

  document.getElementById(config.id)?.classList.remove('hidden');
  config.onEnter?.();
}

function updateProfileView() {
  const usageLimitEl = document.getElementById('profile-usage-limit');
  const storageLimitEl = document.getElementById('profile-storage-limit');

  const dailyLimit = state.dailyLimitFromAPI;
  const saveLimit = state.maxSavedLimit;

  if (usageLimitEl) usageLimitEl.textContent = `${dailyLimit} / day`;
  if (storageLimitEl) {
    storageLimitEl.textContent = `${saveLimit.toLocaleString()} items`;
  }

  const profileRows = document.querySelectorAll('#profile-view .profile-row');
  profileRows.forEach((row) => {
    const label = row.querySelector('.profile-label')?.textContent;
    const value = row.querySelector('.profile-value');
    if (label === 'Plan' && value) {
      value.textContent = state.currentPlan.charAt(0).toUpperCase() + state.currentPlan.slice(1);
    }
  });
}
