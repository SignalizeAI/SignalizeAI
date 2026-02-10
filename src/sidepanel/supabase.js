if (!window.supabase) {
  throw new Error(
    "Supabase client not initialized. Make sure extension/supabase.bundle.js is loaded."
  );
}

export const supabase = window.supabase;
