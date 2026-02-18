import { state } from '../state.js';

export function renderPagination(totalPages) {
  const bar = document.getElementById('pagination-bar');
  const container = document.getElementById('page-numbers');

  if (!bar || !container) return;

  container.innerHTML = '';

  if (totalPages <= 1) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');

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

function makePageBtn(page) {
  const btn = document.createElement('button');
  btn.textContent = page;
  btn.className = 'page-number' + (page === state.currentPage ? ' active' : '');
  btn.onclick = async () => {
    const { fetchAndRenderPage } = await import('./data.js');
    state.currentPage = page;
    await fetchAndRenderPage();
  };
  return btn;
}

function makeEllipsis() {
  const span = document.createElement('span');
  span.textContent = '…';
  span.className = 'page-ellipsis';
  return span;
}
