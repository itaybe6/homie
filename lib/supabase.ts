import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const SUPABASE_ENV_OK = !!(supabaseUrl && supabaseAnonKey);

/**
 * True when Supabase ENV vars are present in the running app.
 * In EAS/TestFlight this usually means you configured EAS Secrets / env vars.
 */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_ENV_OK;
}

if (!SUPABASE_ENV_OK) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. App will run in degraded mode until configured.'
  );
}

// IMPORTANT: createClient can throw if url/key are missing/invalid.
// To avoid a hard crash on app startup (especially in TestFlight), we always pass
// valid-looking fallbacks and gate app flows elsewhere via isSupabaseConfigured().
const safeSupabaseUrl = supabaseUrl || 'https://example.com';
const safeSupabaseAnonKey = supabaseAnonKey || 'public-anon-key';

export const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Not a browser, so no hash parsing
    detectSessionInUrl: false,
  },
});
