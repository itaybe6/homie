import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Image,
} from 'react-native';
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { X, MapPin, User as UserIcon, ArrowUpRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { User, UserSurveyResponse } from '@/types/database';
import { fetchUserSurvey } from '@/lib/survey';
import { computeSurveyHighlights } from '@/lib/surveyHighlights';

type Props = {
  visible: boolean;
  user: User | null;
  matchPercent?: number | null;
  onRequestClose: () => void;
  onClosed?: () => void;
  onOpenProfile?: (userId: string) => void;
};

const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';

export default function UserPeekSheet({ visible, user, matchPercent, onRequestClose, onClosed, onOpenProfile }: Props) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  const [mounted, setMounted] = useState(false);
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [activeMatchPercent, setActiveMatchPercent] = useState<number | null>(null);

  const [survey, setSurvey] = useState<UserSurveyResponse | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);

  const sheetHeight = Math.min(620, Math.max(420, Math.round(screenHeight * 0.7)));

  const translateY = useSharedValue(sheetHeight);
  const dragStartY = useSharedValue(0);

  const closeNow = () => {
    onRequestClose();
  };

  // Mount and capture user on open
  useEffect(() => {
    if (visible && user?.id) {
      setMounted(true);
      setActiveUser(user);
      setActiveMatchPercent(typeof matchPercent === 'number' ? matchPercent : null);
    }
  }, [visible, user?.id]);

  // Keep match percent in sync while open
  useEffect(() => {
    if (!visible) return;
    setActiveMatchPercent(typeof matchPercent === 'number' ? matchPercent : null);
  }, [visible, matchPercent]);

  // Load survey when active user changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeUser?.id) {
        setSurvey(null);
        return;
      }
      try {
        setSurveyLoading(true);
        const s = await fetchUserSurvey(activeUser.id);
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
  }, [activeUser?.id]);

  const highlights = useMemo(() => computeSurveyHighlights(survey).slice(0, 8), [survey]);

  // Animate open/close based on `visible` while keeping the Modal mounted.
  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
      return;
    }
    // closing
    translateY.value = withTiming(sheetHeight, { duration: 220 }, (finished) => {
      if (!finished) return;
      runOnJS(setMounted)(false);
      runOnJS(setActiveUser)(null);
      runOnJS(setSurvey)(null);
      runOnJS(onClosed || (() => {}))();
    });
  }, [mounted, visible, sheetHeight]);

  const backdropStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateY.value, [0, sheetHeight], [0.55, 0], Extrapolate.CLAMP);
    return { opacity };
  });

  const sheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const backdropTap = Gesture.Tap().onEnd((_e, success) => {
    if (success) runOnJS(closeNow)();
  });

  const pan = Gesture.Pan()
    .onBegin(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((e) => {
      const next = Math.max(0, Math.min(sheetHeight, dragStartY.value + e.translationY));
      translateY.value = next;
    })
    .onEnd((e) => {
      const shouldClose = translateY.value > sheetHeight * 0.22 || e.velocityY > 900;
      if (shouldClose) {
        runOnJS(closeNow)();
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });

  const openProfile = () => {
    if (!activeUser?.id) return;
    // Close first, then navigate (parent controls visibility)
    onRequestClose();
    onOpenProfile?.(activeUser.id);
  };

  if (!mounted) return null;

  const name = activeUser?.full_name || 'משתמש';
  const age = typeof activeUser?.age === 'number' ? `${activeUser.age}` : '';
  const city = activeUser?.city ? `${activeUser.city}` : '';
  const matchLabel = activeMatchPercent === null ? '--%' : `${activeMatchPercent}%`;

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={closeNow}>
      <View style={styles.root}>
        <GestureDetector gesture={backdropTap}>
          <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropStyle]} />
        </GestureDetector>

        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, { height: sheetHeight, paddingBottom: Math.max(16, insets.bottom + 12) }, sheetStyle]}>
            <View style={styles.grabber} />

            <View style={styles.headerRow}>
              <Pressable onPress={closeNow} hitSlop={10} style={styles.iconBtn} accessibilityRole="button">
                <X size={18} color="#E5E7EB" />
              </Pressable>
              <Text style={styles.headerTitle}>פרטים נוספים</Text>
              <Pressable onPress={openProfile} hitSlop={10} style={[styles.iconBtn, styles.openBtn]} accessibilityRole="button">
                <ArrowUpRight size={18} color="#111827" />
              </Pressable>
            </View>

            <View style={styles.userRow}>
              <View style={styles.avatarWrap}>
                {activeUser?.avatar_url ? (
                  <Image source={{ uri: activeUser.avatar_url || DEFAULT_AVATAR }} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <UserIcon size={26} color="#9CA3AF" />
                  </View>
                )}
              </View>

              <View style={styles.userMeta}>
                <Text style={styles.userName} numberOfLines={1}>
                  {name}
                  {age ? `, ${age}` : ''}
                </Text>
                <View style={styles.cityRow}>
                  <MapPin size={14} color="#A3A3A3" />
                  <Text style={styles.userCity} numberOfLines={1}>
                    {city || '—'}
                  </Text>
                </View>
              </View>

              <View style={styles.matchPill}>
                <LinearGradient
                  colors={['rgba(124,92,255,0.28)', 'rgba(124,92,255,0.14)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject}
                />
                <Text style={styles.matchLabel}>התאמה</Text>
                <Text style={styles.matchValue}>{matchLabel}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>מה חשוב להם</Text>

              {surveyLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#C7CBD1" />
                  <Text style={styles.loadingText}>טוען שאלון…</Text>
                </View>
              ) : highlights.length ? (
                <View style={styles.chipsWrap}>
                  {highlights.map((h) => (
                    <View key={`${h.label}:${h.value}`} style={styles.chip}>
                      <Text style={styles.chipValue} numberOfLines={1}>
                        {h.value}
                      </Text>
                      <Text style={styles.chipLabel} numberOfLines={1}>
                        {h.label}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>אין מידע מהשאלון להצגה כרגע.</Text>
              )}
            </View>

            <Pressable onPress={openProfile} style={styles.primaryCta} accessibilityRole="button">
              <Text style={styles.primaryCtaText}>פתח פרופיל מלא</Text>
            </Pressable>
          </Animated.View>
        </GestureDetector>
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
    backgroundColor: '#000',
  },
  sheet: {
    width: '100%',
    backgroundColor: '#14141C',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 56,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  openBtn: {
    backgroundColor: '#F7CEA0',
    borderColor: 'rgba(247,206,160,0.35)',
  },
  userRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12 as any,
    marginBottom: 18,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1C1C26',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMeta: {
    flex: 1,
    alignItems: 'flex-end',
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  cityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6 as any,
    marginTop: 4,
  },
  userCity: {
    color: '#C7CBD1',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  matchPill: {
    width: 84,
    height: 52,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  matchLabel: {
    color: '#DAD6FF',
    fontSize: 11,
    fontWeight: '900',
  },
  matchValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  section: {
    flex: 1,
  },
  sectionTitle: {
    color: '#E6E9F0',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
    marginBottom: 10,
  },
  loadingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10 as any,
  },
  loadingText: {
    color: '#C7CBD1',
    fontWeight: '800',
  },
  chipsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10 as any,
  },
  chip: {
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#1C1C26',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'flex-end',
  },
  chipLabel: {
    color: '#9DA4AE',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
    textAlign: 'right',
  },
  chipValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  emptyText: {
    color: '#9DA4AE',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  primaryCta: {
    height: 50,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  primaryCtaText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },
});

