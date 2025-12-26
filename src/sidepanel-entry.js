import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qcvnfvbzxbnrquxtjihp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjdm5mdmJ6eGJucnF1eHRqaWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzOTg0NzUsImV4cCI6MjA4MTk3NDQ3NX0.0MWdwZfa_dJVioyOmCMRNWE0ZQra8-GUkAY9XP7jCEA";

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

window.supabase = client;
