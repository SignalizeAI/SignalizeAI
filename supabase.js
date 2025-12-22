import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const supabase = createClient(
  "https://qcvnfvbzxbnrquxtjihp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjdm5mdmJ6eGJucnF1eHRqaWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzOTg0NzUsImV4cCI6MjA4MTk3NDQ3NX0.0MWdwZfa_dJVioyOmCMRNWE0ZQra8-GUkAY9XP7jCEA"
);
