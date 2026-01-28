import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import {
  Accessibility,
  Shield,
  PawPrint,
  Sofa,
  ChevronDown,
  Tag,
  DoorOpen,
  Trees,
} from 'lucide-react-native';
import { alpha, colors } from '@/lib/theme';

export type FilterChipType = 'toggle' | 'dropdown';

export type FilterChip = {
  id: string;
  label: string;
  type: FilterChipType;
  // Optional icon renderer – falls back to a reasonable default by id
  renderIcon?: (color: string, size: number) => React.ReactNode;
};

type Props = {
  filters: FilterChip[];
  selectedIds?: string[];
  onChange?: (selectedIds: string[]) => void;
  onOpenDropdown?: (chip: FilterChip) => void;
  style?: ViewStyle;
  chipBorderWidth?: number;
  inactiveBackgroundColor?: string;
  activeBackgroundColor?: string;
  inactiveBorderColor?: string;
  activeBorderColor?: string;
  inactiveTextColor?: string;
  activeTextColor?: string;
  inactiveIconColor?: string;
  activeIconColor?: string;
  withShadow?: boolean;
};

// Default chips configuration (RTL labels)
export const defaultFilterChips: FilterChip[] = [
  { id: 'pets_allowed', label: 'חיות מחמד', type: 'toggle', renderIcon: (c, s) => <PawPrint color={c} size={s} /> },
  { id: 'is_furnished', label: 'מרוהט', type: 'toggle', renderIcon: (c, s) => <Sofa color={c} size={s} /> },
  { id: 'wheelchair_accessible', label: 'גישה לנכים', type: 'toggle', renderIcon: (c, s) => <Accessibility color={c} size={s} /> },
  { id: 'has_safe_room', label: 'ממד', type: 'toggle', renderIcon: (c, s) => <Shield color={c} size={s} /> },
  { id: 'garden', label: 'גינה', type: 'toggle', renderIcon: (c, s) => <Trees color={c} size={s} /> },
  { id: 'balcony', label: 'מרפסת', type: 'toggle', renderIcon: (c, s) => <DoorOpen color={c} size={s} /> },
];

// Helper for consumers to translate ids → fast lookup object
export function selectedFiltersFromIds(ids: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  ids.forEach((id) => {
    out[id] = true;
  });
  return out;
}

