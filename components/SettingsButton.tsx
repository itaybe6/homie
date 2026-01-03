import { memo } from 'react';
import { TouchableOpacity, StyleSheet, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  style?: ViewStyle;
};

function SettingsButtonBase({ style }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Keep consistent with NotificationsButton icon styling.
  const ICON_COLOR = '#5e3f2d';

  return (
    <View style={[styles.wrap, { marginTop: Math.max(6, insets.top + 2) }, style]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Settings"
        activeOpacity={0.85}
        onPress={() => router.push('/(tabs)/profile/settings' as any)}
        style={styles.btn}
      >
        <Settings size={22} color={ICON_COLOR} />
      </TouchableOpacity>
    </View>
  );
}

export default memo(SettingsButtonBase);

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
});

