import { Tabs, useRouter, usePathname } from 'expo-router';
import { StyleSheet, Alert, Pressable, View, Platform } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { fetchUserSurvey } from '@/lib/survey';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Users, Plus, Search, User as UserIcon, Heart } from 'lucide-react-native';
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
  const isSurveyRoute =
    typeof pathname === 'string' && pathname.includes('/onboarding/survey');
  const isAddApartmentTabRoute =
    typeof pathname === 'string' && (pathname === '/(tabs)/add-apartment' || pathname.includes('/add-apartment'));
  const [ownedApartmentId, setOwnedApartmentId] = useState<string | null | undefined>(
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
          Alert.alert(
            'שאלון העדפות',
            'כדי שנמצא לך התאמות טובות, נשמח שתמלא/י את השאלון הקצר.',
            [
              { text: 'לא עכשיו', style: 'cancel' },
              {
                text: 'לשאלון',
                onPress: () => router.push('/(tabs)/onboarding/survey'),
              },
            ],
            { cancelable: true }
          );
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
              isVisuallyDisabled={!isOwner && !!user?.id && ownedApartmentId !== null && ownedApartmentId !== undefined}
              onPress={async (e) => {
                // Each user can upload max 1 apartment (by owner_id)
                if (user?.id && !isOwner) {
                  // Always re-check on press to avoid stale state after deletions.
                  if (isCheckingOwnedApartmentRef.current) return;
                  isCheckingOwnedApartmentRef.current = true;
                  try {
                    const firstId = await fetchOwnedApartmentId(user.id);
                    setOwnedApartmentId(firstId);
                    if (firstId) {
                      Alert.alert(
                        'לא ניתן להוסיף דירה',
                        'אי אפשר להעלות עוד דירה כי כבר העלית דירה אחת.'
                      );
                      return;
                    }
                    router.push('/add-apartment' as any);
                    return;
                  } catch {
                    Alert.alert('שגיאה', 'לא הצלחנו לבדוק אם כבר העלית דירה. נסה שוב.');
                    return;
                  } finally {
                    isCheckingOwnedApartmentRef.current = false;
                  }
                }
                router.push('/add-apartment' as any);
              }}
              accessibilityLabel={props.accessibilityLabel}
              accessibilityState={props.accessibilityState as any}
              testID={props.testID}>
              <Plus
                size={32}
                color={!isOwner && !!user?.id && ownedApartmentId !== null && ownedApartmentId !== undefined ? '#E5E7EB' : '#FFFFFF'}
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
  );
}

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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
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
    borderColor: 'rgba(255,255,255,0.12)',
  },
  centerButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
  },
});