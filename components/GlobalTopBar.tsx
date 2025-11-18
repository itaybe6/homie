import { memo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationsButton from '@/components/NotificationsButton';
import RequestsButton from '@/components/RequestsButton';

function GlobalTopBarBase() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  return (
    <View
      {...(!isWeb ? { pointerEvents: 'box-none' as const } : {})}
      style={[styles.container, isWeb ? ({ pointerEvents: 'box-none' } as const) : undefined]}
    >
      <View
        {...(!isWeb ? { pointerEvents: 'box-none' as const } : {})}
        style={[styles.inner, { paddingTop: Math.max(6, insets.top + 2) }, isWeb ? ({ pointerEvents: 'box-none' } as const) : undefined]}
      >
        {/* Left: notifications */}
        <NotificationsButton style={{ left: 16 }} />
        {/* Center title */}
        <View
          {...(!isWeb ? { pointerEvents: 'none' as const } : {})}
          style={[styles.centerWrap, isWeb ? ({ pointerEvents: 'none' } as const) : undefined]}
        >
          <Text style={styles.title}>Homie</Text>
        </View>
        {/* Right: requests */}
        <RequestsButton style={{ right: 16 }} />
      </View>
    </View>
  );
}

export default memo(GlobalTopBarBase);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 60,
  },
  inner: {
    minHeight: 56,
  },
  centerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});


