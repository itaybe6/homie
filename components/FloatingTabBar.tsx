import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { Home, Users, User, Plus } from 'lucide-react-native';

type TabKey = 'home' | 'partners' | 'profile';

interface FloatingTabBarProps {
  active?: TabKey | 'none';
}

export default function FloatingTabBar({ active }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();

  const current: TabKey | 'none' = useMemo(() => {
    if (active === 'none') return 'none';
    if (active) return active as TabKey;
    if (pathname?.includes('/partners')) return 'partners';
    if (pathname?.includes('/profile')) return 'profile';
    return 'home';
  }, [active, pathname]);

  const { width: screenWidth } = Dimensions.get('window');
  const PILL_PCT = 0.78;
  const FAB_SIZE = 56;
  const GAP = 10;
  const pillWidth = Math.min(
    Math.max(Math.round(screenWidth * PILL_PCT), 260),
    Math.min(380, screenWidth - 48)
  );
  const groupWidth = pillWidth + GAP + FAB_SIZE;
  const groupLeft = Math.round((screenWidth - groupWidth) / 2);
  const horizontalPadding = 10; // must match styles.pill.paddingHorizontal
  const segmentWidth = (pillWidth - horizontalPadding * 2) / 3;

  const activeIndexVisual =
    current === 'home' ? 0 : current === 'partners' ? 1 : current === 'profile' ? 2 : 0; // left→right positions
  const MARGIN = 8;
  const [pillMeasuredWidth, setPillMeasuredWidth] = useState<number>(pillWidth);
  const [itemLayouts, setItemLayouts] = useState<Record<TabKey, { x: number; width: number }>>({} as any);
  const desiredActiveWidth = Math.round(segmentWidth * 0.98);
  const fallbackActiveWidth = Math.max(44, Math.min(desiredActiveWidth, segmentWidth + 12));
  const activeHeight = 62;
  const activeTop = Math.round((82 - activeHeight) / 2);
  const activeKey: TabKey | null = current === 'none' ? null : (current as TabKey);
  const targetLayout = activeKey ? itemLayouts[activeKey] : undefined;
  const computedActiveWidth =
    current === 'none'
      ? 0
      : targetLayout
      ? Math.max(44, Math.min(Math.round(targetLayout.width * 1.03), segmentWidth + 12))
      : fallbackActiveWidth;
  // Nudge slightly left to visually center with icon+label (RTL spacing tends to pull right)
  const CENTER_BIAS = -6;
  const computedLeft =
    current === 'none'
      ? 0
      : targetLayout
      ? Math.round(targetLayout.x + targetLayout.width / 2 - computedActiveWidth / 2)
      : Math.round(horizontalPadding + activeIndexVisual * segmentWidth + (segmentWidth - computedActiveWidth) / 2);
  const clampedLeft = Math.max(
    MARGIN + horizontalPadding,
    Math.min(computedLeft + CENTER_BIAS, pillMeasuredWidth - horizontalPadding - computedActiveWidth - MARGIN)
  );
  const activeLeft = clampedLeft + groupLeft;
  const activeWidth = computedActiveWidth;

  const go = (key: TabKey) => {
    if (key === 'home') router.push('/(tabs)/home');
    if (key === 'partners') router.push('/(tabs)/partners');
    if (key === 'profile') router.push('/(tabs)/profile');
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
         styles.root,
        {
          bottom: 16 + insets.bottom,
           left: groupLeft,
           width: groupWidth,
        },
      ]}
    >
       <View style={[styles.rowWrap]}>
         {/* Right floating action button */}
         <TouchableOpacity
           style={styles.fab}
           accessibilityRole="button"
           accessibilityLabel="הוספת דירה"
           onPress={() => router.push('/add-apartment' as any)}
           activeOpacity={0.9}
         >
           <View style={styles.fabInner}>
             <Plus size={22} color="#FFFFFF" />
           </View>
         </TouchableOpacity>

         {/* Pill */}
         <View style={[styles.shadowWrap, { width: pillWidth }]}>
        <View
          style={styles.pill}
          onLayout={(e) => {
            const w = e?.nativeEvent?.layout?.width;
            if (typeof w === 'number' && !Number.isNaN(w)) setPillMeasuredWidth(w);
          }}
        >
        {/* Purple mini-pill behind the active tab */}
        {current !== 'none' ? (
          <View
            pointerEvents="none"
            style={[
              styles.activeTrack,
              {
                left: clampedLeft,
                top: activeTop,
                width: activeWidth,
                height: activeHeight,
                borderRadius: Math.round(activeHeight / 2),
              },
            ]}
          />
        ) : null}
          <TouchableOpacity
            style={styles.item}
            onPress={() => go('profile')}
            accessibilityRole="button"
            accessibilityLabel="פרופיל"
            onLayout={(e) => {
              const x = e?.nativeEvent?.layout?.x;
              const w = e?.nativeEvent?.layout?.width;
              if (typeof x === 'number' && typeof w === 'number')
                setItemLayouts((p) => ({ ...p, profile: { x, width: w } }));
            }}
          >
          <View style={[styles.inner, current === 'profile' && styles.innerActive]}>
            <User size={20} color={current === 'profile' ? '#FFFFFF' : '#6B7280'} />
            <Text style={[styles.label, current === 'profile' ? styles.labelActive : styles.labelInactive]}>פרופיל</Text>
          </View>
        </TouchableOpacity>
          <TouchableOpacity
            style={styles.item}
            onPress={() => go('partners')}
            accessibilityRole="button"
            accessibilityLabel="שותפים"
            onLayout={(e) => {
              const x = e?.nativeEvent?.layout?.x;
              const w = e?.nativeEvent?.layout?.width;
              if (typeof x === 'number' && typeof w === 'number')
                setItemLayouts((p) => ({ ...p, partners: { x, width: w } }));
            }}
          >
          <View style={[styles.inner, current === 'partners' && styles.innerActive]}>
            <Users size={20} color={current === 'partners' ? '#FFFFFF' : '#6B7280'} />
            <Text style={[styles.label, current === 'partners' ? styles.labelActive : styles.labelInactive]}>שותפים</Text>
          </View>
        </TouchableOpacity>
          <TouchableOpacity
            style={styles.item}
            onPress={() => go('home')}
            accessibilityRole="button"
            accessibilityLabel="דירות"
            onLayout={(e) => {
              const x = e?.nativeEvent?.layout?.x;
              const w = e?.nativeEvent?.layout?.width;
              if (typeof x === 'number' && typeof w === 'number')
                setItemLayouts((p) => ({ ...p, home: { x, width: w } }));
            }}
          >
          <View style={[styles.inner, current === 'home' && styles.innerActive]}>
            <Home size={20} color={current === 'home' ? '#FFFFFF' : '#6B7280'} />
            <Text style={[styles.label, current === 'home' ? styles.labelActive : styles.labelInactive]}>דירות</Text>
          </View>
        </TouchableOpacity>
         </View>
       </View>
       </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    height: 82,
    zIndex: 200,
  },
  shadowWrap: {
    height: 82,
    borderRadius: 41,
    backgroundColor: '#FFFFFF',
    overflow: 'visible',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.32,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 16 },
        }
      : { elevation: 30 }),
  },
  rowWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    height: 82,
    gap: 10,
  },
  pill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    height: 82,
    borderRadius: 41,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4C1D95',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOpacity: 0.32,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 16 },
        }
      : { elevation: 30 }),
  },
  fabInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTrack: {
    position: 'absolute',
    backgroundColor: '#4C1D95',
    zIndex: 0,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#4C1D95',
          shadowOpacity: 0.25,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
        }
      : { elevation: 8 }),
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 4,
  },
  innerActive: {
    // keep content styles minimal; background handled by activeTrack
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
  labelInactive: {
    color: '#6B7280',
  },
  labelActive: {
    color: '#FFFFFF',
  },
});


