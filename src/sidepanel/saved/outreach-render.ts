import {
  formatOutreachEmailBody,
  getCompanyDisplayName,
  getOutreachReplyProbability,
} from '../outreach-messages/format.js';
import {
  PROBABILITY_COLOR,
  type AngleId,
  type ReplyProbability,
} from '../outreach-messages/types.js';

interface SavedOutreachVariation {
  subject?: string;
  body?: string;
}

interface SavedOutreachAngle {
  id?: string;
  label?: string;
  variations?: SavedOutreachVariation[];
}

interface SavedOutreachPayload {
  generated_at?: string;
  recommended_angle_id?: string;
  angles?: SavedOutreachAngle[];
  follow_ups?: {
    emails?: Array<{ id?: string; label?: string; subject?: string; body?: string }>;
  };
}

interface SavedItemLike {
  outreach_angles?: SavedOutreachPayload | null;
  title?: string;
  domain?: string;
  sales_readiness_score?: number;
  best_sales_persona?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char] || char
  );
}

function getPrimaryVariation(angle: SavedOutreachAngle): SavedOutreachVariation {
  return angle.variations?.[0] || {};
}

function getRecommendedAngle(payload: SavedOutreachPayload): SavedOutreachAngle | null {
  const angles = Array.isArray(payload.angles) ? payload.angles : [];
  if (angles.length === 0) return null;

  const preferred = angles.find((angle) => angle.id === payload.recommended_angle_id);
  return preferred || angles[0];
}

function buildProbabilityBadge(probability: ReplyProbability): string {
  return `<span class="reply-probability reply-probability--${probability.toLowerCase()}" style="color:${PROBABILITY_COLOR[probability]}">${probability} reply chance</span>`;
}

function buildCopyButton(variation: SavedOutreachVariation, companyName: string): string {
  return `
    <button
      class="variation-copy-btn saved-outreach-copy-btn"
      type="button"
      aria-label="Copy email"
      data-tooltip="Copy"
      data-subject="${escapeHtml(variation.subject || '')}"
      data-body="${escapeHtml(variation.body || '')}"
      data-company-name="${escapeHtml(companyName)}"
    >
      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor"
           stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
  `;
}

function buildEmailMarkup(variation: SavedOutreachVariation, companyName: string): string {
  const paragraphs = formatOutreachEmailBody(String(variation.body || ''), companyName);

  return `
    <div class="saved-outreach-email">
      <div class="outreach-email-header">
        <div class="saved-outreach-variation-subject">${escapeHtml(variation.subject || '—')}</div>
        ${buildCopyButton(variation, companyName)}
      </div>
      ${paragraphs.map((paragraph) => `<p class="saved-outreach-variation-body">${escapeHtml(paragraph)}</p>`).join('')}
    </div>
  `;
}

function buildApproachMarkup(
  angle: SavedOutreachAngle,
  item: SavedItemLike,
  recommendedAngleId: string
): string {
  const companyName = getCompanyDisplayName(item.title, item.domain);
  const probability = getOutreachReplyProbability(
    (angle.id as AngleId) || 'curiosity',
    recommendedAngleId as AngleId,
    Number(item.sales_readiness_score ?? 0),
    item.best_sales_persona || ''
  );

  return `
    <div class="saved-outreach-card">
      <div class="saved-outreach-card-header">
        <div class="saved-outreach-card-title">${escapeHtml(angle.label || 'Outreach approach')}</div>
        ${buildProbabilityBadge(probability)}
      </div>
      ${buildEmailMarkup(getPrimaryVariation(angle), companyName)}
    </div>
  `;
}

function buildFollowUpMarkup(item: SavedItemLike, payload: SavedOutreachPayload): string {
  const emails = Array.isArray(payload.follow_ups?.emails) ? payload.follow_ups?.emails : [];
  if (!emails.length) return '';
  const companyName = getCompanyDisplayName(item.title, item.domain);

  return `
    <div class="saved-outreach-block">
      <div class="saved-outreach-list">
        ${emails
          .map(
            (email) => `
              <div class="saved-outreach-card">
                <div class="saved-outreach-card-header">
                  <div class="saved-outreach-card-title">${escapeHtml(email.label || 'Follow-Up')}</div>
                </div>
                ${buildEmailMarkup(
                  { subject: email.subject || '', body: email.body || '' },
                  companyName
                )}
              </div>
            `
          )
          .join('')}
      </div>
    </div>
  `;
}

function buildControls(
  payload: SavedOutreachPayload | null | undefined,
  expanded: boolean
): string {
  const hasOutreach = Boolean(payload?.angles?.length);
  const hasFollowUps = Boolean(payload?.follow_ups?.emails?.length);
  const primaryLabel = hasOutreach
    ? expanded
      ? 'Hide emails'
      : 'Show generated emails'
    : 'Suggest outreach emails';

  return `
    <div class="saved-outreach-controls">
      <button type="button" class="saved-outreach-action-btn saved-outreach-toggle-btn">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2"></rect>
          <path d="m3 7 9 6 9-6"></path>
        </svg>
        ${primaryLabel}
      </button>
      ${
        hasOutreach && !hasFollowUps
          ? `
            <button type="button" class="saved-outreach-action-btn saved-followups-btn">
              Generate follow-ups
            </button>
          `
          : ''
      }
    </div>
  `;
}

export function buildSavedOutreachMarkup(item: SavedItemLike, expanded = false): string {
  const payload = item.outreach_angles;
  const angles = Array.isArray(payload?.angles) ? payload.angles : [];
  const hasOutreach = angles.length > 0;
  const recommended = payload ? getRecommendedAngle(payload) : null;
  const companyName = getCompanyDisplayName(item.title, item.domain);
  const content =
    payload && hasOutreach && recommended
      ? `
        <div class="saved-outreach-content${expanded ? '' : ' hidden'}">
          <div class="saved-outreach-block">
            <div class="saved-outreach-card saved-outreach-card--recommended">
              <div class="saved-outreach-recommended-head">
                <div class="saved-outreach-recommended-kicker">★ Recommended</div>
                ${buildProbabilityBadge('High')}
              </div>
              ${buildEmailMarkup(getPrimaryVariation(recommended), companyName)}
            </div>
          </div>

          <div class="saved-outreach-block">
            <div class="saved-outreach-list">
              ${angles
                .filter((angle) => angle.id !== recommended.id)
                .map((angle) =>
                  buildApproachMarkup(
                    angle,
                    item,
                    recommended.id || payload.recommended_angle_id || 'observation'
                  )
                )
                .join('')}
            </div>
          </div>
          ${buildFollowUpMarkup(item, payload)}
        </div>
      `
      : '';

  return `
    <div class="saved-outreach-shell">
      <div class="saved-outreach-section">
        ${buildControls(payload, expanded)}
        ${content}
      </div>
    </div>
  `;
}
