import { Tabs, useRouter } from 'expo-router';
import { Home, User, Users } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, Alert } from 'react-native';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { fetchUserSurvey } from '@/lib/survey';

export default function TabLayout() {
  const router = useRouter();
  const { user } = useAuthStore();
  const hasPromptedRef = useRef(false);

  useEffect(() => {
    // reset prompt flag on user change so it can show again on new logins
    hasPromptedRef.current = false;
    const maybePromptSurvey = async () => {
      if (!user) return;
      if (hasPromptedRef.current) return;
      try {
        const survey = await fetchUserSurvey(user.id);
        const hasRow = !!survey;
        const completed = !!survey?.is_completed;
        if (!hasRow || !completed) {
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
        }
      } catch {
        // ignore failures silently
      }
    };
    maybePromptSurvey();
  }, [user]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.7)',
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 20,
          height: 72,
          borderRadius: 24,
          borderTopWidth: 0,
          overflow: 'hidden',
          backgroundColor: 'rgba(28,28,30,0.6)',
          paddingBottom: 6,
          paddingTop: 6,
          ...(Platform.OS === 'ios'
            ? {
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 10 },
              }
            : { elevation: 20 }),
        },
        tabBarBackground: () => (
          <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
        ),
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
          tabBarIcon: ({ size, color }) => <User size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          title: 'דירות',
          tabBarIcon: ({ size, color }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="partners"
        options={{
          title: 'שותפים',
          tabBarIcon: ({ size, color }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="add-apartment" options={{ href: null }} />
      {/* Hide nested detail routes from the tab bar */}
      <Tabs.Screen name="apartment/[id]" options={{ href: null }} />
      <Tabs.Screen name="apartment/edit/[id]" options={{ href: null }} />
      <Tabs.Screen name="user/[id]" options={{ href: null }} />
      <Tabs.Screen name="onboarding/survey" options={{ href: null }} />
    </Tabs>
  );
}