export default function FilterChipsBar({
  filters,
  selectedIds,
  onChange,
  onOpenDropdown,
  style,
  chipBorderWidth,
  inactiveBackgroundColor,
  activeBackgroundColor,
  inactiveBorderColor,
  activeBorderColor,
  inactiveTextColor,
  activeTextColor,
  inactiveIconColor,
  activeIconColor,
  withShadow = true,
}: Props) {
  const [internalSelected, setInternalSelected] = useState<string[]>([]);
  const active = selectedIds ?? internalSelected;
  const inactiveBg = inactiveBackgroundColor ?? '#FFFFFF';
  const activeBg = activeBackgroundColor ?? alpha(colors.success, 0.86);
  const inactiveBd = inactiveBorderColor ?? 'transparent';
  const activeBd = activeBorderColor ?? alpha(colors.success, 0.6);
  const inactiveTxt = inactiveTextColor ?? '#6B7280';
  const activeTxt = activeTextColor ?? colors.white;
  const inactiveIc = inactiveIconColor ?? '#6B7280';
  const activeIc = activeIconColor ?? colors.white;
  const borderW = typeof chipBorderWidth === 'number' ? chipBorderWidth : 1;

  // Preserve horizontal scroll offset when toggling chips to avoid jump-to-start
  const scrollRef = useRef<ScrollView | null>(null);
  const savedOffsetXRef = useRef(0);
  const didInitPositionRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);

  // One-time initial positioning for RTL: start from the "right" end.
  // Important: do this only after we know BOTH container+content widths,
  // otherwise it can run later (e.g. on first chip toggle) and "jump" the user back.
  useEffect(() => {
    if (didInitPositionRef.current) return;
    if (containerWidth <= 0) return;
    if (contentWidth <= containerWidth) return;
    const target = Math.max(0, contentWidth - containerWidth);
    savedOffsetXRef.current = target;
    scrollRef.current?.scrollTo({ x: target, animated: false });
    didInitPositionRef.current = true;
  }, [containerWidth, contentWidth]);

  // After selection changes, restore previous offset without animation
  useEffect(() => {
    // Run twice to win over internal relayout scrolls on RTL
    const r1 = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: savedOffsetXRef.current, animated: false });
      const r2 = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: savedOffsetXRef.current, animated: false });
      });
      // store id on ref to keep eslint happy
      (savedOffsetXRef as any)._r2 = r2;
    });
    return () => {
      cancelAnimationFrame(r1);
      if ((savedOffsetXRef as any)._r2) cancelAnimationFrame((savedOffsetXRef as any)._r2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.join('|')]);

  const isActive = (id: string) => active.includes(id);

  const handleToggle = (chip: FilterChip) => {
    if (chip.type === 'dropdown') {
      onOpenDropdown?.(chip);
      return;
    }
    const next = isActive(chip.id)
      ? active.filter((x) => x !== chip.id)
      : [...active, chip.id];
    if (selectedIds == null) setInternalSelected(next);
    onChange?.(next);
  };

  return (
    <View style={[styles.wrap, style]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollerContent}
        // RTL – chips מתחילים מימין, גוללים לשמאל
        style={[{ direction: 'rtl' as any }, styles.scroller]}
        onLayout={(e) => {
          setContainerWidth(e.nativeEvent.layout.width);
        }}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          savedOffsetXRef.current = e.nativeEvent.contentOffset.x;
        }}
        onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          savedOffsetXRef.current = e.nativeEvent.contentOffset.x;
        }}
        onScrollEndDrag={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          savedOffsetXRef.current = e.nativeEvent.contentOffset.x;
        }}
        onContentSizeChange={(w) => {
          setContentWidth(w);
        }}
        scrollEventThrottle={16}
      >
        <View style={styles.rowReverse}>
          {filters.map((chip) => {
            const activeChip = isActive(chip.id);
            const iconColor = activeChip ? activeIc : inactiveIc;
            const Icon =
              chip.renderIcon ??
              ((c: string, s: number) => <Tag color={c} size={s} />);

            const inactiveOverrides =
              inactiveBackgroundColor || inactiveBorderColor
                ? ({
                    ...(inactiveBackgroundColor ? { backgroundColor: inactiveBackgroundColor } : null),
                    ...(inactiveBorderColor ? { borderColor: inactiveBorderColor } : null),
                  } as const)
                : null;

            const activeOverrides =
              activeBackgroundColor || activeBorderColor
                ? ({
                    ...(activeBackgroundColor ? { backgroundColor: activeBackgroundColor } : null),
                    ...(activeBorderColor ? { borderColor: activeBorderColor } : null),
                  } as const)
                : null;
            return (
              <TouchableOpacity
                key={chip.id}
                activeOpacity={0.85}
                onPress={() => handleToggle(chip)}
                style={[
                  styles.chipBase,
                  withShadow ? styles.chipShadow : null,
                  activeChip ? styles.chipActive : styles.chipInactive,
                  activeChip ? activeOverrides : inactiveOverrides,
                  // Force background/border as the last style so it matches exactly (e.g. like search input)
                  {
                    backgroundColor: activeChip ? activeBg : inactiveBg,
                    borderColor: activeChip ? activeBd : inactiveBd,
                    borderWidth: borderW,
                    opacity: 1,
                  },
                ]}
              >
                <View style={styles.chipInnerRow}>
                  {/* RTL visual: אייקון משמאל לטקסט בתוך כפתור */}
                  {chip.type === 'dropdown' ? (
                    <ChevronDown
                      size={16}
                      color={activeChip ? activeIc : inactiveIc}
                      style={{ marginLeft: 4 }}
                    />
                  ) : null}
                  <Text
                    style={[styles.chipLabel, { color: activeChip ? activeTxt : inactiveTxt }]}
                    numberOfLines={1}
                  >
                    {chip.label}
                  </Text>
                  <View style={{ width: 6 }} />
                  {Icon(iconColor, 16)}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 6,
  },
  scroller: {
    // Pull the scroll area to the screen edges even if parent has horizontal padding
    marginHorizontal: -12,
  },
  scrollerContent: {
    paddingHorizontal: 12,
  },
  rowReverse: {
    flexDirection: 'row-reverse',
    gap: 8,
    alignItems: 'center',
  },
  chipBase: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    // Floating look (no border)
    borderWidth: 0,
  },
  chipShadow: {
    // Keep shadow subtle (can be disabled per screen)
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chipInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: 'transparent',
  },
  chipActive: {
    // Default active bg; can be overridden via props.
    backgroundColor: alpha(colors.success, 0.86),
    borderColor: alpha(colors.success, 0.6),
  },
  chipInnerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  // chip label colors are set inline to allow per-screen theming
});


