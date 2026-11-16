import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

import { SESSION_KEY, sessionStorage, withSessionLock } from './auth/session-storage.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: SESSION_KEY,
    storage: sessionStorage,
    lock: (_name, _timeout, operation) => withSessionLock(operation),
  },
});
