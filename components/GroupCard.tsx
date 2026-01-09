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
  const min = (survey as any).price_min;
  const max = (survey as any).price_max;
  if (typeof min === 'number' && typeof max === 'number') {
    push(Wallet, 'תקציב חודשי', `${formatCurrencyILS(min)} - ${formatCurrencyILS(max)}`);
  } else if (typeof survey.price_range === 'number') {
    push(Wallet, 'תקציב חודשי', formatCurrencyILS(survey.price_range));
  }
  {
    const from = (survey as any).move_in_month_from || survey.move_in_month;
    const to = (survey as any).move_in_month_to || from;
    const flexible = !!(survey as any).move_in_is_flexible;
    const label =
      flexible && from && to && to !== from
        ? `${formatMonthLabel(from)} - ${formatMonthLabel(to)}`
        : formatMonthLabel(from);
    push(CalendarDays, 'כניסה מתוכננת', label);
  }
  push(Sparkles, 'וייב', ((survey as any).home_lifestyle || '') as string);

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
  strongTextOverlay?: boolean;
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
  strongTextOverlay = false,
}: GroupCardProps) {
  const displayUsers = users.slice(0, 4);
  const extra = users.length - displayUsers.length;
  const resolvedMediaHeight =
    typeof mediaHeight === 'number' && Number.isFinite(mediaHeight) ? mediaHeight : DEFAULT_MEDIA_HEIGHT;

  const [detailsActivated, setDetailsActivated] = useState(false);
  const [surveysByUserId, setSurveysByUserId] = useState<Record<string, UserSurveyResponse | null>>({});
  const [loading, setLoading] = useState(false);
  const [activeUserId, setActiveUserId] = useState<string>(() => displayUsers[0]?.id || '');
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

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
    setIsDetailsOpen(false);
    setActiveUserId((prev) => {
      const first = displayUsers[0]?.id || '';
      if (!first) return '';
      // Keep previous selection if still present
      if (prev && displayUsers.some((u) => u.id === prev)) return prev;
      return first;
    });
  }, [groupId]);

  useAnimatedReaction(
    () => openProgress.value >= 0.85,
    (opened, prev) => {
      if (opened === prev) return;
      runOnJS(setIsDetailsOpen)(opened);
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
  const activeUser = useMemo(() => {
    const u = displayUsers.find((x) => x.id === activeUserId);
    return u || displayUsers[0] || (users?.[0] as User | undefined);
  }, [activeUserId, displayUsers, users]);

  const detailsMinHeight = useMemo(() => {
    const selectedId = activeUser?.id || displayUsers[0]?.id || users?.[0]?.id;
    const selectedDetailsCount = selectedId ? buildDetailsItems(surveysByUserId[selectedId]).length : 0;
    const headerH = 52;
    const membersStripH = (users?.length || 0) > 1 ? 82 : 0;
    const rowH = 68;
    const rows = Math.min(4, Math.max(2, selectedDetailsCount ? 3 : 2));
    const desired = headerH + membersStripH + rows * rowH + 22;
    const min = 210;
    const max = Math.round(resolvedMediaHeight * 0.62);
    return Math.max(min, Math.min(max, Math.round(desired)));
  }, [activeUser?.id, resolvedMediaHeight, surveysByUserId, users, displayUsers]);

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

  const activeMatchPercent = useMemo(() => {
    if (!activeUser?.id) return null;
    return matchScores?.[activeUser.id] ?? null;
  }, [activeUser?.id, matchScores]);

  const otherUsers = useMemo(() => {
    const base = displayUsers.filter((u) => u.id !== activeUser?.id);
    // Keep stable order; show only a few circles to avoid clutter
    return base.slice(0, 3);
  }, [activeUser?.id, displayUsers]);

  const bottomOverlayColors = useMemo(() => {
    if (strongTextOverlay) return ['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.82)'];
    return ['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)'];
  }, [strongTextOverlay]);

  return (
    <View style={[styles.card, style]}>
      <GestureDetector gesture={gesture}>
        <View style={[styles.imageWrap, { height: resolvedMediaHeight }]}>
          {/* Details panel (slides from bottom) */}
          <Animated.View
            style={[styles.detailsPanelWrap, detailsPanelStyle]}
            // Allow tapping "tabs" only when the panel is actually open.
            pointerEvents={isDetailsOpen ? 'auto' : 'none'}
          >
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
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    openProgress.value = withSpring(0, { damping: 18, stiffness: 220 });
                  }}
                  style={[styles.detailsHintPill, { backgroundColor: palette.accentLight }]}
                  accessibilityRole="button"
                  accessibilityLabel="סגור"
                >
                  <Text style={[styles.detailsHint, { color: palette.accent }]}>↓ סגור</Text>
                </TouchableOpacity>
              </View>

              {/* Shared profile members strip (avatars + names) */}
              {(users || []).length > 1 ? (
                <View style={styles.membersStrip}>
                  <View style={styles.membersStripHeader}>
                    <View style={styles.membersStripDivider} />
                    <View style={[styles.membersStripTitlePill, { backgroundColor: palette.accentLight }]}>
                      <Text style={[styles.membersStripTitle, { color: palette.accent }]} numberOfLines={1}>
                        פרופילים משותפים
                      </Text>
                    </View>
                    <View style={styles.membersStripDivider} />
                  </View>
                  <View
                    style={[
                      styles.membersStripRow,
                      displayUsers.length === 3 && extra === 0 ? styles.membersStripRowThreeAcross : null,
                    ]}
                  >
                    {displayUsers.map((u, i) => {
                      const isLast = i === displayUsers.length - 1;
                      const showExtra = isLast && extra > 0;
                      const isActive = u.id === activeUser?.id;
                      const isThreeAcross = displayUsers.length === 3 && extra === 0;
                      return (
                        <TouchableOpacity
                          key={u.id}
                          activeOpacity={0.85}
                          onPress={() => setActiveUserId(u.id)}
                          style={[
                            styles.memberPill,
                            isThreeAcross ? styles.memberPillThreeAcross : null,
                            isActive ? styles.memberPillActive : null,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`בחר פרופיל ${u.full_name || 'משתמש/ת'}`}
                        >
                          <View style={styles.memberAvatarOuterRing}>
                            <View
                              style={[
                                styles.memberAvatarInnerRing,
                                {
                                  borderColor: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.80)',
                                  borderWidth: isActive ? 5 : 2,
                                },
                              ]}
                            >
                              {u.avatar_url ? (
                                <Image
                                  source={{ uri: u.avatar_url || DEFAULT_AVATAR }}
                                  style={styles.memberAvatarImg}
                                  resizeMode="cover"
                                />
                              ) : (
                                <View style={styles.memberAvatarFallback}>
                                  <UserIcon size={18} color="#9CA3AF" />
                                </View>
                              )}
                              {showExtra ? (
                                <View style={styles.memberExtraOverlay}>
                                  <Text style={styles.memberExtraText}>+{extra}</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                          <Text
                            style={[
                              styles.memberPillName,
                              isThreeAcross ? styles.memberPillNameThreeAcross : null,
                              { color: palette.text },
                            ]}
                            numberOfLines={1}
                          >
                            {u.full_name || 'משתמש/ת'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {loading ? (
                <View style={styles.loadingWrap}>
                  <Text style={[styles.detailsEmptyText, { color: palette.textMuted }]}>טוען פרטים…</Text>
                </View>
              ) : (
                <View style={styles.membersDetails}>
                  {(() => {
                    const selected = activeUser || displayUsers[0] || users?.[0];
                    if (!selected?.id) {
                      return (
                        <Text style={[styles.detailsEmptyText, { color: palette.textMuted }]}>
                          אין מידע להצגה
                        </Text>
                      );
                    }
                    const details = buildDetailsItems(surveysByUserId[selected.id]);
                    return (
                      <View key={selected.id} style={styles.memberBlock}>
                        <View style={[styles.selectedHeader, { backgroundColor: palette.cardBg, borderColor: palette.border }]}>
                          <View style={styles.selectedAvatarOuter}>
                            <View style={[styles.selectedAvatarInner, { borderColor: palette.accent }]}>
                              {selected.avatar_url ? (
                                <Image
                                  source={{ uri: selected.avatar_url || DEFAULT_AVATAR }}
                                  style={styles.selectedAvatarImg}
                                  resizeMode="cover"
                                />
                              ) : (
                                <View style={styles.selectedAvatarFallback}>
                                  <UserIcon size={18} color="#9CA3AF" />
                                </View>
                              )}
                            </View>
                          </View>
                          <View style={styles.selectedHeaderRight}>
                            <Text style={[styles.memberBlockTitle, { color: palette.text }]} numberOfLines={1}>
                              {selected.full_name || 'משתמש/ת'}
                            </Text>
                            <Text style={[styles.selectedHeaderSubtitle, { color: palette.textMuted }]} numberOfLines={1}>
                              פרופיל נבחר
                            </Text>
                          </View>
                        </View>
                        {details.length ? (
                          <View style={styles.detailsGrid}>
                            {details.slice(0, 4).map((it) => {
                              const Icon = it.icon;
                              return (
                                <View
                                  key={`${selected.id}:${it.label}:${it.value}`}
                                  style={[styles.detailCard, { backgroundColor: palette.cardBg, borderColor: palette.border }]}
                                >
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
                  })()}
                </View>
              )}
            </Animated.View>
          </Animated.View>

          {/* Foreground (grid) shifts up when opening details */}
          <Animated.View style={[StyleSheet.absoluteFillObject, styles.foregroundLayer, imageTranslateStyle]}>
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => {
                if (isDetailsOpen) return;
                if (activeUser?.id) onOpen(activeUser.id);
              }}
              delayLongPress={350}
              onLongPress={() => {
                ensureActivated();
                openProgress.value = withSpring(1, { damping: 18, stiffness: 220 });
              }}
              style={styles.heroWrap}
            >
              {activeUser?.avatar_url ? (
                <Image source={{ uri: activeUser.avatar_url || DEFAULT_AVATAR }} style={styles.heroImage} resizeMode="cover" />
              ) : (
                <View style={styles.heroPlaceholder}>
                  <UserIcon size={84} color="#9CA3AF" />
                  <Text style={styles.cellPlaceholderText} numberOfLines={2}>
                    למשתמש זה אין תמונות עדיין
                  </Text>
                </View>
              )}

              {/* Match percent (top-right) */}
              <MatchPercentBadge
                value={activeMatchPercent}
                triggerKey={`${groupId}-${activeUser?.id || 'active'}`}
                size={74}
                style={[styles.matchBadge, styles.matchBadgeTopRight]}
              />

              {/* Bottom overlay for active user */}
              <View style={[styles.cellBottomOverlay, strongTextOverlay ? styles.cellBottomOverlayStrong : null]}>
                <LinearGradient
                  colors={bottomOverlayColors as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.cellBottomOverlayGradient}
                  locations={strongTextOverlay ? [0, 0.55, 1] : undefined}
                />
                <View style={styles.cellBottomOverlayContent}>
                  <View style={styles.bottomInfoRow} pointerEvents={isDetailsOpen ? 'none' : 'auto'}>
                    {/* Right side: active user text */}
                    <View style={styles.bottomRightText}>
                      {otherUsers.length ? (
                        <View style={styles.sharedTag}>
                          <Text style={styles.sharedTagText} numberOfLines={1}>
                            פרופיל משותף
                          </Text>
                        </View>
                      ) : null}
                      {!!activeUser?.full_name ? (
                        <Text style={styles.cellOverlayName} numberOfLines={1}>
                          {activeUser.full_name}
                          {activeUser.age ? `, ${activeUser.age}` : ''}
                        </Text>
                      ) : null}
                      {!!activeUser?.bio ? (
                        <Text style={styles.cellOverlayBio} numberOfLines={2}>
                          {activeUser.bio}
                        </Text>
                      ) : null}
                    </View>

                    {/* Left side: shared profile tag + other member circles */}
                    {otherUsers.length ? (
                      <View style={styles.bottomLeftShared}>
                        <View style={styles.sharedAvatarsRow}>
                          {otherUsers.map((u, i) => {
                            const isLast = i === otherUsers.length - 1;
                            const showExtra = isLast && extra > 0;
                            return (
                              <TouchableOpacity
                                key={u.id}
                                activeOpacity={0.85}
                                onPress={() => {
                                  if (isDetailsOpen) return;
                                  setActiveUserId(u.id);
                                }}
                                style={styles.thumbOuterRing}
                                accessibilityRole="button"
                                accessibilityLabel={`הצג את ${u.full_name || 'השותף/ה'}`}
                              >
                                <View style={styles.thumbInnerRing}>
                                  {u.avatar_url ? (
                                    <Image
                                      source={{ uri: u.avatar_url || DEFAULT_AVATAR }}
                                      style={styles.thumbImage}
                                      resizeMode="cover"
                                    />
                                  ) : (
                                    <View style={styles.thumbFallback}>
                                      <UserIcon size={14} color="#9CA3AF" />
                                    </View>
                                  )}
                                  {showExtra ? (
                                    <View style={styles.thumbExtraOverlay}>
                                      <Text style={styles.thumbExtraText}>+{extra}</Text>
                                    </View>
                                  ) : null}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              <SwipeUpIndicator isOpened={isDetailsOpen} style={{ position: 'absolute', bottom: 14, alignSelf: 'center' }} />
            </TouchableOpacity>
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
  heroWrap: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#FFFFFF',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
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
    height: 128,
  },
  cellBottomOverlayStrong: {
    height: 170,
  },
  cellBottomOverlayGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  cellBottomOverlayContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'stretch',
  },
  bottomInfoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12 as any,
  },
  bottomRightText: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  bottomLeftShared: {
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  sharedTag: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.20)',
    marginBottom: 8,
  },
  sharedTagText: {
    color: '#5e3f2d',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'left',
  },
  sharedAvatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8 as any,
  },
  cellOverlayName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
    flexShrink: 1,
  },
  cellOverlayAge: {
    color: '#E5E7EB',
    fontSize: 12,
    marginTop: 1,
    textAlign: 'right',
  },
  cellOverlayBio: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 18,
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
  matchBadgeTopRight: {
    top: 12,
    right: 12,
  },
  thumbOuterRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(94,63,45,0.55)',
    padding: 1,
    backgroundColor: 'transparent',
  },
  thumbInnerRing: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.90)',
    backgroundColor: '#F3F4F6',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbExtraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbExtraText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
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
  membersStrip: {
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(139,90,60,0.14)',
  },
  membersStripHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10 as any,
    marginBottom: 12,
  },
  membersStripDivider: {
    height: 1,
    flex: 1,
    backgroundColor: 'rgba(139,90,60,0.16)',
  },
  membersStripTitlePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(139,90,60,0.18)',
  },
  membersStripTitle: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  membersStripRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 14 as any,
    flexWrap: 'wrap',
  },
  membersStripRowThreeAcross: {
    width: '100%',
    justifyContent: 'space-between',
    gap: 8 as any,
  },
  memberPill: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8 as any,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.16)',
    backgroundColor: '#FFFFFF',
    maxWidth: 132,
    minWidth: 104,
  },
  memberPillThreeAcross: {
    // Force 3 tiles in one row
    flexBasis: '31%' as any,
    maxWidth: '31%' as any,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 18,
  },
  memberPillActive: {
    borderWidth: 2,
    borderColor: '#5e3f2d',
    backgroundColor: '#FFFFFF',
  },
  memberAvatarOuterRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(94,63,45,0.55)',
    padding: 1,
  },
  memberAvatarInnerRing: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.90)',
    backgroundColor: '#F3F4F6',
  },
  memberAvatarImg: {
    width: '100%',
    height: '100%',
  },
  memberAvatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberPillName: {
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
    letterSpacing: 0.2,
  },
  memberPillNameThreeAcross: {
    fontSize: 11,
  },
  memberExtraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,15,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberExtraText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  memberBlock: {
    gap: 8 as any,
  },
  memberBlockTitle: {
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  selectedHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8 as any,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  selectedHeaderRight: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  selectedHeaderSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  selectedAvatarOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.25)',
    padding: 1,
  },
  selectedAvatarInner: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: '#F3F4F6',
  },
  selectedAvatarImg: {
    width: '100%',
    height: '100%',
  },
  selectedAvatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10 as any,
    marginTop: 10,
  },
  detailCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10 as any,
    backgroundColor: 'rgba(255,255,255,0.78)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
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

