import { useEffect } from 'react';
import { I18nManager, Platform, View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import * as Notifications from 'expo-notifications';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import GlobalTopBar from '@/components/GlobalTopBar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  useFrameworkReady();
  const { setUser, setLoading } = useAuthStore();
  usePushNotifications();
  const pathname = usePathname();
  const showTopBar = pathname !== '/auth/intro' && pathname !== '/auth/login';

  useEffect(() => {
    let isMounted = true;

    // Show notifications in foreground as alerts with sound/badge
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    } catch {
      // ignore
    }

    // I18nManager-based RTL enforcement removed to avoid native reload issues.

    // Ensure RTL on web (Hebrew)
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      try {
        const root = document.documentElement;
        if (root.getAttribute('dir') !== 'rtl') {
          root.setAttribute('dir', 'rtl');
        }
        if (root.getAttribute('lang') !== 'he') {
          root.setAttribute('lang', 'he');
        }
        document.body.style.direction = 'rtl';
        document.body.style.textAlign = 'right';
      } catch {
        // ignore
      }
    }

    // Ensure auth state is initialized on any route (not only index)
    (async () => {
      try {
        setLoading(true);
        const currentUser = await authService.getCurrentUser();
        if (!isMounted) return;
        if (currentUser) {
          setUser({ id: currentUser.id, email: currentUser.email!, role: (currentUser as any).role });
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    const { data: sub } = (authService as any).onAuthStateChange?.((authUser: any) => {
      setUser(authUser);
      setLoading(false);
    }) || { data: null };

    return () => {
      isMounted = false;
      // supabase listener auto cleans; nothing to do
    };
  }, [setUser, setLoading]);

  return (
    <GestureHandlerRootView style={{ flex: 1, writingDirection: 'rtl' }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="+not-found" />
      </Stack>
      {/* Global transparent top bar: notifications (left), Homie (center), requests (right) */}
      {showTopBar && <GlobalTopBar />}
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}
