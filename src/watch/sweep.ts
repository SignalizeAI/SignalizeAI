/**
 * The watch sweep: re-check saved prospects on a schedule and record what changed.
 *
 * This runs in the background service worker, driven by `chrome.alarms`.
 *
 * This remains the browser-only mode. The website can separately enroll an
 * account in server monitoring with explicit consent; enrollment switches off
 * this legacy watch_enabled bit. Old clients cannot enroll server monitoring.
 * Extraction/diff modules are DOM-free and synchronized with the backend.
 *
 * The cost is that checks only happen while the browser is running. The action
 * badge is what brings the user back.
 */

import { API_BASE_URL } from '../config.js';
import {
  buildSnapshot,
  looksBlocked,
  findSectionUrl,
  PRICING_LINK_PATTERN,
  CAREERS_LINK_PATTERN,
} from './extract.js';
import { diffSnapshots } from './diff.js';
import {
  FALLBACK_WATCH_LIMITS,
  MAX_CHECK_FAILURES,
  SNAPSHOT_RETENTION,
  SWEEP_BATCH_SIZE,
  isDueForCheck,
  watchLimitsForPlan,
} from './plans.js';
import {
  getWatchSession,
  restDelete,
  restInsert,
  restPatch,
  restSelect,
  type WatchSession,
} from './supabase-rest.js';
import type { DetectedChange, Snapshot } from './types.js';

const FETCH_TIMEOUT_MS = 20000;
const SWEEP_LOCK_KEY = 'watchSweepRunning';
const SWEEP_LOCK_TTL_MS = 5 * 60 * 1000;

interface WatchedRow {
  id: string;
  domain: string;
  url: string;
  last_checked_at: string | null;
  check_failure_count: number | null;
}

interface SnapshotRow {
  id: string;
  domain: string;
  captured_at: string;
  content_hash: string;
  title: string | null;
  meta_description: string | null;
  headings: string[] | null;
  paragraphs: string[] | null;
  nav_links: string[] | null;
  pricing_present: boolean | null;
  pricing_text: string | null;
  pricing_amounts: string[] | null;
  careers_present: boolean | null;
  careers_roles: string[] | null;
  fetch_status: string | null;
}

export async function hashSnapshot(snapshot: Snapshot): Promise<string> {
  const text = [
    snapshot.title,
    snapshot.metaDescription,
    ...(snapshot.headings || []),
    ...(snapshot.navLinks || []),
    ...(snapshot.pricingAmounts || []),
    ...(snapshot.careersRoles || []),
  ].join(' ');

  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function rowToSnapshot(row: SnapshotRow): Snapshot {
  return {
    domain: row.domain,
    url: '',
    capturedAt: row.captured_at,
    contentHash: row.content_hash || '',
    title: row.title || '',
    metaDescription: row.meta_description || '',
    headings: row.headings || [],
    paragraphs: row.paragraphs || [],
    navLinks: row.nav_links || [],
    pricingPresent: Boolean(row.pricing_present),
    pricingText: row.pricing_text,
    pricingAmounts: row.pricing_amounts || [],
    careersPresent: Boolean(row.careers_present),
    careersRoles: row.careers_roles || [],
    fetchStatus: (row.fetch_status as Snapshot['fetchStatus']) || 'ok',
  };
}

async function fetchHtml(
  url: string
): Promise<{ ok: boolean; html: string; status: number; timedOut: boolean }> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      signal: controller.signal,
    });
    const html = await res.text();
    return { ok: res.ok, html, status: res.status, timedOut: false };
  } catch {
    return { ok: false, html: '', status: 0, timedOut };
  } finally {
    clearTimeout(timeout);
  }
}

