import { memo, useEffect, useState } from 'react';
import { TouchableOpacity, StyleSheet, View, ViewStyle, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

type Props = {
  style?: ViewStyle;
};

function GroupRequestsButtonBase({ style }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    const fetchCount = async () => {
      if (!user?.id) {
        if (isMounted) setCount(0);
        return;
      }
      // Count pending incoming group invites
      const { count: c } = await supabase
        .from('profile_group_invites')
        .select('id', { count: 'exact', head: true })
        .eq('invitee_id', user.id)
        .eq('status', 'PENDING');
      if (isMounted) setCount(c || 0);
    };
    fetchCount();

    // Realtime updates for group invites addressed to me
    const channel = supabase
      .channel(`group-requests-count:${user?.id || 'anon'}`)
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

  return (
    <View style={[styles.wrap, { marginTop: Math.max(6, insets.top + 2) }, style]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Group Requests"
        activeOpacity={0.85}
        onPress={() => router.push('/group-requests')}
        style={styles.btn}
      >
        <Users size={18} color="#FFFFFF" />
        {count > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 99 ? '99+' : String(count)}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

export default memo(GroupRequestsButtonBase);

const styles = StyleSheet.create({
  wrap: {
    zIndex: 50,
    position: 'absolute',
    top: 0,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
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
    borderWidth: 1,
    borderColor: 'rgba(15,15,20,0.8)',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});





