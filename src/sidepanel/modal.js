import { supabase } from './supabase.js';
import { state } from './state.js';

export async function openCheckout(variantId) {
  const { data } = await supabase.auth.getSession();
  if (!data?.session?.user) return;

  const email = data.session.user.email;
  const userId = data.session.user.id;
  const plan = variantId === '56ab66c1-587f-453a-8d51-4cd2c3e61849' ? 'team' : 'pro';
  const successUrl = encodeURIComponent(`https://signalizeai.org/payment-success?plan=${plan}`);

  const checkoutUrl =
    `https://signalizeaipay.lemonsqueezy.com/checkout/buy/${variantId}` +
    `?checkout[email]=${encodeURIComponent(email)}` +
    `&checkout[custom][user_id]=${encodeURIComponent(userId)}` +
    `&checkout[custom][plan]=${plan}` +
    `&checkout[success_url]=${successUrl}` +
    `&media=0&desc=0&discount=0`;

  chrome.tabs.create({ url: checkoutUrl });
}

export function showLimitModal(type) {
  const modal = document.getElementById('limit-modal');
  const msgEl = document.getElementById('limit-modal-message');
  const headerEl = modal?.querySelector('.modal-header h3');
  const proBtn = document.getElementById('modal-upgrade-pro-btn');
  const teamBtn = document.getElementById('modal-upgrade-team-btn');

  if (!modal || !msgEl) return;

  let message = '';
  let title = 'Limit Reached';

  if (type === 'save') {
    message = `You've reached your limit of ${state.maxSavedLimit} saved items. Upgrade to increase it.`;
  } else if (type === 'analysis') {
    message = `You've used all ${state.dailyLimitFromAPI} analyses for today. Upgrade to increase your limit.`;
  } else {
    title = 'Upgrade Plan';
    message = 'Unlock higher limits and advanced features by upgrading your plan.';
  }

  if (headerEl) headerEl.textContent = title;
  msgEl.textContent = message;
  modal.classList.remove('hidden');

  if (state.currentPlan === 'pro') {
    if (proBtn) proBtn.classList.add('hidden');
    if (teamBtn) teamBtn.textContent = 'Upgrade to Team';
  } else {
    if (proBtn) proBtn.classList.remove('hidden');
    if (proBtn) proBtn.textContent = 'Upgrade to Pro';
    if (teamBtn) teamBtn.textContent = 'Upgrade to Team';
  }
}
