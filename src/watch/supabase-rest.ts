/**
 * Minimal Supabase REST client for the MV3 background service worker.
 *
 * The side panel uses `@supabase/supabase-js`, but that bundle is loaded into
 * the side panel document and is far too heavy for a service worker that gets
 * evicted and restarted constantly. PostgREST over `fetch` is enough for what
 * the sweep needs, and it goes through the same RLS policies because it uses
 * the user's own access token.
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config.js';

import {
  readStoredSession,
  writeStoredSession,
  sessionExpiry,
  withSessionLock,
  type StoredSession,
} from '../auth/session-storage.js';

const REST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal, credentials: 'omit' });
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshSession(session: StoredSession): Promise<StoredSession | null> {
  if (!session.refresh_token) return null;

  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    if (!res.ok) {
      // Transient errors retain the session for a later retry; revoked refresh
      // tokens cannot recover and must not be retried on every watch alarm.
      if (res.status === 400 || res.status === 401) {
        await chrome.storage.local.remove('supabaseSession');
      }
      return null;
    }

    const next = (await res.json()) as StoredSession;
    if (!next?.access_token) return null;

    const merged = { ...session, ...next };
    await writeStoredSession(merged);
    return merged;
  } catch {
    return null;
  }
}

export interface WatchSession {
  accessToken: string;
  userId: string;
}

/** Current session, refreshed if the stored access token is close to expiry. */
export async function getWatchSession(): Promise<WatchSession | null> {
  const session = await withSessionLock(async () => {
    const current = await readStoredSession();
    if (!current?.access_token) return null;
    const expiresAt = sessionExpiry(current);
    if (!expiresAt || expiresAt * 1000 - Date.now() < 60_000) {
      return refreshSession(current);
    }
    return current;
  });
  if (!session) return null;

  const userId = session.user?.id || (await fetchUserId(session.access_token));
  if (!userId) return null;

  return { accessToken: session.access_token, userId };
}

async function fetchUserId(accessToken: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user?.id || null;
  } catch {
    return null;
  }
}

function restHeaders(accessToken: string, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export async function restSelect<T>(
  accessToken: string,
  path: string
): Promise<{ ok: boolean; data: T[]; status: number }> {
  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'GET',
      headers: restHeaders(accessToken),
    });
    if (!res.ok) return { ok: false, data: [], status: res.status };
    const data = (await res.json()) as T[];
    return { ok: true, data: Array.isArray(data) ? data : [], status: res.status };
  } catch {
    return { ok: false, data: [], status: 0 };
  }
}

export async function restInsert<T>(
  accessToken: string,
  table: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; data: T | null }> {
  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: restHeaders(accessToken, { Prefer: 'return=representation' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, data: null };
    const rows = (await res.json()) as T[];
    return { ok: true, data: Array.isArray(rows) ? (rows[0] ?? null) : null };
  } catch {
    return { ok: false, data: null };
  }
}

export async function restPatch(
  accessToken: string,
  path: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'PATCH',
      headers: restHeaders(accessToken, { Prefer: 'return=minimal' }),
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function restDelete(accessToken: string, path: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: 'DELETE',
      headers: restHeaders(accessToken, { Prefer: 'return=minimal' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
