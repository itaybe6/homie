import { memo, useEffect, useState } from 'react';
import { TouchableOpacity, StyleSheet, View, ViewStyle, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationsStore } from '@/stores/notificationsStore';

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

  useEffect(() => {
    let isMounted = true;
    const fetchCount = async () => {
      if (!user?.id) {
        if (isMounted) setUnreadCount(0);
        return;
      }
      const { count: c } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .or('is_read.is.null,is_read.eq.false');
      if (isMounted) setUnreadCount(c || 0);
    };

    fetchCount();

    // Realtime updates for this user
    const channel = supabase
      .channel(`notifications-count:${user?.id || 'anon'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: user?.id ? `recipient_id=eq.${user.id}` : undefined },
        () => fetchCount()
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

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
        <Bell size={22} color="#1F2937" />
        {/* Icon color updated to dark grey for visibility on white header */}
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
    backgroundColor: 'rgba(124,92,255,0.85)',
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


