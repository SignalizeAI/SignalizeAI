export function showToast(message: string): void {
  let toast = document.getElementById('simple-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'simple-toast';
    toast.className = 'toast-snackbar';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 1800);
}

export function showErrorToast(message: string): void {
  let toast = document.getElementById('error-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'error-toast';
    toast.className = 'toast-snackbar error-toast';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div class="toast-content">
      <div class="toast-main">
        <svg class="toast-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 1.5C4.41 1.5 1.5 4.41 1.5 8C1.5 11.59 4.41 14.5 8 14.5C11.59 14.5 14.5 11.59 14.5 8C14.5 4.41 11.59 1.5 8 1.5ZM8.75 11.25H7.25V9.75H8.75V11.25ZM8.75 8.25H7.25V4.75H8.75V8.25Z" fill="currentColor"/>
        </svg>
        <span class="toast-message">${message}</span>
      </div>
      <button class="toast-close-btn">✕</button>
    </div>
  `;

  toast.classList.add('show');

  const closeBtn = toast.querySelector('.toast-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      toast!.classList.remove('show');
    });
  }

  setTimeout(() => {
    toast!.classList.remove('show');
  }, 3500);
}
