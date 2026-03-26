import { loadSettings } from './settings.js';
import { state } from './state.js';
import { splitPersistedOutreachAngle } from './analysis/outreach-angle.js';

interface CopyVariationLike {
  subject?: string;
  body?: string;
}

interface CopyAngleLike {
  id?: string;
  label?: string;
  variations?: CopyVariationLike[];
}

interface CopyFollowUpLike {
  label?: string;
  subject?: string;
  body?: string;
}

interface CopyOutreachPayloadLike {
  recommended_angle_id?: string;
  angles?: CopyAngleLike[];
  follow_ups?: {
    emails?: CopyFollowUpLike[];
  };
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim() || '—';
}

function formatBulletList(value: string): string {
  const items = splitPersistedOutreachAngle(value);
  if (!items.length) return '—';
  return items.map((item) => `• ${item}`).join('\n');
}

function formatEmailBlock(
  heading: string,
  subject: string | undefined,
  body: string | undefined
): string {
  return `${heading}
Subject: ${normalizeText(subject)}
Body:
${normalizeText(body)}`;
}

function getAngleLabel(angle: CopyAngleLike, fallback: string): string {
  return normalizeText(angle.label || fallback);
}

function getRecommendedAngle(payload: CopyOutreachPayloadLike | null): CopyAngleLike | null {
  const angles = Array.isArray(payload?.angles) ? payload.angles : [];
  if (!angles.length) return null;
  return (
    angles.find((angle) => angle?.id && angle.id === payload?.recommended_angle_id) || angles[0]
  );
}

function getSecondaryAngles(
  payload: CopyOutreachPayloadLike | null,
  recommendedId?: string
): CopyAngleLike[] {
  const angles = Array.isArray(payload?.angles) ? payload.angles : [];
  return angles.filter((angle) => angle?.id !== recommendedId);
}

function buildEmailsSection(payload: CopyOutreachPayloadLike | null): string {
  const recommended = getRecommendedAngle(payload);
  const recommendedVariation = recommended?.variations?.[0];
  const otherAngles = getSecondaryAngles(payload, recommended?.id);
  const followUps = Array.isArray(payload?.follow_ups?.emails) ? payload?.follow_ups?.emails : [];

  const blocks: string[] = [];

  if (recommendedVariation) {
    blocks.push(
      formatEmailBlock('Recommended', recommendedVariation.subject, recommendedVariation.body)
    );
  }

  otherAngles.forEach((angle, index) => {
    const variation = angle.variations?.[0];
    if (!variation) return;
    blocks.push(
      formatEmailBlock(
        getAngleLabel(angle, `Email ${index + 1}`),
        variation.subject,
        variation.body
      )
    );
  });

  followUps.forEach((email, index) => {
    blocks.push(
      formatEmailBlock(
        normalizeText(email.label || `Follow-Up ${index + 1}`),
        email.subject,
        email.body
      )
    );
  });

  if (!blocks.length) {
    return `Emails
—`;
  }

  return `Emails

${blocks.join('\n\n')}`;
}

function buildStrategySection(goal: string, angle: string): string {
  return `Strategy

Goal:
${normalizeText(goal)}

Outreach angle:
${formatBulletList(angle)}`;
}

function buildSnapshotSection(
  item: {
    title?: string;
    whatTheyDo?: string;
    description?: string;
    valueProposition?: string;
    targetCustomer?: string;
    salesReadinessScore?: number;
    bestPersona?: string;
    bestPersonaReason?: string;
    url?: string;
    domain?: string;
  },
  isShort: boolean
): string {
  const lines = [
    'Snapshot',
    '',
    `Title:
${normalizeText(item.title)}`,
    '',
    `What they do:
${normalizeText(item.whatTheyDo)}`,
  ];

  if (!isShort) {
    lines.push(
      '',
      `Company overview:
${normalizeText(item.description)}`,
      '',
      `Value proposition:
${normalizeText(item.valueProposition)}`
    );
  }

  lines.push(
    '',
    `Target customer:
${normalizeText(item.targetCustomer)}`,
    '',
    `Sales readiness:
${normalizeText(item.salesReadinessScore)}`,
    '',
    `Best persona recommendation:
${normalizeText(item.bestPersona)}${
      !isShort && item.bestPersonaReason ? `\n(${normalizeText(item.bestPersonaReason)})` : ''
    }`,
    '',
    `URL:
${normalizeText(item.url)}`
  );

  if (!isShort && item.domain) {
    lines.push(
      '',
      `Domain:
${normalizeText(item.domain)}`
    );
  }

  return lines.join('\n');
}

export async function buildCopyText(): Promise<string> {
  if (!state.lastAnalysis || !state.lastExtractedMeta) return '';

  const settings = await loadSettings();
  const isShort = settings.copyFormat === 'short';
  const payload: CopyOutreachPayloadLike | null = state.outreachAngles
    ? {
        recommended_angle_id: state.outreachAngles.recommendedAngleId,
        angles: state.outreachAngles.angles,
        ...(state.followUpEmails ? { follow_ups: state.followUpEmails } : {}),
      }
    : null;

  return [
    buildStrategySection(
      state.lastAnalysis.recommendedOutreach?.goal || '',
      state.lastAnalysis.recommendedOutreach?.angle || ''
    ),
    buildEmailsSection(payload),
    buildSnapshotSection(
      {
        title: state.lastExtractedMeta.title,
        whatTheyDo: state.lastAnalysis.whatTheyDo,
        description: state.lastExtractedMeta.description,
        valueProposition: state.lastAnalysis.valueProposition,
        targetCustomer: state.lastAnalysis.targetCustomer,
        salesReadinessScore: state.lastAnalysis.salesReadinessScore,
        bestPersona: state.lastAnalysis.bestSalesPersona?.persona,
        bestPersonaReason: state.lastAnalysis.bestSalesPersona?.reason,
        url: state.lastExtractedMeta.url,
        domain: state.lastExtractedMeta.domain,
      },
      isShort
    ),
  ]
    .join('\n\n')
    .trim();
}

export async function buildSavedCopyText(item: any): Promise<string> {
  const settings = await loadSettings();
  const isShort = settings.copyFormat === 'short';
  const payload =
    item.outreach_angles && typeof item.outreach_angles === 'object'
      ? (item.outreach_angles as CopyOutreachPayloadLike)
      : null;

  return [
    buildStrategySection(
      item.recommended_outreach_goal || '',
      item.recommended_outreach_angle || ''
    ),
    buildEmailsSection(payload),
    buildSnapshotSection(
      {
        title: item.title,
        whatTheyDo: item.what_they_do,
        description: item.description,
        valueProposition: item.value_proposition,
        targetCustomer: item.target_customer,
        salesReadinessScore: item.sales_readiness_score,
        bestPersona: item.best_sales_persona,
        bestPersonaReason: item.best_sales_persona_reason,
        url: item.url,
        domain: item.domain,
      },
      isShort
    ),
  ]
    .join('\n\n')
    .trim();
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
