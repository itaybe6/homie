import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { Calendar, Cigarette, MapPin, Moon, PawPrint, Sparkles, Utensils, Wallet } from 'lucide-react-native';

export type PreferencesSummaryGridProps = {
  budgetLabel?: string | null;
  cityLabel?: string | null;
  moveInLabel?: string | null;
  vibeLabel?: string | null;
  isSmoker?: boolean | null;
  keepsKosher?: boolean | null;
  isShomerShabbat?: boolean | null;
  hasPet?: boolean | null;
  /**
   * Force palette. When omitted, follows system color scheme.
   */
  appearance?: 'auto' | 'light' | 'dark';
};

function formatYesNo(v: boolean | null | undefined) {
  if (v === true) return 'כן';
  if (v === false) return 'לא';
  return 'לא צוין';
}

export function PreferencesSummaryGrid({
  budgetLabel,
  cityLabel,
  moveInLabel,
  vibeLabel,
  isSmoker,
  keepsKosher,
  isShomerShabbat,
  hasPet,
  appearance = 'auto',
}: PreferencesSummaryGridProps) {
  const scheme = useColorScheme();
  const isDark = appearance === 'dark' ? true : appearance === 'light' ? false : scheme === 'dark';
  const brandBrown = '#5e3f2d';

  const colors = useMemo(() => {
    if (isDark) {
      return {
        textPrimary: '#F9FAFB',
        textSecondary: '#9CA3AF',
        cardBg: 'rgba(31,41,55,0.70)',
        cardBorder: 'rgba(55,65,81,0.55)',
        iconBoxBg: 'rgba(55,65,81,0.55)',
        icon: '#D1D5DB',
        tileIcon: '#9CA3AF',
        tileLabel: '#9CA3AF',
        tileValue: '#F9FAFB',
        emeraldBg: 'rgba(6,95,70,0.26)',
        emeraldBorder: 'rgba(16,185,129,0.25)',
        emeraldIcon: '#34D399',
        emeraldLabel: 'rgba(52,211,153,0.75)',
        emeraldValue: '#D1FAE5',
      };
    }
    return {
      textPrimary: '#1F2937',
      textSecondary: '#6B7280',
      cardBg: '#FFFFFF',
      cardBorder: 'rgba(229,231,235,0.95)',
      iconBoxBg: '#F3F4F6',
      icon: brandBrown,
      tileIcon: brandBrown,
      tileLabel: '#6B7280',
      tileValue: '#1F2937',
      emeraldBg: 'rgba(236,253,245,0.80)',
      emeraldBorder: 'rgba(167,243,208,0.85)',
      emeraldIcon: brandBrown,
      emeraldLabel: 'rgba(5,150,105,0.70)',
      emeraldValue: '#047857',
    };
  }, [isDark]);

  const halfWidth = (Platform.OS === 'web' ? 'calc(50% - 4px)' : '48%') as any;

  return (
    <View style={styles.wrap}>
      <View style={styles.gridRow}>
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <View style={styles.cardTextCol}>
            <Text style={[styles.kicker, { color: colors.textSecondary }]}>תקציב חודשי</Text>
            <Text style={[styles.valueBig, { color: colors.textPrimary }]} numberOfLines={1}>
              {budgetLabel || 'לא צוין'}
            </Text>
          </View>
          <View style={[styles.iconBoxLg, { backgroundColor: colors.iconBoxBg }]}>
            <Wallet size={20} color={colors.icon} />
          </View>
        </View>

        <View style={styles.row2}>
          <View
            style={[
              styles.card,
              styles.cardHalf,
              { width: halfWidth, backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.cardTextCol}>
              <Text style={[styles.kicker, { color: colors.textSecondary }]}>עיר מועדפת</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]} numberOfLines={1}>
                {cityLabel || 'לא צוין'}
              </Text>
            </View>
            <View style={[styles.iconBoxSm, { backgroundColor: colors.iconBoxBg }]}>
              <MapPin size={18} color={colors.icon} />
            </View>
          </View>

          <View
            style={[
              styles.card,
              styles.cardHalf,
              { width: halfWidth, backgroundColor: colors.cardBg, borderColor: colors.cardBorder },
            ]}
          >
            <View style={styles.cardTextCol}>
              <Text style={[styles.kicker, { color: colors.textSecondary }]}>כניסה מתוכננת</Text>
              <Text style={[styles.value, { color: colors.textPrimary }]} numberOfLines={1}>
                {moveInLabel || 'לא צוין'}
              </Text>
            </View>
            <View style={[styles.iconBoxSm, { backgroundColor: colors.iconBoxBg }]}>
              <Calendar size={18} color={colors.icon} />
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
          <View style={styles.cardTextCol}>
            <Text style={[styles.kicker, { color: colors.textSecondary }]}>וייב</Text>
            <Text style={[styles.value, { color: colors.textPrimary }]} numberOfLines={1}>
              {vibeLabel || 'לא צוין'}
            </Text>
          </View>
          <View style={[styles.iconBoxSm, { backgroundColor: colors.iconBoxBg }]}>
            <Sparkles size={18} color={colors.icon} />
          </View>
        </View>

        <View style={styles.tilesRow}>
          <View style={[styles.tile, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Cigarette size={20} color={colors.tileIcon} />
            <View style={styles.tileTexts}>
              <Text style={[styles.tileLabel, { color: colors.tileLabel }]}>מעשן/ת</Text>
              <Text style={[styles.tileValue, { color: colors.tileValue }]}>{formatYesNo(isSmoker)}</Text>
            </View>
          </View>

          <View style={[styles.tile, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Utensils size={20} color={colors.tileIcon} />
            <View style={styles.tileTexts}>
              <Text style={[styles.tileLabel, { color: colors.tileLabel }]}>כשרות</Text>
              <Text style={[styles.tileValue, { color: colors.tileValue }]}>{formatYesNo(keepsKosher)}</Text>
            </View>
          </View>

          <View style={[styles.tile, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
            <Moon size={20} color={colors.tileIcon} />
            <View style={styles.tileTexts}>
              <Text style={[styles.tileLabel, { color: colors.tileLabel }]}>שומר/ת שבת</Text>
              <Text style={[styles.tileValue, { color: colors.tileValue }]}>{formatYesNo(isShomerShabbat)}</Text>
            </View>
          </View>

          <View
            style={[
              styles.tile,
              {
                backgroundColor: hasPet ? colors.emeraldBg : colors.cardBg,
                borderColor: hasPet ? colors.emeraldBorder : colors.cardBorder,
              },
            ]}
          >
            <PawPrint size={20} color={hasPet ? colors.emeraldIcon : colors.tileIcon} />
            <View style={styles.tileTexts}>
              <Text style={[styles.tileLabel, { color: hasPet ? colors.emeraldLabel : colors.tileLabel }]}>חיית מחמד</Text>
              <Text style={[styles.tileValue, { color: hasPet ? colors.emeraldValue : colors.tileValue }]}>{formatYesNo(hasPet)}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  gridRow: {
    width: '100%',
    gap: 8,
  },
  row2: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  card: {
    width: '100%',
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHalf: {
    minWidth: 140,
  },
  cardTextCol: {
    flex: 1,
    alignItems: 'flex-end',
    paddingLeft: 8,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    opacity: 0.92,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  valueBig: {
    marginTop: 3,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  value: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  iconBoxLg: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxSm: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tilesRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  tile: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tileTexts: {
    alignItems: 'center',
  },
  tileLabel: {
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
    opacity: 0.9,
  },
  tileValue: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
    includeFontPadding: false,
  },
});

