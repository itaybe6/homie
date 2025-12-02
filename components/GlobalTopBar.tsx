import { memo } from 'react';
import { View, Text, StyleSheet, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import NotificationsButton from '@/components/NotificationsButton';
import RequestsButton from '@/components/RequestsButton';
import MatchRequestsButton from '@/components/MatchRequestsButton';

function GlobalTopBarBase() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const pathname = usePathname();
  const p = typeof pathname === 'string' ? pathname : '';
  const showMatchButton =
    p === '/(tabs)/home' ||
    p === '/home' ||
    p === '/(tabs)/profile' ||
    p === '/profile' ||
    p === '/(tabs)/partners' ||
    p === '/partners' ||
    p === '/(tabs)/notifications' ||
    p === '/notifications' ||
    p === '/(tabs)/requests' ||
    p === '/requests' ||
    p.startsWith('/(tabs)/user/') ||
    p.startsWith('/user/');
  return (
    <View
      {...(!isWeb ? { pointerEvents: 'box-none' as const } : {})}
      style={[styles.container, isWeb ? ({ pointerEvents: 'box-none' } as const) : undefined]}
    >
      <View
        {...(!isWeb ? { pointerEvents: 'box-none' as const } : {})}
        style={[styles.inner, { paddingTop: insets.top, paddingBottom: 0 }, isWeb ? ({ pointerEvents: 'box-none' } as const) : undefined]}
      >
        {/* Left: notifications */}
        <NotificationsButton style={{ left: 16 }} />
        {/* Center title */}
        <View
          {...(!isWeb ? { pointerEvents: 'none' as const } : {})}
          style={[
            styles.centerWrap,
            { top: insets.top },
            isWeb ? ({ pointerEvents: 'none' } as const) : undefined,
          ]}
        >
          <Image
            source={require('../assets/images/logo-02.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        {/* Right: requests */}
        <RequestsButton style={{ right: 16 }} />
        {showMatchButton ? <MatchRequestsButton style={{ right: 60 }} /> : null}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  logo: {
    width: 84,
    height: 26,
  },
});


