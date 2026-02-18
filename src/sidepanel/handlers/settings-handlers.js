import { loadSettings, saveSettings, updateReanalysisUI } from '../settings.js';
import { settingsMenu } from '../elements.js';
import { navigateTo } from '../ui.js';
import { state } from '../state.js';

export function setupSettingsHandlers() {
  settingsMenu?.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo('settings');
  });

  const autoReanalysisCheckbox = document.getElementById('setting-auto-reanalysis');

  autoReanalysisCheckbox?.addEventListener('change', async (e) => {
    const autoReanalysis = e.target.checked;

    saveSettings({ autoReanalysis });

    const settings = await loadSettings();
    updateReanalysisUI(settings);
  });

  const clearCacheBtn = document.getElementById('clear-cache-btn');

  clearCacheBtn?.addEventListener('click', async () => {
    state.lastAnalysis = null;
    state.lastContentHash = null;
    state.lastExtractedMeta = null;
    state.lastAnalyzedDomain = null;

    chrome.storage.local.get(null, (items) => {
      const keysToRemove = Object.keys(items).filter(
        (k) => k.startsWith('analysis_cache:') || k.startsWith('domain_analyzed_today:')
      );
      if (keysToRemove.length) {
        chrome.storage.local.remove(keysToRemove);
      }
    });

    const originalText = clearCacheBtn.textContent;
    clearCacheBtn.textContent = 'Cleared';
    clearCacheBtn.classList.add('cleared');

    setTimeout(() => {
      clearCacheBtn.textContent = originalText;
      clearCacheBtn.classList.remove('cleared');
    }, 1200);
  });

  document.querySelectorAll('input[name="copy-format"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      saveSettings({ copyFormat: e.target.value });
    });
  });
}
