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

Sales angle:
${state.lastAnalysis.salesAngle || '—'}

Best sales persona:
${state.lastAnalysis.bestSalesPersona?.persona || '—'}
${state.lastAnalysis.bestSalesPersona?.reason ? `(${state.lastAnalysis.bestSalesPersona.reason})` : ''}

Recommended outreach:
Who: ${state.lastAnalysis.recommendedOutreach?.persona || '—'}
Goal: ${state.lastAnalysis.recommendedOutreach?.goal || '—'}
Angle: ${state.lastAnalysis.recommendedOutreach?.angle || '—'}
Message:
${state.lastAnalysis.recommendedOutreach?.message || '—'}
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

Sales angle:
${item.sales_angle || '—'}

Best sales persona:
${item.best_sales_persona || '—'}
${item.best_sales_persona_reason ? `(${item.best_sales_persona_reason})` : ''}

Recommended outreach:
Who: ${item.recommended_outreach_persona || '—'}
Goal: ${item.recommended_outreach_goal || '—'}
Angle: ${item.recommended_outreach_angle || '—'}
Message:
${item.recommended_outreach_message || '—'}
`;
  }

  return text.trim();
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
