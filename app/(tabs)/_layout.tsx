import { Tabs, useRouter, usePathname } from 'expo-router';
import { StyleSheet, Alert, Pressable, View, Platform, Modal, Text, TouchableOpacity } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { fetchUserSurvey } from '@/lib/survey';
import { colors } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Users, Plus, Search, User as UserIcon, Heart, ClipboardList, HelpCircle, X } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';

function FloatingCenterTabButton({
  children,
  onPress,
  accessibilityState,
  accessibilityLabel,
  testID,
  isVisuallyDisabled,
}: {
  children: React.ReactNode;
  onPress?: React.ComponentProps<typeof Pressable>['onPress'];
  accessibilityState?: { selected?: boolean };
  accessibilityLabel?: string;
  testID?: string;
  isVisuallyDisabled?: boolean;
}) {
  const selected = !!accessibilityState?.selected;
  return (
    <View style={styles.centerButtonWrap} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        style={({ pressed }) => [
          styles.centerButton,
          selected && styles.centerButtonSelected,
          isVisuallyDisabled && styles.centerButtonDisabled,
          pressed && styles.centerButtonPressed,
        ]}>
        {children}
      </Pressable>
    </View>
  );
}

function SurveyPromptModal({
  visible,
  onDismiss,
  onGoToSurvey,
}: {
  visible: boolean;
  onDismiss: () => void;
  onGoToSurvey: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}>
      <View style={surveyModalStyles.overlay}>
        <View style={surveyModalStyles.card}>
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="סגור"
            hitSlop={12}
            style={({ pressed }) => [
              surveyModalStyles.closeButton,
              pressed && surveyModalStyles.closeButtonPressed,
            ]}>
            <X size={18} color="#6B7280" />
          </Pressable>

          {/* Icon badge */}
          <View style={surveyModalStyles.iconWrap}>
            <View style={surveyModalStyles.iconCircle}>
              <HelpCircle size={28} color="#FFFFFF" />
            </View>
          </View>

          {/* Title */}
          <Text style={surveyModalStyles.title}>שאלון העדפות</Text>

          {/* Description */}
          <Text style={surveyModalStyles.description}>
            כדי שנמצא לך התאמות טובות,{'\n'}נשמח שתמלא/י את השאלון הקצר.
          </Text>

          {/* Divider */}
          <View style={surveyModalStyles.divider} />

          {/* Buttons */}
          <TouchableOpacity
            style={surveyModalStyles.primaryButton}
            onPress={onGoToSurvey}
            activeOpacity={0.85}>
            <ClipboardList size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            <Text style={surveyModalStyles.primaryButtonText}>לשאלון</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const isOwner = (user as any)?.role === 'owner';
  const hasPromptedRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);
  const isCheckingSurveyRef = useRef(false);
  const isCheckingOwnedApartmentRef = useRef(false);
  const insets = useSafeAreaInsets();
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const isSurveyRoute =
    typeof pathname === 'string' && pathname.includes('/onboarding/survey');
  const isAddApartmentTabRoute =
    typeof pathname === 'string' && (pathname === '/(tabs)/add-apartment' || pathname.includes('/add-apartment'));
  const [ownedApartmentId, setOwnedApartmentId] = useState<string | null | undefined>(
    user?.id ? undefined : null
  );
  const [partnerApartmentId, setPartnerApartmentId] = useState<string | null | undefined>(
    user?.id ? undefined : null
  );

  const fetchOwnedApartmentId = async (userId: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from('apartments')
      .select('id')
      .eq('owner_id', userId)
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? (data[0] as any).id : null;
  };

  const fetchPartnerApartmentId = async (userId: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from('apartments')
      .select('id')
      .contains('partner_ids', [userId] as any)
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? (data[0] as any).id : null;
  };

  useEffect(() => {
    let cancelled = false;
    const checkOwnedApartment = async () => {
      if (!user?.id) {
        setOwnedApartmentId(null);
        return;
      }
      // Owners are not limited in apartment uploads, so we don't need this check.
      if ((user as any)?.role === 'owner') {
        setOwnedApartmentId(null);
        return;
      }
      // unknown while checking
      setOwnedApartmentId(undefined);
      try {
        const firstId = await fetchOwnedApartmentId(user.id);
        if (cancelled) return;
        setOwnedApartmentId(firstId);
      } catch {
        if (cancelled) return;
        // If we can't verify, keep unknown so we don't accidentally allow extra apartments
        setOwnedApartmentId(undefined);
      }
    };

    checkOwnedApartment();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    const checkPartnerApartment = async () => {
      if (!user?.id) {
        setPartnerApartmentId(null);
        return;
      }
      // unknown while checking
      setPartnerApartmentId(undefined);
      try {
        const firstId = await fetchPartnerApartmentId(user.id);
        if (cancelled) return;
        setPartnerApartmentId(firstId);
      } catch {
        if (cancelled) return;
        // If we can't verify, keep unknown so we don't accidentally allow an upload
        setPartnerApartmentId(undefined);
      }
    };

    checkPartnerApartment();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    // Admins should not see the regular tabs – redirect them into admin
    if ((user as any)?.role === 'admin') {
      router.replace('/admin' as any);
      prevUserIdRef.current = user?.id ?? null;
      hasPromptedRef.current = false;
      isCheckingSurveyRef.current = false;
      return;
    }

    if (!user) {
      prevUserIdRef.current = null;
      hasPromptedRef.current = false;
      isCheckingSurveyRef.current = false;
      return;
    }

    // Only regular users should be prompted for the preferences survey.
    // This avoids a race where role is temporarily undefined for owners and the prompt shows incorrectly.
    if ((user as any)?.role !== 'user') {
      hasPromptedRef.current = true;
      isCheckingSurveyRef.current = false;
      return;
    }

    if (prevUserIdRef.current !== user.id) {
      prevUserIdRef.current = user.id;
      hasPromptedRef.current = false;
      isCheckingSurveyRef.current = false;
    }

    if (hasPromptedRef.current || isCheckingSurveyRef.current) return;

    const maybePromptSurvey = async () => {
      isCheckingSurveyRef.current = true;
      try {
        const survey = await fetchUserSurvey(user.id);
        const hasRow = !!survey;
        const completed = !!survey?.is_completed;
        // Do not prompt if currently on the survey screen
        const isOnSurveyScreen =
          typeof pathname === 'string' && pathname.includes('/onboarding/survey');
        if ((!hasRow || !completed) && !isOnSurveyScreen) {
          hasPromptedRef.current = true;
          setShowSurveyModal(true);
        } else {
          hasPromptedRef.current = true;
        }
      } catch {
        // ignore failures silently
      } finally {
        isCheckingSurveyRef.current = false;
      }
    };
    maybePromptSurvey();
  }, [user, pathname]);

  return (
    <>
      <SurveyPromptModal
        visible={showSurveyModal}
        onDismiss={() => setShowSurveyModal(false)}
        onGoToSurvey={() => {
          setShowSurveyModal(false);
          router.push('/(tabs)/onboarding/survey');
        }}
      />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#5e3f2d',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: isSurveyRoute || isAddApartmentTabRoute
          ? ({ display: 'none' } as any)
          : ({
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
          borderTopWidth: StyleSheet.hairlineWidth,
          height: Math.max(56, 56 + insets.bottom),
          paddingBottom: Math.max(6, insets.bottom),
          paddingTop: 6,
          overflow: 'visible',
          // subtle top shadow to separate from content
          shadowColor: '#000000',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -2 },
          elevation: 10,
        } as any),
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="partners"
        options={
          isOwner
            ? // Owners: replace this spot with "Likes" tab instead of partners
              { href: null }
            : {
                tabBarLabel: 'שותפים',
                tabBarIcon: ({ color }) => <Users size={24} color={color} />,
              }
        }
      />
      <Tabs.Screen
        name="home"
        options={{
          tabBarLabel: 'דירות',
          tabBarIcon: ({ color }) => <Home size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="likes"
        options={
          isOwner
            ? {
                tabBarLabel: 'אהבתי',
                tabBarIcon: ({ color }) => <Heart size={24} color={color} />,
              }
            : { href: null }
        }
      />
      <Tabs.Screen
        name="add-apartment"
        options={{
          tabBarLabel: '',
          tabBarButton: (props) => (
            <FloatingCenterTabButton
              isVisuallyDisabled={
                (!!user?.id &&
                  partnerApartmentId !== null &&
                  partnerApartmentId !== undefined) ||
                (!isOwner && !!user?.id && ownedApartmentId !== null && ownedApartmentId !== undefined)
              }
              onPress={async (e) => {
                if (!user?.id) {
                  router.push('/add-apartment' as any);
                  return;
                }

                // Always re-check on press to avoid stale state (e.g. after leaving an apartment).
                if (isCheckingOwnedApartmentRef.current) return;
                isCheckingOwnedApartmentRef.current = true;
                try {
                  const [partnerId, ownedId] = await Promise.all([
                    fetchPartnerApartmentId(user.id),
                    !isOwner ? fetchOwnedApartmentId(user.id) : Promise.resolve(null),
                  ]);
                  setPartnerApartmentId(partnerId);
                  setOwnedApartmentId(ownedId);

                  if (partnerId) {
                    Alert.alert(
                      'לא ניתן להוסיף דירה',
                      'אי אפשר להעלות דירה כשאת/ה משויך/ת כשותף בדירה קיימת. כדי להעלות דירה חדשה, צא/י מהדירה הקיימת.'
                    );
                    return;
                  }

                  if (!isOwner && ownedId) {
                    Alert.alert(
                      'לא ניתן להוסיף דירה',
                      'אי אפשר להעלות עוד דירה כי כבר העלית דירה אחת.'
                    );
                    return;
                  }

                  router.push('/add-apartment' as any);
                  return;
                } catch {
                  Alert.alert('שגיאה', 'לא הצלחנו לבדוק אם מותר לך להעלות דירה כרגע. נסה שוב.');
                  return;
                } finally {
                  isCheckingOwnedApartmentRef.current = false;
                }
              }}
              accessibilityLabel={props.accessibilityLabel}
              accessibilityState={props.accessibilityState as any}
              testID={props.testID}>
              <Plus
                size={32}
                color={
                  ((!!user?.id &&
                    partnerApartmentId !== null &&
                    partnerApartmentId !== undefined) ||
                    (!isOwner && !!user?.id && ownedApartmentId !== null && ownedApartmentId !== undefined))
                    ? '#E5E7EB'
                    : '#FFFFFF'
                }
              />
            </FloatingCenterTabButton>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarLabel: 'חיפוש',
          tabBarIcon: ({ color }) => <Search size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarLabel: 'פרופיל',
          tabBarIcon: ({ color }) => <UserIcon size={24} color={color} />,
        }}
      />
      {/* Map screen: keep tab bar visible but hide from tab items */}
      <Tabs.Screen name="map" options={{ href: null }} />
      {/* Likes screen is conditionally shown above (owners) */}
      {/* Hide nested detail routes from the tab bar */}
      <Tabs.Screen name="user/[id]" options={{ href: null }} />
      <Tabs.Screen name="group-requests" options={{ href: null }} />
      <Tabs.Screen name="requests" options={{ href: null }} />
      <Tabs.Screen name="match-requests" options={{ href: null }} />
      <Tabs.Screen name="profile/settings" options={{ href: null }} />
      <Tabs.Screen name="onboarding/survey" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
    </>
  );
}

const surveyModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  closeButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  iconWrap: {
    marginTop: -30,
    marginBottom: 16,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.success,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
    writingDirection: 'rtl',
  },
  description: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    writingDirection: 'rtl',
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    width: '100%',
    marginVertical: 20,
  },
  primaryButton: {
    flexDirection: 'row-reverse',
    backgroundColor: colors.success,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.success,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
});

// Removed custom TabPill. Using standard bottom tab bar with icons and labels.

const styles = StyleSheet.create({
  centerButtonWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5e3f2d',
    marginTop: -28, // lifts it above the tab bar
    borderWidth: 5,
    borderColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOpacity: 0.28,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 14 },
      },
      android: {
        elevation: 18,
      },
      default: {},
    }),
  },
  centerButtonSelected: {
    backgroundColor: '#5e3f2d',
  },
  centerButtonDisabled: {
    backgroundColor: '#9CA3AF',
    borderColor: 'rgba(255,255,255,0.85)',
  },
  centerButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
  },
});