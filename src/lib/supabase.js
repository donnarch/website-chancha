import { createClient } from '@supabase/supabase-js';

// Same project as the mobile app. The anon key is a public key (it also ships inside the app).
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://wmtnxdbpduoevrymiddf.supabase.co';
const KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtdG54ZGJwZHVvZXZyeW1pZGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MTgyMjgsImV4cCI6MjA5ODM5NDIyOH0.pO_AMfO06Zqzif9-jm46JIaZEn76Pf2T5wwDh7y5HuU';

let client;
if (import.meta.env.VITE_MOCK === '1') {
  // Offline test mode (no network). Used only for local UI tests.
  const { createMockClient } = await import('./mockSupabase.js');
  client = createMockClient();
} else {
  client = createClient(URL, KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'chancha-web-auth',
    },
    realtime: { params: { eventsPerSecond: 5 } },
  });
}

export const supabase = client;
