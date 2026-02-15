import { loadSavedAnalyses } from './saved.js';
import { state } from './state.js';

const VIEW_MAP = {
  analysis: 'ai-analysis',
  saved: 'saved-analyses',
  settings: 'settings-view',
  profile: 'profile-view',
};

const MENU_MAP = {
  saved: 'menu-saved-analyses',
  settings: 'menu-settings',
  profile: 'menu-profile',
};

export function showView(view) {
  const cards = document.querySelectorAll('#welcome-view .website-content-card');
  cards.forEach((card) => card.classList.add('hidden'));

  const targetId = VIEW_MAP[view];
  if (targetId) {
    document.getElementById(targetId)?.classList.remove('hidden');
  }

  document.querySelectorAll('#dropdown-content .menu-item').forEach((item) => {
    item.classList.remove('active');
  });

  const menuId = MENU_MAP[view];
  if (menuId) {
    document.getElementById(menuId)?.classList.add('active');
  }

  if (view === 'saved') {
    state.currentPage = 1;
    loadSavedAnalyses();
  }
}
