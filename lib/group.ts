import { supabase } from '@/lib/supabase';

/**
 * Returns a human-friendly label for a user.
 * If the user is an ACTIVE member of a merged profile group, returns all active member names joined by " • ".
 * Otherwise returns the user's full_name, or a generic fallback.
 */
export async function computeGroupAwareLabel(userId: string): Promise<string> {
  try {
    if (!userId) return 'משתמש';
    // Check if the user is in an ACTIVE group
    const { data: membership } = await supabase
      .from('profile_group_members')
      .select('group_id')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    const groupId = (membership as any)?.group_id as string | undefined;
    if (!groupId) {
      const { data: me } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();
      return ((me as any)?.full_name as string) || 'משתמש';
    }
    // Load all active members of the group
    const { data: memberRows } = await supabase
      .from('profile_group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('status', 'ACTIVE');
    const ids: string[] = (memberRows || []).map((r: any) => r.user_id).filter(Boolean);
    if (!ids.length) {
      const { data: me } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();
      return ((me as any)?.full_name as string) || 'משתמש';
    }
    const { data: usersRows } = await supabase
      .from('users')
      .select('full_name')
      .in('id', ids);
    const names = (usersRows || []).map((u: any) => u?.full_name).filter(Boolean);
    return names.length ? names.join(' • ') : 'משתמש';
  } catch {
    return 'משתמש';
  }
}