/** Try an explicit path first, then a nav link that looks right. */
async function fetchSection(
  originUrl: string,
  homepageHtml: string,
  paths: string[],
  linkPattern: RegExp
): Promise<string | null> {
  for (const path of paths) {
    const candidate = new URL(path, originUrl).href;
    const result = await fetchHtml(candidate);
    if (result.ok && result.html && !looksBlocked(result.html, result.status)) {
      return result.html;
    }
  }

  const linked = findSectionUrl(homepageHtml, originUrl, linkPattern);
  if (!linked) return null;

  const result = await fetchHtml(linked);
  if (result.ok && result.html && !looksBlocked(result.html, result.status)) {
    return result.html;
  }

  return null;
}

/** Capture one snapshot of a watched prospect. Never throws. */
export async function captureSnapshot(row: WatchedRow): Promise<Snapshot> {
  const originUrl = (() => {
    try {
      return new URL(row.url || `https://${row.domain}`).origin;
    } catch {
      return `https://${row.domain}`;
    }
  })();

  const homepage = await fetchHtml(originUrl);

  if (!homepage.ok || looksBlocked(homepage.html, homepage.status)) {
    const status: Snapshot['fetchStatus'] = homepage.timedOut
      ? 'timeout'
      : homepage.status === 404
        ? 'not_found'
        : homepage.status === 0
          ? 'error'
          : 'blocked';

    return buildSnapshot({
      domain: row.domain,
      url: originUrl,
      homepageHtml: '',
      fetchStatus: status,
    });
  }

  const pricingHtml = await fetchSection(
    originUrl,
    homepage.html,
    ['/pricing', '/plans'],
    PRICING_LINK_PATTERN
  );

  const careersHtml = await fetchSection(
    originUrl,
    homepage.html,
    ['/careers', '/jobs'],
    CAREERS_LINK_PATTERN
  );

  const snapshot = buildSnapshot({
    domain: row.domain,
    url: originUrl,
    homepageHtml: homepage.html,
    pricingHtml,
    careersHtml,
    fetchStatus: 'ok',
  });

  snapshot.contentHash = await hashSnapshot(snapshot);
  return snapshot;
}

function snapshotToRow(
  session: WatchSession,
  savedAnalysisId: string,
  snapshot: Snapshot
): Record<string, unknown> {
  return {
    user_id: session.userId,
    saved_analysis_id: savedAnalysisId,
    domain: snapshot.domain,
    captured_at: snapshot.capturedAt,
    content_hash: snapshot.contentHash,
    title: snapshot.title,
    meta_description: snapshot.metaDescription,
    headings: snapshot.headings,
    paragraphs: snapshot.paragraphs,
    nav_links: snapshot.navLinks,
    pricing_present: snapshot.pricingPresent,
    // The full pricing page text is large and only used for display context.
    pricing_text: snapshot.pricingText ? snapshot.pricingText.slice(0, 4000) : null,
    pricing_amounts: snapshot.pricingAmounts,
    careers_present: snapshot.careersPresent,
    careers_roles: snapshot.careersRoles,
    fetch_status: snapshot.fetchStatus,
  };
}

/**
 * Ask the Worker for a one-line summary and opener.
 *
 * Groq is unreliable enough that batch mode already ships a fallback path, so
 * this one degrades the same way: on any failure the deterministic summary and
 * the raw before/after are stored instead. The alert is the product; the
 * sentence is decoration.
 */
async function requestChangeSummary(
  session: WatchSession,
  domain: string,
  change: DetectedChange
): Promise<{ summary: string; suggestedOpener: string | null }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(`${API_BASE_URL}/change-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessToken}`,
      },
      credentials: 'omit',
      signal: controller.signal,
      body: JSON.stringify({
        domain,
        change_type: change.changeType,
        before_text: change.beforeText.slice(0, 1200),
        after_text: change.afterText.slice(0, 1200),
      }),
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return { summary: change.summary, suggestedOpener: null };

    const data = (await res.json()) as { summary?: string; suggested_opener?: string };
    return {
      summary: data?.summary?.trim() || change.summary,
      suggestedOpener: data?.suggested_opener?.trim() || null,
    };
  } catch {
    return { summary: change.summary, suggestedOpener: null };
  }
}

