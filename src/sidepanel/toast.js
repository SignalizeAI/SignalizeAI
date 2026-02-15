export function showToast(message) {
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
