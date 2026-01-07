import { memo, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, View, ViewStyle, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationsStore } from '@/stores/notificationsStore';
import { alpha, colors } from '@/lib/theme';

type Props = {
  style?: ViewStyle;
  badgeCount?: number;
};

function NotificationsButtonBase({ style, badgeCount }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const setUnreadCount = useNotificationsStore((s) => s.setUnreadCount);
  const lastSeenAt = useNotificationsStore((s) => s.lastSeenAt);

  // Keep consistent with Home screen action icons (map/filter/search).
  const ICON_COLOR = colors.primary;

  useEffect(() => {
    let isMounted = true;
    const fetchCount = async () => {
      if (!user?.id) {
        if (isMounted) setUnreadCount(0);
        return;
      }
      // Combined badge: NEW unread notifications + NEW pending incoming requests/matches/invites since last open.
      let recipientIds: string[] = [user.id];
      let myGroupIds: string[] = [];
      try {
        const { data: myMemberships } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE');
        myGroupIds = (myMemberships || []).map((r: any) => r?.group_id).filter(Boolean);
        if (myGroupIds.length) {
          const { data: membersRows } = await supabase
            .from('profile_group_members')
            .select('user_id')
            .eq('status', 'ACTIVE')
            .in('group_id', myGroupIds as any);
          const memberIds = (membersRows || []).map((r: any) => r?.user_id).filter(Boolean);
          if (memberIds.length) recipientIds = Array.from(new Set(memberIds));
        }
      } catch {
        // best-effort only
      }

      const sinceIso = lastSeenAt ? String(lastSeenAt) : null;

      const [
        { count: unreadNotifCount },
        { count: aptReqCount },
        { count: matchDirectCount },
        { count: matchGroupCount },
        { count: groupInvCount },
      ] = await Promise.all([
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .in('recipient_id', recipientIds as any)
          .or('is_read.is.null,is_read.eq.false'),
        supabase
          .from('apartments_request')
          .select('id', { count: 'exact', head: true })
          .in('recipient_id', recipientIds as any)
          .eq('status', 'PENDING'),
        supabase
          .from('matches')
          .select('id', { count: 'exact', head: true })
          .in('receiver_id', recipientIds as any)
          .eq('status', 'PENDING'),
        myGroupIds.length
          ? supabase
              .from('matches')
              .select('id', { count: 'exact', head: true })
              .in('receiver_group_id', myGroupIds as any)
              .eq('status', 'PENDING')
          : Promise.resolve({ count: 0 } as any),
        supabase
          .from('profile_group_invites')
          .select('id', { count: 'exact', head: true })
          .in('invitee_id', recipientIds as any)
          .eq('status', 'PENDING'),
      ]);

      // If we have a "last seen" timestamp, count only items created after it
      // (requests/matches/invites don't have is_read flags).
      const counts = await (async () => {
        if (!sinceIso) {
          return {
            unreadNotifCount: unreadNotifCount || 0,
            aptReqCount: aptReqCount || 0,
            matchDirectCount: matchDirectCount || 0,
            matchGroupCount: matchGroupCount || 0,
            groupInvCount: groupInvCount || 0,
          };
        }
        const [
          { count: aptReqNew },
          { count: matchDirectNew },
          { count: matchGroupNew },
          { count: groupInvNew },
        ] = await Promise.all([
          supabase
            .from('apartments_request')
            .select('id', { count: 'exact', head: true })
            .in('recipient_id', recipientIds as any)
            .eq('status', 'PENDING')
            .gte('created_at', sinceIso),
          supabase
            .from('matches')
            .select('id', { count: 'exact', head: true })
            .in('receiver_id', recipientIds as any)
            .eq('status', 'PENDING')
            .gte('created_at', sinceIso),
          myGroupIds.length
            ? supabase
                .from('matches')
                .select('id', { count: 'exact', head: true })
                .in('receiver_group_id', myGroupIds as any)
                .eq('status', 'PENDING')
                .gte('created_at', sinceIso)
            : Promise.resolve({ count: 0 } as any),
          supabase
            .from('profile_group_invites')
            .select('id', { count: 'exact', head: true })
            .in('invitee_id', recipientIds as any)
            .eq('status', 'PENDING')
            .gte('created_at', sinceIso),
        ]);
        return {
          unreadNotifCount: unreadNotifCount || 0,
          aptReqCount: aptReqNew || 0,
          matchDirectCount: matchDirectNew || 0,
          matchGroupCount: matchGroupNew || 0,
          groupInvCount: groupInvNew || 0,
        };
      })();

      const total =
        counts.unreadNotifCount +
        counts.aptReqCount +
        counts.matchDirectCount +
        counts.matchGroupCount +
        counts.groupInvCount;
      if (isMounted) setUnreadCount(total);
    };

    fetchCount();

    // Realtime updates (best-effort; filters cover direct-to-user changes)
    const channel = supabase
      .channel(`notifications-count:${user?.id || 'anon'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: user?.id ? `recipient_id=eq.${user.id}` : undefined },
        () => fetchCount()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'apartments_request', filter: user?.id ? `recipient_id=eq.${user.id}` : undefined },
        () => fetchCount()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: user?.id ? `receiver_id=eq.${user.id}` : undefined },
        () => fetchCount()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profile_group_invites', filter: user?.id ? `invitee_id=eq.${user.id}` : undefined },
        () => fetchCount()
      )
      .subscribe();

    // Fallback polling to cover cases realtime filters don't capture (e.g. merged-profile recipients).
    const poll = setInterval(() => {
      fetchCount();
    }, 15000);

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [user?.id, lastSeenAt]);

  const shownCount = typeof badgeCount === 'number' ? badgeCount : unreadCount;
  const shownLabel = shownCount > 99 ? '99+' : String(shownCount);
  return (
    <View style={[styles.wrap, { marginTop: Math.max(6, insets.top + 2) }, style]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        activeOpacity={0.85}
        onPress={() => router.push('/(tabs)/notifications')}
        style={styles.btn}
      >
        <Bell size={22} color={ICON_COLOR} />
        {shownCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{shownLabel}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

export default memo(NotificationsButtonBase);

const styles = StyleSheet.create({
  wrap: {
    zIndex: 50,
    position: 'absolute',
    top: 0,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    // soft halo shadow
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: alpha(colors.success, 0.92),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});


