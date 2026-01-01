import { memo } from 'react';
import { View, StyleSheet, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationsButton from '@/components/NotificationsButton';
import RequestsButton from '@/components/RequestsButton';

function GlobalTopBarBase({ backgroundColor = '#FFFFFF' }: { backgroundColor?: string }) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  return (
    <View
      {...(!isWeb ? { pointerEvents: 'box-none' as const } : {})}
      style={[
        styles.container,
        { backgroundColor },
        isWeb ? ({ pointerEvents: 'box-none' } as const) : undefined,
      ]}
    >
      {/* Solid white background under the safe area + header height */}
      <View
        style={[
          styles.background,
          { backgroundColor },
          { height: (insets.top || 0) + 52 },
        ]}
        pointerEvents="none"
      />
      <View
        {...(!isWeb ? { pointerEvents: 'box-none' as const } : {})}
        style={[
          styles.inner,
          { backgroundColor },
          { paddingTop: insets.top, paddingBottom: 0 },
          isWeb ? ({ pointerEvents: 'box-none' } as const) : undefined,
        ]}
      >
        {/* Left: notifications */}
        <NotificationsButton style={{ left: 16 }} />
        {/* Center logo */}
        <View
          {...(!isWeb ? { pointerEvents: 'none' as const } : {})}
          style={[
            styles.centerWrap,
            { top: insets.top },
            isWeb ? ({ pointerEvents: 'none' } as const) : undefined,
          ]}
        >
          <Image
            source={require('../assets/images/homiebrown logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
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
    backgroundColor: '#FFFFFF',
  },
  inner: {
    width: '100%',
    minHeight: 52,
    backgroundColor: '#FFFFFF',
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: '#FFFFFF',
  },
  centerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 110,
    height: 34,
  },
});


