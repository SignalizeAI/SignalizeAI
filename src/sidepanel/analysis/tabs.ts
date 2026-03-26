import { state } from '../state.js';

type AnalysisTab = typeof state.analysisTab;

function getTabButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[data-analysis-tab-button]'));
}

function getTabPanels(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-analysis-panel]'));
}

function updateTabUi(activeTab: AnalysisTab): void {
  getTabButtons().forEach((button) => {
    const isActive = button.dataset.analysisTabButton === activeTab;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-selected', String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });

  getTabPanels().forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.analysisPanel !== activeTab);
  });
}

export function setActiveAnalysisTab(tab: AnalysisTab): void {
  state.analysisTab = tab;
  updateTabUi(tab);
}

export function initAnalysisTabs(): void {
  const container = document.getElementById('analysis-tabs');
  if (!container || container.dataset.bound === 'true') {
    updateTabUi(state.analysisTab);
    return;
  }

  container.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest(
      '[data-analysis-tab-button]'
    ) as HTMLButtonElement | null;
    if (!button) return;
    const nextTab = button.dataset.analysisTabButton as AnalysisTab | undefined;
    if (!nextTab) return;
    setActiveAnalysisTab(nextTab);
  });

  container.dataset.bound = 'true';
  updateTabUi(state.analysisTab);
}
