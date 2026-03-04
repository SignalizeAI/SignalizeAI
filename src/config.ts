export const SUPABASE_URL = 'https://qcvnfvbzxbnrquxtjihp.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFjdm5mdmJ6eGJucnF1eHRqaWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTc5MTEsImV4cCI6MjA4NzY1NzkxMX0.7KZQLgHx76DYhDu-PMvCsbR_Gw105zio6SHjhqOY55Q';

// API Configuration
// To test with dev API, change this to 'dev' or set API_ENV=dev in .env.local
export const ENV = 'production'; // 'production' | 'dev'

export const API_BASE_URL =
  ENV === 'dev' ? 'https://dev-api.signalizeai.org' : 'https://api.signalizeai.org';
