import { handleExport } from '../saved/index.js';

export function setupExportHandlers() {
  document.getElementById('export-csv')?.addEventListener('click', async () => {
    await handleExport('csv');
  });

  document.getElementById('export-xlsx')?.addEventListener('click', async () => {
    await handleExport('xlsx');
  });

  const exportToggle = document.getElementById('export-menu-toggle');
  const exportMenu = document.getElementById('export-menu');

  exportToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    exportMenu?.classList.toggle('hidden');
    const expanded = exportToggle.getAttribute('aria-expanded') === 'true';
    exportToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  });

  document.addEventListener('click', () => {
    if (!exportMenu?.classList.contains('hidden')) {
      exportMenu.classList.add('hidden');
      exportToggle?.setAttribute('aria-expanded', 'false');
    }
  });
}
