import { loadSettings, saveSettings, updateReanalysisUI } from '../settings.js';
import { settingsMenu } from '../elements.js';
import { navigateTo } from '../ui.js';
import { state } from '../state.js';

export function setupSettingsHandlers(): void {
  settingsMenu?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    navigateTo('settings');
  });

  const autoReanalysisCheckbox = document.getElementById('setting-auto-reanalysis') as HTMLInputElement | null;

  autoReanalysisCheckbox?.addEventListener('change', async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const autoReanalysis = target.checked;

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

  document.querySelectorAll<HTMLInputElement>('input[name="copy-format"]').forEach((radio) => {
    radio.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLInputElement;
      saveSettings({ copyFormat: target.value as 'full' | 'short' });
    });
  });
}
