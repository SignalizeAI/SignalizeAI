import { DEFAULT_SETTINGS } from "./constants.js";

export async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, resolve);
  });
}

export function saveSettings(partial) {
  chrome.storage.sync.set(partial);
}

export function applySettingsToUI(settings) {
  const autoReanalysis = document.getElementById("setting-auto-reanalysis");
  if (autoReanalysis) {
    autoReanalysis.checked = settings.autoReanalysis;
  }

  document
    .querySelector(
      `input[name="reanalysis-mode"][value="${settings.reanalysisMode}"]`
    )
    ?.click();
  document
    .querySelector(`input[name="copy-format"][value="${settings.copyFormat}"]`)
    ?.click();

  updateReanalysisUI(settings);
}

export function updateReanalysisUI(settings) {
  const section = document.getElementById("reanalysis-section");
  if (!section) return;

  if (!settings.autoReanalysis) {
    section.classList.add("disabled");
  } else {
    section.classList.remove("disabled");
  }
}
