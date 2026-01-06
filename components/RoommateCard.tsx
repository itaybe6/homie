import React, { memo, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, ViewStyle, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  MapPin,
  CalendarDays,
  Wallet,
  Sparkles,
  Cigarette,
  UtensilsCrossed,
  Sunset,
  PawPrint,
  User as UserIcon,
} from 'lucide-react-native';
import { User, UserSurveyResponse } from '@/types/database';
import { supabase } from '@/lib/supabase';
import MatchPercentBadge from '@/components/MatchPercentBadge';
import SwipeUpIndicator from '@/components/SwipeUpIndicator';
import { fetchUserSurvey } from '@/lib/survey';
import { formatCurrencyILS, formatMonthLabel } from '@/lib/surveyHighlights';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolate,
  interpolate,
  measure,
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type RoommateCardProps = {
  user: User;
  onLike: (user: User) => void;
  onPass: (user: User) => void;
  onOpen?: (user: User) => void;
  onLongPress?: (user: User) => void;
  enableParallaxDetails?: boolean;
  initialDetailsOpen?: boolean;
  onDetailsOpenChange?: (isOpen: boolean) => void;
  style?: ViewStyle;
  matchPercent?: number | null;
  mediaHeight?: number;
  strongTextOverlay?: boolean;
};

function RoommateCardBase({
  user,
  onLike,
  onPass,
  onOpen,
  onLongPress,
  enableParallaxDetails = false,
  initialDetailsOpen = false,
  onDetailsOpenChange,
  style,
  matchPercent,
  mediaHeight,
  strongTextOverlay = false,
}: RoommateCardProps) {
  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const resolvedMediaHeight = typeof mediaHeight === 'number' && Number.isFinite(mediaHeight) ? mediaHeight : 520;
  const hasAvatar = useMemo(() => !!(user?.avatar_url && String(user.avatar_url).trim()), [user?.avatar_url]);
  type ProfileApartment = {
    id: string;
    title?: string | null;
    city?: string | null;
    image_urls?: any;
  };
  const [apartments, setApartments] = useState<ProfileApartment[]>([]);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});
  const [survey, setSurvey] = useState<UserSurveyResponse | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);

  const normalizeImageUrls = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return (value as unknown[])
        .filter((u) => typeof u === 'string' && !!(u as string).trim()) as string[];
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter((u: any) => typeof u === 'string' && !!u.trim());
        }
      } catch {
        try {
          const cleaned = value.replace(/^\s*\{|\}\s*$/g, '');
          if (!cleaned) return [];
          return cleaned
            .split(',')
            .map((s) => s.replace(/^"+|"+$/g, '').trim())
            .filter(Boolean);
        } catch {
          return [];
        }
      }
    }
    return [];
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        if (!cancelled) setApartments([]);
        return;
      }
      try {
        const [owned, partner] = await Promise.all([
          supabase
            .from('apartments')
            .select('id, title, city, image_urls')
            .eq('owner_id', user.id),
          supabase
            .from('apartments')
            .select('id, title, city, image_urls')
            .contains('partner_ids', [user.id] as any),
        ]);
        const merged = [...(owned.data || []), ...(partner.data || [])] as ProfileApartment[];
        const uniq: Record<string, ProfileApartment> = {};
        merged.forEach((a) => {
          if (a?.id) uniq[a.id] = a;
        });
        if (!cancelled) setApartments(Object.values(uniq));
      } catch {
        if (!cancelled) setApartments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Load survey only when we need to show the parallax details panel
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!enableParallaxDetails || !user?.id) {
        setSurvey(null);
        return;
      }
      try {
        setSurveyLoading(true);
        const s = await fetchUserSurvey(user.id);
        if (!cancelled) setSurvey(s);
      } catch {
        if (!cancelled) setSurvey(null);
      } finally {
        if (!cancelled) setSurveyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enableParallaxDetails, user?.id]);

  const detailsItems = useMemo(() => {
    if (!survey) return [];
    const items: { icon: any; label: string; value: string }[] = [];
    const push = (icon: any, label: string, value?: string) => {
      const v = (value || '').trim();
      if (!v) return;
      items.push({ icon, label, value: v });
    };

    // Apartment / plans
    push(MapPin, 'עיר מועדפת', survey.preferred_city || '');
    if (typeof survey.price_range === 'number') push(Wallet, 'תקציב חודשי', formatCurrencyILS(survey.price_range));
    push(CalendarDays, 'כניסה מתוכננת', formatMonthLabel(survey.move_in_month));
    push(Sparkles, 'וייב', ((survey as any).lifestyle || survey.home_vibe || '') as string);

    // Lifestyle
    if (typeof survey.is_smoker === 'boolean') push(Cigarette, 'מעשן/ת', survey.is_smoker ? 'כן' : 'לא');
    if (typeof survey.keeps_kosher === 'boolean') push(UtensilsCrossed, 'כשרות', survey.keeps_kosher ? 'כן' : 'לא');
    if (typeof survey.is_shomer_shabbat === 'boolean') push(Sunset, 'שומר/ת שבת', survey.is_shomer_shabbat ? 'כן' : 'לא');
    if (typeof survey.has_pet === 'boolean') push(PawPrint, 'חיית מחמד', survey.has_pet ? 'כן' : 'לא');

    return items.slice(0, 10);
  }, [survey]);

  const palette = useMemo(
    () => ({
      // Modern elegant palette
      bg: '#FDFBF9',
      cardBg: 'rgba(255,255,255,0.92)',
      accent: '#8B5A3C',
      accentSoft: 'rgba(139,90,60,0.65)',
      accentLight: 'rgba(139,90,60,0.12)',
      text: '#3D2814',
      textMuted: '#8C7A6A',
      border: 'rgba(139,90,60,0.15)',
      shadow: '#5E3F2D',
      gradient1: '#FDF8F3',
      gradient2: '#F5EDE5',
    }),
    [],
  );

  // Keep the bottom panel tight: size it based on the amount of content,
  // but clamp to a reasonable range so it still feels like a "panel".
  const detailsMinHeight = useMemo(() => {
    const headerH = 52;
    const rowH = 34;
    const emptyH = 42;
    const rows = surveyLoading ? 1 : detailsItems.length;
    const contentH = rows > 0 ? rows * rowH : emptyH;
    const desired = headerH + contentH + 22; // paddings
    const min = 170;
    const max = Math.round(resolvedMediaHeight * 0.46);
    return Math.max(min, Math.min(max, Math.round(desired)));
  }, [detailsItems.length, resolvedMediaHeight, surveyLoading]);

  const detailsRef = useAnimatedRef<Animated.View>();
  const openProgress = useSharedValue(0); // 0..1
  const panStartProgress = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const allowPan = useSharedValue(0); // 0/1
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  useEffect(() => {
    // Reset when switching users
    openProgress.value = 0;
  }, [user?.id]);

  useEffect(() => {
    if (!enableParallaxDetails) return;
    if (initialDetailsOpen) openProgress.value = 1;
  }, [enableParallaxDetails, initialDetailsOpen]);

  useAnimatedReaction(
    () => openProgress.value >= 0.85,
    (opened, prev) => {
      if (opened === prev) return;
      runOnJS(setIsDetailsOpen)(opened);
      if (onDetailsOpenChange) runOnJS(onDetailsOpenChange)(opened);
    },
    [onDetailsOpenChange],
  );

  const tap = Gesture.Tap()
    .maxDistance(12)
    .onEnd((_e, success) => {
      if (!success) return;
      // When details are open, a tap shouldn't navigate.
      if (enableParallaxDetails && openProgress.value >= 0.85) return;
      if (onOpen) runOnJS(onOpen)(user);
    });

  const longPress = Gesture.LongPress()
    .minDuration(350)
    .maxDistance(12)
    .onStart(() => {
      if (enableParallaxDetails) {
        openProgress.value = withSpring(1, { damping: 18, stiffness: 220 });
        return;
      }
      if (onLongPress) runOnJS(onLongPress)(user);
    });

  const flingUp = Gesture.Fling()
    .direction(Directions.UP)
    .onStart(() => {
      if (!enableParallaxDetails) return;
      openProgress.value = withSpring(1, { damping: 18, stiffness: 220 });
    });

  const flingDown = Gesture.Fling()
    .direction(Directions.DOWN)
    .onStart(() => {
      if (!enableParallaxDetails) return;
      openProgress.value = withSpring(0, { damping: 18, stiffness: 220 });
    });

  // Drag up from the bottom of the image to open, drag down to close.
  const pan = Gesture.Pan()
    .enabled(enableParallaxDetails)
    .activeOffsetY([-12, 12])
    .failOffsetX([-14, 14])
    .onBegin((e) => {
      panStartProgress.value = openProgress.value;
      panStartY.value = e.y;
      // Only start opening from the bottom area, but allow closing from anywhere when already open.
      const fromBottom = e.y >= resolvedMediaHeight * 0.55;
      allowPan.value = fromBottom || openProgress.value > 0 ? 1 : 0;
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

  const detailsPanelStyle = useAnimatedStyle(() => {
    if (!_WORKLET) return {};
    const m = measure(detailsRef);
    const h = (m?.height ?? 0) > 0 ? (m?.height as number) : detailsMinHeight;
    return {
      transform: [
        {
          translateY: interpolate(openProgress.value, [0, 1], [h, 0], Extrapolate.CLAMP),
        },
      ],
    };
  });

  const imageTranslateStyle = useAnimatedStyle(() => {
    if (!_WORKLET) return {};
    const m = measure(detailsRef);
    const h = (m?.height ?? 0) > 0 ? (m?.height as number) : detailsMinHeight;
    return {
      transform: [
        {
          // Lift the image up to reveal the details panel underneath (like the original demo).
          translateY: interpolate(openProgress.value, [0, 1], [0, -h], Extrapolate.CLAMP),
        },
      ],
    };
  });

  const pressGesture = enableParallaxDetails
    ? Gesture.Exclusive(pan, flingUp, flingDown, longPress, tap)
    : Gesture.Exclusive(longPress, tap);

  const bottomOverlayColors = useMemo(() => {
    if (strongTextOverlay) {
      return ['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.82)'];
    }
    return ['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)'];
  }, [strongTextOverlay]);

  return (
    <View style={[styles.card, style]}>
      <GestureDetector gesture={pressGesture}>
        <View style={[styles.imageWrap, { height: resolvedMediaHeight }]}>
          {/* Details panel (slides from bottom like the demo) */}
          {enableParallaxDetails ? (
            <Animated.View
              style={[styles.detailsPanelWrap, detailsPanelStyle]}
              pointerEvents={isDetailsOpen ? 'auto' : 'none'}
            >
              <Animated.View
                ref={detailsRef}
                style={[styles.detailsPanelInner, { minHeight: detailsMinHeight }]}
              >
                <LinearGradient
                  colors={[palette.gradient1, palette.gradient2]}
                  start={[0, 0]}
                  end={[0, 1]}
                  style={StyleSheet.absoluteFillObject}
                />
                {/* Decorative top bar */}
                <View style={styles.detailsGrabber} />

                {/* Header */}
                <View style={styles.detailsHeaderRow}>
                  <View style={styles.detailsHeaderLeft}>
                    <Text style={[styles.detailsTitle, { color: palette.text }]}>מה חשוב לי</Text>
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

                {/* Content */}
                {surveyLoading ? (
                  <View style={styles.loadingWrap}>
                    <Text style={[styles.detailsEmptyText, { color: palette.textMuted }]}>טוען פרטים…</Text>
                  </View>
                ) : detailsItems.length ? (
                  <View style={styles.detailsGrid}>
                    {detailsItems.map((it) => {
                      const Icon = it.icon;
                      return (
                        <View
                          key={`${it.label}:${it.value}`}
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
                  <View style={styles.emptyWrap}>
                    <Text style={[styles.detailsEmptyText, { color: palette.textMuted }]}>
                      אין מידע מהשאלון להצגה כרגע
                    </Text>
                  </View>
                )}
              </Animated.View>
            </Animated.View>
          ) : null}

          {/* Foreground (image) shifts up when opening details */}
          <Animated.View style={[StyleSheet.absoluteFillObject, styles.foregroundLayer, imageTranslateStyle]}>
            {hasAvatar ? (
              <Image source={{ uri: user.avatar_url || DEFAULT_AVATAR }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={styles.placeholderWrap}>
                <UserIcon size={164} color="#9CA3AF" />
                <Text style={styles.placeholderText} numberOfLines={2}>
                  למשתמש זה אין תמונות עדיין
                </Text>
              </View>
            )}
            <MatchPercentBadge value={matchPercent} triggerKey={user?.id || null} size={74} style={styles.matchBadge} />
            <View style={[styles.bottomOverlayWrap, strongTextOverlay ? styles.bottomOverlayWrapStrong : null]}>
              <LinearGradient
                colors={bottomOverlayColors as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.bottomOverlayGradient}
                locations={strongTextOverlay ? [0, 0.55, 1] : undefined}
              />
              <View style={styles.bottomOverlayContent}>
                {!!user.full_name ? (
                  <Text style={styles.overlayName} numberOfLines={1}>
                    {user.full_name}
                    {user.age ? `, ${user.age}` : ''}
                  </Text>
                ) : null}
                {!!user.bio ? (
                  <Text style={styles.overlayBio} numberOfLines={2}>
                    {user.bio}
                  </Text>
                ) : null}
              </View>
            </View>

            {enableParallaxDetails ? (
              <SwipeUpIndicator
                isOpened={openProgress.value >= 0.85}
                style={{ position: 'absolute', bottom: 14, alignSelf: 'center' }}
              />
            ) : null}
          </Animated.View>
        </View>
      </GestureDetector>

      {/* Bottom action buttons removed — swipe on card in parent */}
    </View>
  );
}

export default memo(RoommateCardBase);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summary: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  summaryTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  summaryText: {
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
    marginTop: 4,
  },
  imageWrap: {
    width: '100%',
    height: 520,
    backgroundColor: '#FFFFFF',
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  placeholderText: {
    marginTop: 14,
    paddingHorizontal: 18,
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  bottomOverlayWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 128,
  },
  bottomOverlayWrapStrong: {
    height: 170,
  },
  bottomOverlayGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomOverlayContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'flex-end',
  },
  overlayName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  overlayAge: {
    color: '#E5E7EB',
    fontSize: 13,
    marginTop: 2,
    textAlign: 'right',
  },
  overlayBio: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'right',
  },
  matchBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 2,
  },
  detailsPanelWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  detailsPanelInner: {
    marginHorizontal: 10,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 16,
    borderRadius: 24,
    overflow: 'hidden',
    // Elegant shadow
    shadowColor: '#3D2814',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  detailsGrabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(139,90,60,0.25)',
    marginBottom: 12,
  },
  foregroundLayer: {
    zIndex: 2,
  },
  detailsHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  detailsHeaderLeft: {
    alignItems: 'flex-end',
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
    letterSpacing: -0.3,
  },
  detailsSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 2,
  },
  detailsHintPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  detailsHint: {
    fontSize: 11,
    fontWeight: '800',
  },
  loadingWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8 as any,
    justifyContent: 'flex-end',
  },
  detailCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10 as any,
    // Subtle inner shadow effect via border
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
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
  detailsEmptyText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerRow: {
    alignItems: 'flex-end',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 as any,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  city: {
    color: '#C9CDD6',
    fontSize: 13,
  },
  bio: {
    color: '#C7CBD1',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
    marginTop: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  circleBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  passBtn: {
    borderColor: 'rgba(244,63,94,0.6)',
    backgroundColor: 'rgba(244,63,94,0.08)',
  },
  likeBtn: {
    borderColor: 'rgba(34,197,94,0.6)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  aptSection: {
    marginTop: 14,
    gap: 8 as any,
    direction: 'rtl',
    writingDirection: 'rtl',
  },
  aptSectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    alignSelf: 'flex-end',
  },
  aptCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12 as any,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  aptThumbWrap: {
    width: 92,
    height: 92,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1F1F29',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  aptThumbImg: {
    width: '100%',
    height: '100%',
  },
  aptInfo: {
    flex: 1,
    alignItems: 'flex-end',
    direction: 'rtl',
    writingDirection: 'rtl',
  },
  aptTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
  },
  aptMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 as any,
    alignSelf: 'flex-end',
  },
  aptMeta: {
    color: '#C9CDD6',
    fontSize: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aptCta: {
    color: '#5e3f2d',
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.35)',
  },
});