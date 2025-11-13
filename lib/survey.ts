import { supabase } from '@/lib/supabase';
import { UserSurveyResponse } from '@/types/database';

export type SurveyUpsert = Omit<
  UserSurveyResponse,
  'id' | 'created_at' | 'updated_at' | 'user_id'
> & {
  user_id: string;
};

export async function fetchUserSurvey(userId: string): Promise<UserSurveyResponse | null> {
  const { data, error } = await supabase
    .from('user_survey_responses')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as any) || null;
}

export async function upsertUserSurvey(payload: SurveyUpsert): Promise<UserSurveyResponse> {
  // Some environments may lack a unique constraint on user_id, which breaks onConflict upsert.
  // To be robust, perform a manual upsert: update if row exists, otherwise insert.
  const existing = await fetchUserSurvey(payload.user_id);
  // eslint-disable-next-line no-console
  console.log('[survey] upsertUserSurvey start', {
    hasExisting: !!existing,
    userId: payload.user_id,
    // Avoid logging potentially long arrays; log presence instead
    hasNeighborhoods: Array.isArray((payload as any).preferred_neighborhoods)
      ? (payload as any).preferred_neighborhoods?.length
      : null,
    is_sublet: (payload as any).is_sublet ?? null,
    sublet_month_from: (payload as any).sublet_month_from ?? null,
    sublet_month_to: (payload as any).sublet_month_to ?? null,
  });

  if (existing) {
    const result = await robustUpdate(payload.user_id, payload);
    return result;
  }

  const inserted = await robustInsert(payload);
  return inserted;
}

function omitSubletNewFields<T extends Record<string, any>>(obj: T): T {
  const { is_sublet, sublet_month_from, sublet_month_to, ...rest } = obj as any;
  return rest as T;
}

async function robustUpdate(userId: string, initialPayload: Record<string, any>) {
  // Try update, and if we hit "column does not exist" errors or schema cache errors,
  // progressively remove the offending column and retry, up to 10 times.
  let payload: Record<string, any> = { ...initialPayload };
  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    const { data, error } = await supabase
      .from('user_survey_responses')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();
    if (!error) {
      // eslint-disable-next-line no-console
      console.log('[survey] robustUpdate OK', { attempts });
      return data as any;
    }
    // eslint-disable-next-line no-console
    console.error('[survey] robustUpdate error', {
      attempts,
      code: (error as any)?.code,
      message: (error as any)?.message,
    });
    // Handle missing column errors (PGRST204 + message mentions column) or 42703 from Postgres
    const missing = parseMissingColumnName((error as any)?.message || '');
    if (error.code === '42703' || missing) {
      const col = missing || extractColumnFromDoesNotExist((error as any)?.message || '');
      if (col && payload.hasOwnProperty(col)) {
        // eslint-disable-next-line no-console
        console.warn('[survey] robustUpdate removing missing column and retrying', col);
        // Remove the offending column and retry
        const { [col]: _omit, ...rest } = payload;
        payload = rest;
        continue;
      }
    }
    // Also fallback once to remove new sublet fields if present
    const safePayload = omitSubletNewFields(payload);
    if (Object.keys(safePayload).length !== Object.keys(payload).length) {
      // eslint-disable-next-line no-console
      console.warn('[survey] robustUpdate retry without sublet fields');
      payload = safePayload;
      continue;
    }
    throw error;
  }
  throw new Error('Failed to update survey after multiple attempts');
}

async function robustInsert(initialPayload: Record<string, any>) {
  let payload: Record<string, any> = { ...initialPayload };
  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    const { data, error } = await supabase
      .from('user_survey_responses')
      .insert({
        ...payload,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();
    if (!error) {
      // eslint-disable-next-line no-console
      console.log('[survey] robustInsert OK', { attempts });
      return data as any;
    }
    // eslint-disable-next-line no-console
    console.error('[survey] robustInsert error', {
      attempts,
      code: (error as any)?.code,
      message: (error as any)?.message,
    });
    const missing = parseMissingColumnName((error as any)?.message || '');
    if (error.code === '42703' || missing) {
      const col = missing || extractColumnFromDoesNotExist((error as any)?.message || '');
      if (col && payload.hasOwnProperty(col)) {
        // eslint-disable-next-line no-console
        console.warn('[survey] robustInsert removing missing column and retrying', col);
        const { [col]: _omit, ...rest } = payload;
        payload = rest;
        continue;
      }
    }
    const safePayload = omitSubletNewFields(payload);
    if (Object.keys(safePayload).length !== Object.keys(payload).length) {
      // eslint-disable-next-line no-console
      console.warn('[survey] robustInsert retry without sublet fields');
      payload = safePayload;
      continue;
    }
    throw error;
  }
  throw new Error('Failed to insert survey after multiple attempts');
}

function parseMissingColumnName(message: string): string | null {
  // Example: "Could not find the 'keeps_kosher' column of 'user_survey_responses' in the schema cache"
  const m = message.match(/Could not find the '([^']+)' column of 'user_survey_responses'/i);
  return m?.[1] || null;
}

function extractColumnFromDoesNotExist(message: string): string | null {
  // Example: column "keeps_kosher" does not exist
  const m = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+does not exist/i);
  return m?.[1] || null;
}


