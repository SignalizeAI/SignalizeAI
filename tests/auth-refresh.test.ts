import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { getWatchSession } from '../src/watch/supabase-rest.js';

const user = { id: 'fixture-user' };
const expired = { access_token: 'expired', refresh_token: 'old-refresh', expires_at: 1, user };
const fresh = {
  access_token: 'fresh',
  refresh_token: 'new-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};

function installStorage(session: unknown) {
  const store: Record<string, unknown> = { supabaseSession: session };
  Object.assign(globalThis, {
    chrome: {
      storage: {
        local: {
          get(key: string, callback?: (value: object) => void) {
            const result = { [key]: store[key] };
            callback?.(result);
            return Promise.resolve(result);
          },
          set(value: object, callback?: () => void) {
            Object.assign(store, value);
            callback?.();
            return Promise.resolve();
          },
          remove(key: string, callback?: () => void) {
            delete store[key];
            callback?.();
            return Promise.resolve();
          },
        },
      },
    },
  });
  return store;
}

test('side panel boots a single Supabase client', async () => {
  const source = await readFile(new URL('../sidepanel-loader.ts', import.meta.url), 'utf8');
  const { transform } = await import('esbuild');
  const { code } = await transform(source, { loader: 'ts' });
  const loaded: string[] = [];
  runInNewContext(code, {
    document: {
      querySelectorAll: () => [],
      createElement: () => ({}),
      body: {
        appendChild(script: { src: string; onload: () => void }) {
          loaded.push(script.src);
          script.onload();
        },
      },
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(loaded, ['extension/sidepanel.js']);
});

test('simultaneous watch requests rotate the refresh token once', async () => {
  installStorage(expired);
  let rotations = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    rotations++;
    await new Promise((r) => setTimeout(r, 10));
    return Response.json(fresh);
  };
  try {
    const sessions = await Promise.all([getWatchSession(), getWatchSession(), getWatchSession()]);
    assert.equal(rotations, 1);
    assert.ok(sessions.every((s) => s?.accessToken === 'fresh'));
  } finally {
    globalThis.fetch = original;
  }
});

test('failed refresh never returns an expired access token', async () => {
  installStorage(expired);
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ error_code: 'refresh_token_already_used' }, { status: 400 });
  try {
    assert.equal(await getWatchSession(), null);
  } finally {
    globalThis.fetch = original;
  }
});

test('panel SDK and watch worker share a rotation lock and the latest session', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const { SESSION_KEY, sessionStorage, withSessionLock } =
    await import('../src/auth/session-storage.js');
  installStorage(expired);
  let rotations = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes('/token')) {
      rotations++;
      await new Promise((r) => setTimeout(r, 10));
      return Response.json({ ...fresh, token_type: 'bearer', expires_in: 3600 });
    }
    return Response.json(user);
  };
  const client = createClient('https://fixture.supabase.co', 'fixture', {
    auth: {
      storage: sessionStorage,
      storageKey: SESSION_KEY,
      lock: (_name, _timeout, operation) => withSessionLock(operation),
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  try {
    const [watch, sdk] = await Promise.all([getWatchSession(), client.auth.getSession()]);
    assert.equal(rotations, 1);
    assert.equal(watch?.accessToken, 'fresh');
    assert.equal(sdk.data.session?.refresh_token, 'new-refresh');
  } finally {
    await client.auth.stopAutoRefresh();
    globalThis.fetch = original;
  }
});

test('legacy token-only storage is normalized instead of discarded by the SDK', async () => {
  const { sessionStorage, SESSION_KEY } = await import('../src/auth/session-storage.js');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = `e30.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.fixture`;
  installStorage({ access_token, refresh_token: 'legacy' });
  const session = JSON.parse((await sessionStorage.getItem(SESSION_KEY))!);
  assert.equal(session.expires_at, exp);
});

test('transient refresh failure retains session for a later retry', async () => {
  const store = installStorage(expired);
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({}, { status: 503 });
  try {
    assert.equal(await getWatchSession(), null);
    assert.deepEqual(store.supabaseSession, expired);
  } finally {
    globalThis.fetch = original;
  }
});

test('sign-out waits for background refresh and leaves no revived session', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const { SESSION_KEY, sessionStorage, withSessionLock } =
    await import('../src/auth/session-storage.js');
  const store = installStorage(expired);
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes('/logout')) return new Response(null, { status: 204 });
    await new Promise((r) => setTimeout(r, 10));
    return Response.json({ ...fresh, token_type: 'bearer', expires_in: 3600 });
  };
  const client = createClient('https://fixture.supabase.co', 'fixture', {
    auth: {
      storage: sessionStorage,
      storageKey: SESSION_KEY,
      lock: (_name, _timeout, operation) => withSessionLock(operation),
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  try {
    await Promise.all([getWatchSession(), client.auth.signOut({ scope: 'local' })]);
    assert.equal(store.supabaseSession, undefined);
  } finally {
    await client.auth.stopAutoRefresh();
    globalThis.fetch = original;
  }
});
