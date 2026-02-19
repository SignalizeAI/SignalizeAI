import { openCheckout, showLimitModal } from '../modal.js';

export function setupModalHandlers() {
  document.getElementById('modal-close-btn')?.addEventListener('click', () => {
    document.getElementById('limit-modal').classList.add('hidden');
  });

  document.getElementById('modal-upgrade-pro-btn')?.addEventListener('click', () => {
    document.getElementById('limit-modal').classList.add('hidden');
    openCheckout('9abd3513-c941-45dc-9d2f-18124ef12e9a');
  });

  document.getElementById('modal-upgrade-team-btn')?.addEventListener('click', () => {
    document.getElementById('limit-modal').classList.add('hidden');
    openCheckout('56ab66c1-587f-453a-8d51-4cd2c3e61849');
  });

  document.getElementById('upgrade-btn')?.addEventListener('click', () => {
    showLimitModal('upgrade');
  });
}
