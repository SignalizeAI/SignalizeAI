import { openCheckout, showLimitModal } from '../modal.js';

export function setupModalHandlers() {
  document.getElementById('modal-close-btn')?.addEventListener('click', () => {
    document.getElementById('limit-modal').classList.add('hidden');
  });

  document.getElementById('modal-upgrade-pro-btn')?.addEventListener('click', () => {
    document.getElementById('limit-modal').classList.add('hidden');
    openCheckout('a124318b-c077-4f54-b714-cc77811af78b');
  });

  document.getElementById('modal-upgrade-team-btn')?.addEventListener('click', () => {
    document.getElementById('limit-modal').classList.add('hidden');
    openCheckout('88e4933d-9fae-4a7a-8c3f-ee72d78018b0');
  });

  document.getElementById('upgrade-btn')?.addEventListener('click', () => {
    showLimitModal('upgrade');
  });
}
