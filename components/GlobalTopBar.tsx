import { memo } from 'react';
import { View, StyleSheet, Platform, Image, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NotificationsButton from '@/components/NotificationsButton';
import SettingsButton from '@/components/SettingsButton';
import { usePathname } from 'expo-router';
import { SlidersHorizontal } from 'lucide-react-native';
import { colors } from '@/lib/theme';
import { useUiStore } from '@/stores/uiStore';
import { emitOpenPartnersFilters } from '@/lib/partnersFiltersBus';

function GlobalTopBarBase({ backgroundColor = '#FFFFFF' }: { backgroundColor?: string }) {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const pathname = usePathname();
  const isPartnersRoute = typeof pathname === 'string' && (pathname === '/partners' || pathname.endsWith('/partners'));
  const openPartnersFilters = useUiStore((s) => s.openPartnersFilters);

  const ICON_COLOR = colors.primary;
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
        {/* Right: settings */}
        {isPartnersRoute ? (
          <View
            pointerEvents="box-none"
            style={[styles.actionWrap, { right: 16 + 44 + 10, marginTop: Math.max(6, insets.top + 2) }]}
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="סינון"
              activeOpacity={0.85}
              onPress={() => {
                // Open via store (preferred) + event bus (fallback for dev/HMR edge-cases)
                openPartnersFilters();
                emitOpenPartnersFilters();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.actionBtn}
            >
              <SlidersHorizontal size={22} color={ICON_COLOR} />
            </TouchableOpacity>
          </View>
        ) : null}
        <SettingsButton style={{ right: 16 }} />
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
  actionWrap: {
    zIndex: 50,
    position: 'absolute',
    top: 0,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EEF2F7',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
});


