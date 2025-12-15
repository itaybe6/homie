import { Tabs, useRouter, usePathname } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Alert, Pressable, View, Platform } from 'react-native';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { fetchUserSurvey } from '@/lib/survey';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function FloatingCenterTabButton({
  children,
  onPress,
  accessibilityState,
  accessibilityLabel,
  testID,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  accessibilityState?: { selected?: boolean };
  accessibilityLabel?: string;
  testID?: string;
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
  const hasPromptedRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);
  const isCheckingSurveyRef = useRef(false);
  const insets = useSafeAreaInsets();

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
        tabBarActiveTintColor: '#4C1D95',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
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
        } as any,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="home"
        options={{
          tabBarLabel: 'דירות',
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="partners"
        options={{
          tabBarLabel: 'שותפים',
          tabBarIcon: ({ color }) => <Ionicons name="people" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="add-apartment"
        options={{
          tabBarLabel: '',
          tabBarButton: (props) => (
            <FloatingCenterTabButton
              onPress={props.onPress}
              accessibilityLabel={props.accessibilityLabel}
              accessibilityState={props.accessibilityState as any}
              testID={props.testID}>
              <Ionicons
                name="add"
                size={32}
                color={(props.accessibilityState as any)?.selected ? '#FFFFFF' : '#FFFFFF'}
              />
            </FloatingCenterTabButton>
          ),
        }}
      />
      <Tabs.Screen
        name="likes"
        options={{
          tabBarLabel: 'אהבתי',
          tabBarIcon: ({ color }) => <Ionicons name="heart" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarLabel: 'פרופיל',
          tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} />,
        }}
      />
      {/* Hide nested detail routes from the tab bar */}
      <Tabs.Screen name="apartment/[id]" options={{ href: null }} />
      <Tabs.Screen name="apartment/edit/[id]" options={{ href: null }} />
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
    backgroundColor: '#4C1D95',
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
    backgroundColor: '#4C1D95',
  },
  centerButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.95,
  },
});