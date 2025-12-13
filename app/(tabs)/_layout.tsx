import { Tabs, useRouter, usePathname } from 'expo-router';
import { Home, User, Users } from 'lucide-react-native';
import { Platform, StyleSheet, Alert, View, Text, Dimensions } from 'react-native';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { fetchUserSurvey } from '@/lib/survey';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

  const { width: screenWidth } = Dimensions.get('window');
  // Numeric pill width + explicit left for perfect centering (no stretch)
  const pillWidth = Math.min(
    Math.max(Math.round(screenWidth * 0.88), 280),
    Math.min(420, screenWidth - 32)
  );
  const pillLeft = Math.round((screenWidth - pillWidth) / 2);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#6B7280',
        // sceneContainerStyle intentionally omitted to satisfy type constraints
        tabBarStyle: { display: 'none' },
        // Compact items; do not stretch
        tabBarItemStyle: ((): any => {
          const itemStyle = {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          };
          // eslint-disable-next-line no-console
          console.log('tabBarItemStyle =>', itemStyle);
          return itemStyle;
        })(),
        // No tabBarBackground — background handled inside tabBarStyle to avoid stretch
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          marginBottom: Platform.OS === 'ios' ? 0 : 2,
        },
      }}>
      <Tabs.Screen
        name="profile"
        options={{
          title: 'פרופיל',
          tabBarIcon: ({ focused, color }) => (
            <TabPill focused={focused} label="פרופיל">
              <User size={20} color={focused ? '#FFFFFF' : color} />
            </TabPill>
          ),
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: 'דירות',
          tabBarIcon: ({ focused, color }) => (
            <TabPill focused={focused} label="דירות">
              <Home size={20} color={focused ? '#FFFFFF' : color} />
            </TabPill>
          ),
        }}
      />
      <Tabs.Screen
        name="partners"
        options={{
          title: 'שותפים',
          tabBarIcon: ({ focused, color }) => (
            <TabPill focused={focused} label="שותפים">
              <Users size={20} color={focused ? '#FFFFFF' : color} />
            </TabPill>
          ),
        }}
      />
      <Tabs.Screen name="add-apartment" options={{ href: null }} />
      {/* Hide nested detail routes from the tab bar */}
      <Tabs.Screen name="apartment/[id]" options={{ href: null }} />
      <Tabs.Screen name="apartment/edit/[id]" options={{ href: null }} />
      <Tabs.Screen name="user/[id]" options={{ href: null }} />
      <Tabs.Screen name="requests" options={{ href: null }} />
      <Tabs.Screen name="onboarding/survey" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

function TabPill({ focused, label, children }: { focused: boolean; label: string; children: React.ReactNode }) {
  return (
    <View
      style={[
        stylesTab.pill,
        focused ? stylesTab.pillActive : stylesTab.pillInactive,
      ]}
    >
      <View style={stylesTab.iconWrap}>{children}</View>
      <Text style={[stylesTab.label, focused ? stylesTab.labelActive : stylesTab.labelInactive]} numberOfLines={1} ellipsizeMode="tail">
        {label}
      </Text>
    </View>
  );
}

const stylesTab = StyleSheet.create({
  pill: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 22,
    gap: 4,
  },
  pillInactive: {
    backgroundColor: 'transparent',
  },
  pillActive: {
    backgroundColor: '#8B5CF6',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
  labelInactive: {
    color: '#6B7280',
  },
  labelActive: {
    color: '#FFFFFF',
  },
});
