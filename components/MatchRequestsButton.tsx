import { memo } from 'react';
import { TouchableOpacity, StyleSheet, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UserPlus2 } from 'lucide-react-native';

type Props = {
  style?: ViewStyle;
};

function MatchRequestsButtonBase({ style }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { marginTop: Math.max(6, insets.top + 2) }, style]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Match Requests"
        activeOpacity={0.85}
        onPress={() => router.push('/match-requests')}
        style={styles.btn}
      >
        <UserPlus2 size={18} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

export default memo(MatchRequestsButtonBase);

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
});



