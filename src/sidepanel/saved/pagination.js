import { state } from '../state.js';

function buildPageRange(totalPages, currentPage) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) pages.push('...');

  const adjustedStart = currentPage <= 3 ? 2 : start;
  const adjustedEnd = currentPage >= totalPages - 2 ? totalPages - 1 : end;

  for (let page = adjustedStart; page <= adjustedEnd; page += 1) {
    pages.push(page);
  }

  if (adjustedEnd < totalPages - 1) pages.push('...');

  pages.push(totalPages);
  return pages;
}

export function renderPagination(totalPages, onPageChange) {
  const paginationBar = document.getElementById('pagination-bar');
  const pageNumbers = document.getElementById('page-numbers');
  const prevBtn = document.getElementById('page-prev');
  const nextBtn = document.getElementById('page-next');

  if (!paginationBar || !pageNumbers) return;

  pageNumbers.innerHTML = '';

  if (!totalPages || totalPages <= 1) {
    paginationBar.classList.add('hidden');
    prevBtn?.setAttribute('disabled', 'true');
    nextBtn?.setAttribute('disabled', 'true');
    return;
  }

  paginationBar.classList.remove('hidden');

  const currentPage = state.currentPage || 1;
  const pages = buildPageRange(totalPages, currentPage);

  pages.forEach((page) => {
    if (page === '...') {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'page-ellipsis';
      ellipsis.textContent = '...';
      pageNumbers.appendChild(ellipsis);
      return;
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-number';
    btn.textContent = String(page);

    if (page === currentPage) {
      btn.classList.add('active');
    } else {
      btn.addEventListener('click', () => onPageChange(page));
    }

    pageNumbers.appendChild(btn);
  });

  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}