async function pruneSnapshots(session: WatchSession, savedAnalysisId: string): Promise<void> {
  const { data } = await restSelect<{ id: string }>(
    session.accessToken,
    `prospect_snapshots?saved_analysis_id=eq.${savedAnalysisId}` +
      `&select=id&order=captured_at.desc&offset=${SNAPSHOT_RETENTION}&limit=100`
  );

  for (const row of data) {
    await restDelete(session.accessToken, `prospect_snapshots?id=eq.${row.id}`);
  }
}

async function loadWatchInterval(session: WatchSession): Promise<number> {
  try {
    const res = await fetch(`${API_BASE_URL}/quota`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      credentials: 'omit',
    });
    if (!res.ok) return FALLBACK_WATCH_LIMITS.checkIntervalHours;

    const data = (await res.json()) as { plan?: string; check_interval_hours?: number };
    if (Number.isFinite(data?.check_interval_hours) && Number(data.check_interval_hours) > 0) {
      return Number(data.check_interval_hours);
    }
    return watchLimitsForPlan(data?.plan).checkIntervalHours;
  } catch {
    return FALLBACK_WATCH_LIMITS.checkIntervalHours;
  }
}

/** Count of change rows the user has not seen yet. Drives the action badge. */
export async function countUnseenChanges(session: WatchSession): Promise<number> {
  const { data } = await restSelect<{ id: string }>(
    session.accessToken,
    'prospect_changes?seen_at=is.null&dismissed_at=is.null&select=id&limit=100'
  );
  return data.length;
}

export async function updateActionBadge(count: number): Promise<void> {
  const action = chrome.action || (chrome as any).browserAction;
  if (!action?.setBadgeText) return;

  try {
    await action.setBadgeText({ text: count > 0 ? (count > 99 ? '99+' : String(count)) : '' });
    if (action.setBadgeBackgroundColor) {
      await action.setBadgeBackgroundColor({ color: '#16a34a' });
    }
  } catch {
    // Badge APIs are best effort and differ between Chrome and Firefox.
  }
}

export async function refreshActionBadge(): Promise<void> {
  const session = await getWatchSession();
  if (!session) {
    await updateActionBadge(0);
    return;
  }
  await updateActionBadge(await countUnseenChanges(session));
}

async function acquireSweepLock(): Promise<boolean> {
  const existing = await new Promise<number>((resolve) => {
    chrome.storage.local.get(SWEEP_LOCK_KEY, (obj) => resolve(Number(obj[SWEEP_LOCK_KEY] || 0)));
  });

  if (existing && Date.now() - existing < SWEEP_LOCK_TTL_MS) return false;

  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [SWEEP_LOCK_KEY]: Date.now() }, () => resolve());
  });
  return true;
}

async function releaseSweepLock(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.remove(SWEEP_LOCK_KEY, () => resolve());
  });
}

export interface SweepResult {
  checked: number;
  changesDetected: number;
  /**
   * Accounts whose first usable snapshot was taken this pass. They cannot
   * report a change yet, and reporting them as "nothing changed" reads as the
   * feature being broken on the very first check.
   */
  baselines: number;
  skipped: string | null;
}

/** Outcome of checking a single watched account. */
type CheckOutcome = 'change' | 'baseline' | 'none' | 'failed';

/**
 * One sweep pass. Processes at most SWEEP_BATCH_SIZE domains sequentially so a
 * sweep never competes with a user-initiated analysis for the fetch path.
 */
