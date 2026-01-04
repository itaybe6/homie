import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { CalendarDays, Cigarette, MapPin, PawPrint, Sparkles, Sunset, User as UserIcon, UtensilsCrossed, Wallet } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolate, interpolate, measure, runOnJS, useAnimatedReaction, useAnimatedRef, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Apartment, User, UserSurveyResponse } from '@/types/database';
import MatchPercentBadge from '@/components/MatchPercentBadge';
import SwipeUpIndicator from '@/components/SwipeUpIndicator';
import { fetchUserSurvey } from '@/lib/survey';
import { formatCurrencyILS, formatMonthLabel } from '@/lib/surveyHighlights';

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

export type GroupCardProps = {
  groupId: string;
  users: User[];
  apartment?: Apartment;
  matchScores?: Record<string, number | null>;
  onLike: (groupId: string, users: User[]) => void;
  onPass: (groupId: string, users: User[]) => void;
  onOpen: (userId: string) => void;
  onOpenApartment?: (apartmentId: string) => void;
  onDetailsOpenChange?: (isOpen: boolean) => void;
  style?: ViewStyle;
  mediaHeight?: number;
};

const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
const DEFAULT_MEDIA_HEIGHT = 520;
const CARD_RADIUS = 20;

export default function GroupCard({
  groupId,
  users,
  apartment,
  matchScores,
  onLike,
  onPass,
  onOpen,
  onOpenApartment,
  onDetailsOpenChange,
  style,
  mediaHeight,
}: GroupCardProps) {
  const displayUsers = users.slice(0, 4);
  const extra = users.length - displayUsers.length;
  const isOneRowLayout = displayUsers.length === 3 || displayUsers.length === 4;
  const resolvedMediaHeight =
    typeof mediaHeight === 'number' && Number.isFinite(mediaHeight) ? mediaHeight : DEFAULT_MEDIA_HEIGHT;

  const [detailsActivated, setDetailsActivated] = useState(false);
  const [surveysByUserId, setSurveysByUserId] = useState<Record<string, UserSurveyResponse | null>>({});
  const [loading, setLoading] = useState(false);

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

  // Parallax open progress
  const detailsRef = useAnimatedRef<Animated.View>();
  const openProgress = useSharedValue(0); // 0..1
  const panStartProgress = useSharedValue(0);
  const allowPan = useSharedValue(0); // 0/1

  useEffect(() => {
    // Reset when switching groups
    openProgress.value = 0;
    setDetailsActivated(false);
    setSurveysByUserId({});
  }, [groupId]);

  useAnimatedReaction(
    () => openProgress.value >= 0.85,
    (opened, prev) => {
      if (opened === prev) return;
      if (onDetailsOpenChange) runOnJS(onDetailsOpenChange)(opened);
    },
    [onDetailsOpenChange],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!detailsActivated) return;
      const ids = (users || []).map((u) => u?.id).filter(Boolean) as string[];
      if (!ids.length) return;
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
  }, [detailsActivated, users]);

  // Clamp details panel height
  const detailsMinHeight = useMemo(() => {
    const perUserRows = (users || []).reduce((acc, u) => acc + (buildDetailsItems(surveysByUserId[u.id]).length ? 1 : 1), 0);
    const headerH = 52;
    const rowH = 68;
    const desired = headerH + Math.min(4, Math.max(2, perUserRows)) * rowH + 22;
    const min = 210;
    const max = Math.round(resolvedMediaHeight * 0.62);
    return Math.max(min, Math.min(max, Math.round(desired)));
  }, [resolvedMediaHeight, surveysByUserId, users]);

  const detailsPanelStyle = useAnimatedStyle(() => {
    if (!_WORKLET) return {};
    const m = measure(detailsRef);
    const h = (m?.height ?? 0) > 0 ? (m?.height as number) : detailsMinHeight;
    return {
      transform: [{ translateY: interpolate(openProgress.value, [0, 1], [h, 0], Extrapolate.CLAMP) }],
    };
  });

  const imageTranslateStyle = useAnimatedStyle(() => {
    if (!_WORKLET) return {};
    const m = measure(detailsRef);
    const h = (m?.height ?? 0) > 0 ? (m?.height as number) : detailsMinHeight;
    return {
      transform: [{ translateY: interpolate(openProgress.value, [0, 1], [0, -h], Extrapolate.CLAMP) }],
    };
  });

  const ensureActivated = () => {
    if (!detailsActivated) setDetailsActivated(true);
  };

  const flingUp = Gesture.Fling()
    .direction(Directions.UP)
    .onStart(() => {
      runOnJS(ensureActivated)();
      openProgress.value = withSpring(1, { damping: 18, stiffness: 220 });
    });

  const flingDown = Gesture.Fling()
    .direction(Directions.DOWN)
    .onStart(() => {
      openProgress.value = withSpring(0, { damping: 18, stiffness: 220 });
    });

  const pan = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .failOffsetX([-14, 14])
    .onBegin((e) => {
      panStartProgress.value = openProgress.value;
      // Only start opening from the bottom area, but allow closing from anywhere when already open.
      const fromBottom = e.y >= resolvedMediaHeight * 0.55;
      allowPan.value = fromBottom || openProgress.value > 0 ? 1 : 0;
      if (allowPan.value) runOnJS(ensureActivated)();
    })
    .onUpdate((e) => {
      if (!allowPan.value) return;
      const m = measure(detailsRef);
      const h = (m?.height ?? 0) > 0 ? (m?.height as number) : detailsMinHeight;
      const next = Math.max(0, Math.min(1, panStartProgress.value - e.translationY / h));
      openProgress.value = next;
    })
    .onEnd((e) => {
      if (!allowPan.value) return;
      const shouldOpen = openProgress.value > 0.35 || e.velocityY < -600;
      openProgress.value = withSpring(shouldOpen ? 1 : 0, { damping: 18, stiffness: 220 });
    });

  const gesture = Gesture.Simultaneous(pan, flingUp, flingDown);

  return (
    <View style={[styles.card, style]}>
      <GestureDetector gesture={gesture}>
        <View style={[styles.imageWrap, { height: resolvedMediaHeight }]}>
          {/* Details panel (slides from bottom) */}
          <Animated.View style={[styles.detailsPanelWrap, detailsPanelStyle]} pointerEvents="none">
            <Animated.View ref={detailsRef} style={[styles.detailsPanelInner, { minHeight: detailsMinHeight }]}>
              <LinearGradient
                colors={[palette.gradient1, palette.gradient2]}
                start={[0, 0]}
                end={[0, 1]}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={styles.detailsGrabber} />

              <View style={styles.detailsHeaderRow}>
                <View style={styles.detailsHeaderLeft}>
                  <Text style={[styles.detailsTitle, { color: palette.text }]}>מה חשוב לנו</Text>
                  <Text style={[styles.detailsSubtitle, { color: palette.textMuted }]}>פרטים מהשאלון</Text>
                </View>
                <View style={[styles.detailsHintPill, { backgroundColor: palette.accentLight }]}>
                  <Text style={[styles.detailsHint, { color: palette.accent }]}>↓ סגור</Text>
                </View>
              </View>

              {loading ? (
                <View style={styles.loadingWrap}>
                  <Text style={[styles.detailsEmptyText, { color: palette.textMuted }]}>טוען פרטים…</Text>
                </View>
              ) : (
                <View style={styles.membersDetails}>
                  {(users || []).slice(0, 4).map((u) => {
                    const details = buildDetailsItems(surveysByUserId[u.id]);
                    return (
                      <View key={u.id} style={styles.memberBlock}>
                        <Text style={[styles.memberBlockTitle, { color: palette.text }]} numberOfLines={1}>
                          {u.full_name || 'משתמש/ת'}
                        </Text>
                        {details.length ? (
                          <View style={styles.detailsGrid}>
                            {details.slice(0, 4).map((it) => {
                              const Icon = it.icon;
                              return (
                                <View key={`${u.id}:${it.label}:${it.value}`} style={[styles.detailCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
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
                          <Text style={[styles.detailsEmptyText, { color: palette.textMuted }]}>אין מידע מהשאלון</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </Animated.View>
          </Animated.View>

          {/* Foreground (grid) shifts up when opening details */}
          <Animated.View style={[StyleSheet.absoluteFillObject, styles.foregroundLayer, imageTranslateStyle]}>
            <View style={styles.gridWrap}>
              {displayUsers.map((u, idx) => {
                const rows = isOneRowLayout ? 1 : Math.ceil(displayUsers.length / 2);
                const cellHeight = rows === 1 ? resolvedMediaHeight : resolvedMediaHeight / 2;
                const isLastWithExtra = idx === displayUsers.length - 1 && extra > 0;
                const matchPercent = matchScores?.[u.id] ?? null;
                return (
                  <TouchableOpacity
                    key={u.id}
                    activeOpacity={0.9}
                    onPress={() => {
                      // When details are open, ignore taps.
                      if (openProgress.value >= 0.85) return;
                      onOpen(u.id);
                    }}
                    delayLongPress={350}
                    onLongPress={() => {
                      ensureActivated();
                      openProgress.value = withSpring(1, { damping: 18, stiffness: 220 });
                    }}
                    style={[
                      styles.cell,
                      {
                        height: cellHeight,
                        width: (isOneRowLayout ? `${(100 / displayUsers.length).toFixed(4)}%` : '50%') as any,
                      },
                      isOneRowLayout && idx === displayUsers.length - 1 ? { borderRightWidth: 0 } : null,
                    ]}
                  >
                    <View style={styles.cellImageWrap}>
                      {u.avatar_url ? (
                        <Image source={{ uri: u.avatar_url || DEFAULT_AVATAR }} style={styles.cellImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.cellPlaceholder}>
                          <UserIcon size={56} color="#9CA3AF" />
                          <Text style={styles.cellPlaceholderText} numberOfLines={2}>
                            למשתמש זה אין תמונות עדיין
                          </Text>
                        </View>
                      )}

                      <MatchPercentBadge value={matchPercent} triggerKey={`${groupId}-${u.id}`} size={58} style={[styles.matchBadge, styles.matchBadgeLarge]} />

                      <View style={styles.cellBottomOverlay}>
                        <LinearGradient
                          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={styles.cellBottomOverlayGradient}
                        />
                        <View style={styles.cellBottomOverlayContent}>
                          {!!u.full_name ? (
                            <Text style={styles.cellOverlayName} numberOfLines={1}>
                              {u.full_name}
                            </Text>
                          ) : null}
                          {!!u.age ? <Text style={styles.cellOverlayAge}>{u.age}</Text> : null}
                          {!!u.bio ? (
                            <Text style={styles.cellOverlayBio} numberOfLines={1}>
                              {u.bio}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      {isLastWithExtra ? (
                        <View style={styles.extraOverlay}>
                          <Text style={styles.extraOverlayText}>+{extra}</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <SwipeUpIndicator isOpened={openProgress.value >= 0.85} style={{ position: 'absolute', bottom: 14, alignSelf: 'center' }} />
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  imageWrap: {
    width: '100%',
    height: DEFAULT_MEDIA_HEIGHT,
    backgroundColor: '#FFFFFF',
    position: 'relative',
    overflow: 'hidden',
  },
  foregroundLayer: {
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFFFFF',
  },
  cell: {
    width: '50%',
    position: 'relative',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  cellImageWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  cellPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  cellPlaceholderText: {
    marginTop: 8,
    paddingHorizontal: 10,
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  cellBottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
  },
  cellBottomOverlayGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  cellBottomOverlayContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'flex-end',
  },
  cellOverlayName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  cellOverlayAge: {
    color: '#E5E7EB',
    fontSize: 12,
    marginTop: 1,
    textAlign: 'right',
  },
  cellOverlayBio: {
    color: '#E5E7EB',
    fontSize: 12,
    marginTop: 2,
    textAlign: 'right',
  },
  matchBadge: {
    position: 'absolute',
    zIndex: 3,
  },
  matchBadgeLarge: {
    top: 12,
    right: 12,
  },
  extraOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(15,15,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraOverlayText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
  },

  // Details panel
  detailsPanelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  detailsPanelInner: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    overflow: 'hidden',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  detailsGrabber: {
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(139,90,60,0.22)',
    alignSelf: 'center',
    marginBottom: 10,
  },
  detailsHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  detailsHeaderLeft: {
    alignItems: 'flex-end',
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  detailsSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  detailsHintPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  detailsHint: {
    fontSize: 12,
    fontWeight: '900',
  },
  loadingWrap: {
    paddingVertical: 10,
    alignItems: 'flex-end',
  },
  detailsEmptyText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  membersDetails: {
    gap: 10 as any,
  },
  memberBlock: {
    gap: 8 as any,
  },
  memberBlockTitle: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
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

});

