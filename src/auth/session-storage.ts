/** One session and one rotation lock for extension documents and the MV3 worker. */
export const SESSION_KEY = 'supabaseSession';
export const SESSION_LOCK = `lock:${SESSION_KEY}`;

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user?: { id?: string };
}

let pending: Promise<unknown> = Promise.resolve();

export async function withSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (globalThis.navigator?.locks) {
    return await navigator.locks.request(SESSION_LOCK, operation);
  }
  // Older browsers still serialize callers in the same context.
  const next = pending.then(operation, operation);
  pending = next.catch(() => undefined);
  return next;
}

export function sessionExpiry(session: StoredSession): number {
  if (session.expires_at) return session.expires_at;
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return Number(JSON.parse(atob(payload)).exp) || 0;
  } catch {
    return 0;
  }
}

export async function readStoredSession(): Promise<StoredSession | null> {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const session = stored[SESSION_KEY] as StoredSession | undefined;
  return session ? { ...session, expires_at: sessionExpiry(session) } : null;
}

export async function writeStoredSession(session: StoredSession): Promise<void> {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

// Supabase storage uses JSON strings; chrome.storage stores structured values.
export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const stored = (await chrome.storage.local.get(key))[key];
    if (stored == null) return null;
    const value = typeof stored === 'string' ? JSON.parse(stored) : stored;
    if (key === SESSION_KEY) value.expires_at = sessionExpiry(value);
    return JSON.stringify(value);
  },
  async setItem(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: JSON.parse(value) });
  },
  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
};
