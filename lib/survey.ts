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
  const { data, error } = await supabase
    .from('user_survey_responses')
    .upsert(
      {
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data as any;
}