export async function runWatchSweep(options?: { force?: boolean }): Promise<SweepResult> {
  const session = await getWatchSession();
  if (!session) return { checked: 0, changesDetected: 0, baselines: 0, skipped: 'not signed in' };

  if (!(await acquireSweepLock())) {
    return { checked: 0, changesDetected: 0, baselines: 0, skipped: 'sweep already running' };
  }

  try {
    const intervalHours = await loadWatchInterval(session);

    const { ok, data: watched } = await restSelect<WatchedRow>(
      session.accessToken,
      'saved_analyses?watch_enabled=eq.true' +
        `&check_failure_count=lt.${MAX_CHECK_FAILURES}` +
        '&select=id,domain,url,last_checked_at,check_failure_count' +
        '&order=last_checked_at.asc.nullsfirst&limit=100'
    );

    if (!ok)
      return { checked: 0, changesDetected: 0, baselines: 0, skipped: 'could not read watch list' };

    // A manual "check now" bypasses the plan interval. Without this the button
    // silently does nothing until the interval elapses (a week on Free), which
    // reads as the feature being broken.
    const due = (
      options?.force
        ? watched
        : watched.filter((row) =>
            isDueForCheck({
              lastCheckedAt: row.last_checked_at,
              intervalHours,
              domain: row.domain,
            })
          )
    ).slice(0, SWEEP_BATCH_SIZE);

    let changesDetected = 0;
    let baselines = 0;

    for (const row of due) {
      try {
        const outcome = await checkOneProspect(session, row);
        if (outcome === 'change') changesDetected += 1;
        else if (outcome === 'baseline') baselines += 1;
      } catch (error) {
        console.warn('Watch check failed for', row.domain, error);
      }
    }

    await updateActionBadge(await countUnseenChanges(session));

    return { checked: due.length, changesDetected, baselines, skipped: null };
  } finally {
    await releaseSweepLock();
  }
}

async function checkOneProspect(session: WatchSession, row: WatchedRow): Promise<CheckOutcome> {
  const snapshot = await captureSnapshot(row);
  const now = new Date().toISOString();

  if (snapshot.fetchStatus !== 'ok') {
    const failures = Number(row.check_failure_count || 0) + 1;
    await restPatch(session.accessToken, `saved_analyses?id=eq.${row.id}`, {
      last_checked_at: now,
      check_failure_count: failures,
      // After three consecutive failures stop retrying and surface the state.
      ...(failures >= MAX_CHECK_FAILURES ? { watch_enabled: false } : {}),
    });

    // Record the failed read so the timeline shows why checking stopped.
    await restInsert(
      session.accessToken,
      'prospect_snapshots',
      snapshotToRow(session, row.id, snapshot)
    );
    await pruneSnapshots(session, row.id);
    return 'failed';
  }

  const { data: previousRows } = await restSelect<SnapshotRow>(
    session.accessToken,
    `prospect_snapshots?saved_analysis_id=eq.${row.id}&fetch_status=eq.ok` +
      '&select=*&order=captured_at.desc&limit=1'
  );

  const previous = previousRows.length ? rowToSnapshot(previousRows[0]) : null;

  await restInsert(
    session.accessToken,
    'prospect_snapshots',
    snapshotToRow(session, row.id, snapshot)
  );
  await pruneSnapshots(session, row.id);

  await restPatch(session.accessToken, `saved_analyses?id=eq.${row.id}`, {
    last_checked_at: now,
    check_failure_count: 0,
  });

  // No previous usable snapshot means this pass established the baseline.
  // Report it distinctly so the UI does not claim "nothing changed".
  if (!previous) return 'baseline';

  const { alert } = diffSnapshots(previous, snapshot);
  if (!alert) return 'none';

  const { summary, suggestedOpener } = await requestChangeSummary(session, row.domain, alert);

  const inserted = await restInsert(session.accessToken, 'prospect_changes', {
    user_id: session.userId,
    saved_analysis_id: row.id,
    domain: row.domain,
    detected_at: now,
    change_type: alert.changeType,
    severity: alert.severity,
    before_text: alert.beforeText.slice(0, 4000),
    after_text: alert.afterText.slice(0, 4000),
    summary,
    suggested_opener: suggestedOpener,
  });

  return inserted.ok ? 'change' : 'none';
}
