import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Cigarette, MapPin, PawPrint, Sparkles, Sunset, UtensilsCrossed, Wallet, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { User, UserSurveyResponse } from '@/types/database';
import { fetchUserSurvey } from '@/lib/survey';
import { formatCurrencyILS, formatMonthLabel } from '@/lib/surveyHighlights';

const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';

type DetailItem = { icon: any; label: string; value: string };

function buildDetailsItems(survey?: UserSurveyResponse | null): DetailItem[] {
  if (!survey) return [];
  const items: DetailItem[] = [];
  const push = (icon: any, label: string, value?: string) => {
    const v = (value || '').trim();
    if (!v) return;
    items.push({ icon, label, value: v });
  };

  push(MapPin, 'עיר מועדפת', survey.preferred_city || '');
  if (typeof survey.price_range === 'number') push(Wallet, 'תקציב חודשי', formatCurrencyILS(survey.price_range));
  push(CalendarDays, 'כניסה מתוכננת', formatMonthLabel(survey.move_in_month));
  push(Sparkles, 'וייב', ((survey as any).lifestyle || survey.home_vibe || '') as string);

  if (typeof survey.is_smoker === 'boolean') push(Cigarette, 'מעשן/ת', survey.is_smoker ? 'כן' : 'לא');
  if (typeof survey.keeps_kosher === 'boolean') push(UtensilsCrossed, 'כשרות', survey.keeps_kosher ? 'כן' : 'לא');
  if (typeof survey.is_shomer_shabbat === 'boolean') push(Sunset, 'שומר/ת שבת', survey.is_shomer_shabbat ? 'כן' : 'לא');
  if (typeof survey.has_pet === 'boolean') push(PawPrint, 'חיית מחמד', survey.has_pet ? 'כן' : 'לא');

  return items.slice(0, 10);
}

export default function GroupParallaxModal({
  visible,
  users,
  matchScores,
  onClose,
  onOpenProfile,
}: {
  visible: boolean;
  users: User[] | null;
  matchScores?: Record<string, number | null>;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [surveysByUserId, setSurveysByUserId] = useState<Record<string, UserSurveyResponse | null>>({});

  const palette = useMemo(
    () => ({
      cardBg: 'rgba(255,255,255,0.92)',
      accent: '#8B5A3C',
      accentLight: 'rgba(139,90,60,0.12)',
      text: '#3D2814',
      textMuted: '#8C7A6A',
      border: 'rgba(139,90,60,0.15)',
      gradient1: '#FDF8F3',
      gradient2: '#F5EDE5',
    }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!visible) return;
      const ids = (users || []).map((u) => u?.id).filter(Boolean) as string[];
      if (!ids.length) {
        setSurveysByUserId({});
        return;
      }
      try {
        setLoading(true);
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const s = await fetchUserSurvey(id);
              return [id, s] as const;
            } catch {
              return [id, null] as const;
            }
          }),
        );
        if (cancelled) return;
        setSurveysByUserId(Object.fromEntries(results));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, (users || []).map((u) => u.id).join('|')]);

  const title = `פרופיל מאוחד${users?.length ? ` · ${users.length}` : ''}`;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 12) }]}>
          <View style={styles.sheetTopRow}>
            <View style={styles.grabber} />
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityRole="button">
              <X size={18} color="#111827" />
            </Pressable>
          </View>

          <LinearGradient
            colors={[palette.gradient1, palette.gradient2]}
            start={[0, 0]}
            end={[0, 1]}
            style={StyleSheet.absoluteFillObject}
          />

          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: palette.text }]}>{title}</Text>
            <Text style={[styles.headerSubtitle, { color: palette.textMuted }]}>גלול/י כדי לראות את כולם</Text>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            bounces
            alwaysBounceVertical
          >
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator />
                <Text style={[styles.loadingText, { color: palette.textMuted }]}>טוען פרטים…</Text>
              </View>
            ) : null}

            {(users || []).map((u) => {
              const survey = surveysByUserId[u.id] ?? null;
              const details = buildDetailsItems(survey);
              const match = matchScores?.[u.id] ?? null;
              return (
                <View key={u.id} style={[styles.memberCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                  <Pressable
                    onPress={() => {
                      onClose();
                      onOpenProfile(u.id);
                    }}
                    style={styles.memberHeaderRow}
                    accessibilityRole="button"
                  >
                    <View style={styles.memberHeaderRight}>
                      <Image source={{ uri: u.avatar_url || DEFAULT_AVATAR }} style={styles.avatar} />
                      <View style={styles.nameWrap}>
                        <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
                          {u.full_name || 'משתמש/ת'}
                        </Text>
                        <Text style={[styles.sub, { color: palette.textMuted }]} numberOfLines={1}>
                          {u.city || '—'}
                          {typeof u.age === 'number' ? ` · ${u.age}` : ''}
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.matchPill, { backgroundColor: palette.accentLight }]}>
                      <Text style={[styles.matchPillText, { color: palette.accent }]}>
                        {match === null || match === undefined ? '--%' : `${match}%`}
                      </Text>
                    </View>
                  </Pressable>

                  {details.length ? (
                    <View style={styles.detailsGrid}>
                      {details.map((it) => {
                        const Icon = it.icon;
                        return (
                          <View key={`${u.id}:${it.label}:${it.value}`} style={[styles.detailCard, { borderColor: palette.border }]}>
                            <View style={[styles.detailIconWrap, { backgroundColor: palette.accentLight }]}>
                              <Icon size={16} color={palette.accent} strokeWidth={2.5} />
                            </View>
                            <View style={styles.detailTextWrap}>
                              <Text style={[styles.detailLabel, { color: palette.textMuted }]} numberOfLines={1}>
                                {it.label}
                              </Text>
                              <Text style={[styles.detailValue, { color: palette.text }]} numberOfLines={1}>
                                {it.value}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={[styles.empty, { color: palette.textMuted }]}>אין מידע מהשאלון להצגה כרגע</Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    minHeight: 360,
    maxHeight: '88%',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  sheetTopRow: {
    position: 'relative',
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
  },
  grabber: {
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(139,90,60,0.22)',
  },
  closeBtn: {
    position: 'absolute',
    left: 0,
    top: -2,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
  },
  header: {
    paddingTop: 6,
    paddingBottom: 12,
    paddingHorizontal: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  scrollContent: {
    paddingBottom: 8,
    gap: 10 as any,
  },
  loadingWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10 as any,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  memberCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    shadowColor: '#3D2814',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  memberHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10 as any,
    marginBottom: 10,
  },
  memberHeaderRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10 as any,
    flexShrink: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  nameWrap: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  sub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  matchPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchPillText: {
    fontSize: 12,
    fontWeight: '900',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8 as any,
  },
  detailCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10 as any,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  detailIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTextWrap: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'right',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
    marginTop: 1,
  },
  empty: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    paddingVertical: 6,
  },
});

