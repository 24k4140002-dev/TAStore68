import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = localStorage.getItem('metapost_supabase_url') || 'https://svhrdnugpjocumycqddm.supabase.co';
const SUPABASE_KEY = localStorage.getItem('metapost_supabase_key') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN2aHJkbnVncGpvY3VteWNxZGRtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njk1NzMwNiwiZXhwIjoyMTAyNTMzMzA2fQ.ru8rFuPJzNWyZkLvrELNYzv-Wtx5S2tNaFcK_BXCfjM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false
  }
});
