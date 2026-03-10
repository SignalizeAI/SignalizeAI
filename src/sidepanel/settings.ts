import { DEFAULT_SETTINGS, type Settings } from './constants.js';

export async function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
      resolve(result as Settings);
    });
  });
}

export function saveSettings(partial: Partial<Settings>): void {
  chrome.storage.sync.set(partial);
}

export function applySettingsToUI(settings: Settings): void {
  const autoReanalysis = document.getElementById(
    'setting-auto-reanalysis'
  ) as HTMLInputElement | null;
  if (autoReanalysis) {
    autoReanalysis.checked = settings.autoReanalysis;
  }

  document
    .querySelector<HTMLInputElement>(
      `input[name="reanalysis-mode"][value="${settings.reanalysisMode}"]`
    )
    ?.click();
  document
    .querySelector<HTMLInputElement>(`input[name="copy-format"][value="${settings.copyFormat}"]`)
    ?.click();
  document
    .querySelector<HTMLInputElement>(`input[name="theme"][value="${settings.theme}"]`)
    ?.click();

  updateReanalysisUI(settings);
  applyTheme(settings.theme);
}

export function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  if (theme === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function updateReanalysisUI(settings: Settings): void {
  const section = document.getElementById('reanalysis-section');
  if (!section) return;

  if (!settings.autoReanalysis) {
    section.classList.add('disabled');
  } else {
    section.classList.remove('disabled');
  }
}
