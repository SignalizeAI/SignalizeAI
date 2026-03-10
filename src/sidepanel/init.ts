import { setupAnalysisHandlers } from './handlers/analysis-handlers.js';
import { setupAuthHandlers } from './handlers/auth-handlers.js';
import { setupBatchHandlers } from './handlers/batch-handlers.js';
import { setupExportHandlers } from './handlers/export-handlers.js';
import { setupFilterHandlers } from './handlers/filter-handlers.js';
import { setupModalHandlers } from './handlers/modal-handlers.js';
import { setupNavigationHandlers } from './handlers/navigation-handlers.js';
import { setupRuntimeHandlers } from './handlers/runtime-handlers.js';
import { setupSavedHandlers } from './handlers/saved-handlers.js';
import { setupSettingsHandlers } from './handlers/settings-handlers.js';
import { loadSettings, applyTheme } from './settings.js';

export function initSidepanel(): void {
  loadSettings().then((settings) => applyTheme(settings.theme));
  setupAnalysisHandlers();
  setupAuthHandlers();
  setupBatchHandlers();
  setupSavedHandlers();
  setupSettingsHandlers();
  setupExportHandlers();
  setupNavigationHandlers();
  setupFilterHandlers();
  setupModalHandlers();
  setupRuntimeHandlers();
}
