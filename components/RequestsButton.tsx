import { memo, useEffect, useState } from 'react';
import { TouchableOpacity, StyleSheet, View, ViewStyle, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Inbox } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { alpha, colors } from '@/lib/theme';

type Props = {
  style?: ViewStyle;
  badgeCount?: number;
};

function RequestsButtonBase({ style, badgeCount }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const [count, setCount] = useState<number>(badgeCount || 0);

  // Keep consistent with Home screen action icons (map/filter/search).
  const ICON_COLOR = colors.primary;

  useEffect(() => {
    let isMounted = true;
    const fetchCount = async () => {
      if (!user?.id) {
        if (isMounted) setCount(0);
        return;
      }
      // Count pending incoming items (apartment requests + match requests + group invites),
      // including requests addressed to any ACTIVE member of my merged profile(s).
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

      const [{ count: aptCount }, { count: matchDirectCount }, { count: matchGroupCount }, { count: groupInvCount }] =
        await Promise.all([
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

      const total = (aptCount || 0) + (matchDirectCount || 0) + (matchGroupCount || 0) + (groupInvCount || 0);
      if (isMounted) setCount(total);
    };

    fetchCount();

    // Realtime channels for updates
    const channel = supabase
      .channel(`requests-count:${user?.id || 'anon'}`)
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

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const shownCount = typeof badgeCount === 'number' ? badgeCount : count;
  const shownLabel = shownCount > 99 ? '99+' : String(shownCount);
  return (
    <View style={[styles.wrap, { marginTop: Math.max(6, insets.top + 2) }, style]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Inbox"
        activeOpacity={0.85}
        onPress={() =>
          router.push({
            pathname: '/(tabs)/notifications',
            params: { tab: 'incoming' },
          } as any)
        }
        style={styles.btn}
      >
        <Inbox size={22} color={ICON_COLOR} />
        {shownCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{shownLabel}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

export default memo(RequestsButtonBase);

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


