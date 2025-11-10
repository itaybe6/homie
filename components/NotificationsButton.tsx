import { memo } from 'react';
import { TouchableOpacity, StyleSheet, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  style?: ViewStyle;
  badgeCount?: number;
};

function NotificationsButtonBase({ style, badgeCount = 0 }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { marginTop: Math.max(6, insets.top + 2) }, style]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        activeOpacity={0.85}
        onPress={() => router.push('/notifications')}
        style={styles.btn}
      >
        <Bell size={18} color="#FFFFFF" />
        {badgeCount > 0 ? <View style={styles.badge} /> : null}
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
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F43F5E',
  },
});


