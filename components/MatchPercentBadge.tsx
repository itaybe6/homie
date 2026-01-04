import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ticker from '@/components/Ticker';

type MatchPercentBadgeProps = {
  value?: number | null;
  /**
   * Use this to restart the animation when switching cards even if the value stays the same.
   * Example: pass user.id.
   */
  triggerKey?: string | number | null;
  size?: number;
  style?: ViewStyle;
  delayMs?: number;
  label?: string;
};

export default function MatchPercentBadge({
  value,
  triggerKey,
  size = 72,
  style,
  delayMs = 160,
  label = 'התאמה',
}: MatchPercentBadgeProps) {
  const isNumber = typeof value === 'number' && Number.isFinite(value);
  const normalized = useMemo(() => {
    if (!isNumber) return null;
    return Math.max(0, Math.min(100, Math.round(value as number)));
  }, [isNumber, value]);

  const [display, setDisplay] = useState<string>('--%');

  useEffect(() => {
    let t: any;
    if (typeof normalized !== 'number') {
      setDisplay('--%');
      return () => {};
    }
    const digitsLen = String(normalized).length;
    const start = `${'0'.repeat(digitsLen)}%`;
    const end = `${normalized}%`;
    setDisplay(start);
    t = setTimeout(() => setDisplay(end), delayMs);
    return () => {
      try {
        clearTimeout(t);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized, triggerKey]);

  const isDisabled = typeof normalized !== 'number';
  const colors =
    isDisabled
      ? (['rgba(17,24,39,0.55)', 'rgba(17,24,39,0.35)'] as const)
      : (['#4ADE80', '#16A34A'] as const);
  const borderColor = isDisabled ? 'rgba(255,255,255,0.22)' : 'rgba(134,239,172,0.60)';

  // Fit text better for different sizes (slightly more compact)
  const valueFontSize = Math.max(12, Math.round(size * 0.235));
  const labelFontSize = Math.max(9, Math.round(size * 0.13));

  return (
    <View style={[styles.shadowWrap, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <LinearGradient
        colors={colors as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.badge,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor,
          },
        ]}
      >
        <Ticker
          value={display}
          fontSize={valueFontSize}
          staggerDuration={Math.max(35, Math.round(size * 0.75))}
          style={styles.value}
        />
        <Text style={[styles.label, { fontSize: labelFontSize }]} numberOfLines={1}>
          {label}
        </Text>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 12px 28px rgba(0,0,0,0.18)' } as any) : null),
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  value: {
    color: '#FFFFFF',
    fontWeight: '900',
    includeFontPadding: false,
    textAlign: 'center',
    writingDirection: 'ltr',
    lineHeight: undefined as any,
  },
  label: {
    // Ticker has an internal cell height; pull the label a bit closer.
    marginTop: -2,
    color: 'rgba(255,255,255,0.92)',
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
    lineHeight: 12,
  },
});


