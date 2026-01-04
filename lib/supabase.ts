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

/**
 * Supabase persists the session JSON in AsyncStorage.
 * In some edge cases (crashes / hot reloads / interrupted OTP flows) a partial session can be saved
 * without a `refresh_token`. When that happens, Supabase may attempt an auto-refresh and throw:
 * "Invalid Refresh Token: Refresh Token Not Found" (even on a fresh login).
 *
 * This wrapper proactively clears corrupted auth entries so the app can continue cleanly to login.
 */
const supabaseStorage = {
  async getItem(key: string) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return raw;

    // Supabase-js v2 uses keys like: sb-<project-ref>-auth-token
    if (key.includes('auth-token')) {
      try {
        const parsed = JSON.parse(raw);
        const accessToken = parsed?.access_token ?? parsed?.currentSession?.access_token;
        const refreshToken = parsed?.refresh_token ?? parsed?.currentSession?.refresh_token;

        // If we have an access token but no refresh token, treat it as corrupted and clear it.
        if (accessToken && !refreshToken) {
          await AsyncStorage.removeItem(key);
          return null;
        }
      } catch {
        // Not valid JSON -> clear it
        await AsyncStorage.removeItem(key);
        return null;
      }
    }

    return raw;
  },
  async setItem(key: string, value: string) {
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(safeSupabaseUrl, safeSupabaseAnonKey, {
  auth: {
    storage: supabaseStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    // Not a browser, so no hash parsing
    detectSessionInUrl: false,
  },
});
