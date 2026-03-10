import { state } from '../state.js';

let isSavedPageTransitioning = false;

export async function navigateSavedPage(page: number): Promise<void> {
  if (isSavedPageTransitioning || page === state.currentPage) return;
  isSavedPageTransitioning = true;

  const { fetchAndRenderPage, showSavedPaginationSkeleton } = await import('./data.js');
  state.currentPage = page;
  showSavedPaginationSkeleton();
  await new Promise((resolve) => setTimeout(resolve, 120));
  await fetchAndRenderPage({ paginationTransition: true });

  isSavedPageTransitioning = false;
}

export function renderPagination(totalPages: number): void {
  const bar = document.getElementById('pagination-bar');
  const container = document.getElementById('page-numbers');
  const prevBtn = document.getElementById('page-prev') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('page-next') as HTMLButtonElement | null;

  if (!bar || !container) return;

  container.innerHTML = '';

  if (totalPages <= 1) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  if (prevBtn) {
    prevBtn.disabled = state.currentPage === 1;
    prevBtn.classList.toggle('hidden', state.currentPage === 1);
  }
  if (nextBtn) {
    nextBtn.disabled = state.currentPage >= totalPages;
    nextBtn.classList.toggle('hidden', state.currentPage >= totalPages);
  }

  const maxVisible = 5;

  let start = Math.max(1, state.currentPage - 2);
  let end = Math.min(totalPages, state.currentPage + 2);

  if (end - start < maxVisible - 1) {
    if (start === 1) {
      end = Math.min(totalPages, start + maxVisible - 1);
    } else if (end === totalPages) {
      start = Math.max(1, end - maxVisible + 1);
    }
  }

  if (start > 1) {
    container.appendChild(makePageBtn(1));
    if (start > 2) container.appendChild(makeEllipsis());
  }

  for (let i = start; i <= end; i++) {
    container.appendChild(makePageBtn(i));
  }

  if (end < totalPages) {
    if (end < totalPages - 1) container.appendChild(makeEllipsis());
    container.appendChild(makePageBtn(totalPages));
  }
}

function makePageBtn(page: number): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = String(page);
  btn.className = 'page-number' + (page === state.currentPage ? ' active' : '');
  btn.onclick = async () => navigateSavedPage(page);
  return btn;
}

function makeEllipsis(): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = '…';
  span.className = 'page-ellipsis';
  return span;
}
