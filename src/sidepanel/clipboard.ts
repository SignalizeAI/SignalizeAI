import { loadSettings } from './settings.js';
import { state } from './state.js';

export async function buildCopyText(): Promise<string> {
  if (!state.lastAnalysis || !state.lastExtractedMeta) return '';

  const settings = await loadSettings();
  const isShort = settings.copyFormat === 'short';

  let text = `
Website: ${state.lastExtractedMeta.title || ''}
Domain: ${state.lastExtractedMeta.domain || ''}
URL: ${state.lastExtractedMeta.url || ''}

What they do:
${state.lastAnalysis.whatTheyDo || '—'}

Target customer:
${state.lastAnalysis.targetCustomer || '—'}

Sales readiness score:
${state.lastAnalysis.salesReadinessScore ?? '—'}
`.trim();

  if (!isShort) {
    text += `

Value proposition:
${state.lastAnalysis.valueProposition || '—'}

Best persona recommendation:
${state.lastAnalysis.bestSalesPersona?.persona || '—'}
${state.lastAnalysis.bestSalesPersona?.reason ? `(${state.lastAnalysis.bestSalesPersona.reason})` : ''}

Outreach plan:
Goal: ${state.lastAnalysis.recommendedOutreach?.goal || '—'}
Angle: ${state.lastAnalysis.recommendedOutreach?.angle || '—'}
`;
  }

  return text.trim();
}

export async function buildSavedCopyText(item: any): Promise<string> {
  const settings = await loadSettings();
  const isShort = settings.copyFormat === 'short';

  let text = `
Website: ${item.title || ''}
Domain: ${item.domain || ''}
URL: ${item.url || ''}

What they do:
${item.what_they_do || '—'}

Target customer:
${item.target_customer || '—'}

Sales readiness score:
${item.sales_readiness_score ?? '—'}
`.trim();

  if (!isShort) {
    text += `

Value proposition:
${item.value_proposition || '—'}

Best persona recommendation:
${item.best_sales_persona || '—'}
${item.best_sales_persona_reason ? `(${item.best_sales_persona_reason})` : ''}

Outreach plan:
Goal: ${item.recommended_outreach_goal || '—'}
Angle: ${item.recommended_outreach_angle || '—'}
`;
  }

  return text.trim();
}

export function showActionTooltip(anchorEl: HTMLElement, message: string): void {
  if (!anchorEl || !message) return;

  const existingTooltip = anchorEl.querySelector('.copy-tooltip');
  if (existingTooltip) existingTooltip.remove();

  const tooltip = document.createElement('span');
  tooltip.className = 'copy-tooltip';
  tooltip.textContent = message;

  Object.assign(tooltip.style, {
    position: 'absolute',
    top: '-36px',
    left: '50%',
    transform: 'translateX(-50%) translateY(4px)',
    background: 'var(--text-primary)',
    color: 'var(--bg-primary)',
    fontSize: '12px',
    fontWeight: '600',
    padding: '6px 12px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    zIndex: '9999',
    opacity: '0',
    transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
  });

  anchorEl.style.position = 'relative';
  anchorEl.appendChild(tooltip);

  const clippingAncestor = findClippingAncestor(anchorEl);
  const tooltipRect = tooltip.getBoundingClientRect();
  const ancestorRect = clippingAncestor?.getBoundingClientRect();
  if (ancestorRect && tooltipRect.top < ancestorRect.top + 4) {
    tooltip.style.top = 'calc(100% + 8px)';
  }

  void tooltip.offsetWidth;
  tooltip.style.opacity = '1';
  tooltip.style.transform = 'translateX(-50%) translateY(0)';

  setTimeout(() => {
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translateX(-50%) translateY(4px)';
    setTimeout(() => tooltip.remove(), 200);
  }, 1200);
}

export function copyAnalysisText(text: string, anchorEl: HTMLElement, formatLabel = ''): void {
  if (!text || !anchorEl) return;

  navigator.clipboard
    .writeText(text)
    .then(() => {
      const existingTooltip = anchorEl.querySelector('.copy-tooltip');
      if (existingTooltip) existingTooltip.remove();

      const tooltip = document.createElement('span');
      tooltip.className = 'copy-tooltip';
      tooltip.textContent = formatLabel ? `Copied ${formatLabel}` : 'Copied';

      Object.assign(tooltip.style, {
        position: 'absolute',
        top: '-36px',
        left: '50%',
        transform: 'translateX(-50%) translateY(4px)',
        background: 'var(--text-primary)',
        color: 'var(--bg-primary)',
        fontSize: '12px',
        fontWeight: '600',
        padding: '6px 12px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: '9999',
        opacity: '0',
        transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
      });

      anchorEl.style.position = 'relative';
      anchorEl.appendChild(tooltip);

      // If the tooltip would be clipped at the top (first visible row, scroll containers), flip it below.
      const clippingAncestor = findClippingAncestor(anchorEl);
      const tooltipRect = tooltip.getBoundingClientRect();
      const ancestorRect = clippingAncestor?.getBoundingClientRect();
      if (ancestorRect && tooltipRect.top < ancestorRect.top + 4) {
        tooltip.style.top = 'calc(100% + 8px)';
      }

      // Trigger reflow for transition
      void tooltip.offsetWidth;

      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateX(-50%) translateY(0)';

      const svg = anchorEl.querySelector('svg');
      const originalSvgData = svg?.innerHTML;

      if (svg) {
        anchorEl.style.color = '#22c55e';
        svg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
      }

      setTimeout(() => {
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateX(-50%) translateY(4px)';

        if (svg && originalSvgData) {
          anchorEl.style.color = '';
          svg.innerHTML = originalSvgData;
        }

        setTimeout(() => tooltip.remove(), 200);
      }, 1500);
    })
    .catch((err) => {
      console.error('Copy failed:', err);
    });
}

function findClippingAncestor(el: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = el.parentElement;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    const overflow = style.overflow;
    const canClip =
      overflowY === 'auto' ||
      overflowY === 'scroll' ||
      overflowY === 'hidden' ||
      overflow === 'auto' ||
      overflow === 'scroll' ||
      overflow === 'hidden';

    if (canClip) return current;
    current = current.parentElement;
  }

  return null;
}
