import { useEffect } from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import * as Notifications from 'expo-notifications';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import GlobalTopBar from '@/components/GlobalTopBar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AppAlertProvider } from '@/components/AppAlertProvider';

export default function RootLayout() {
  useFrameworkReady();
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const user = useAuthStore((s) => s.user);
  usePushNotifications();
  const supabaseOk = isSupabaseConfigured();
  const pathname = usePathname();
  const isMapRoute =
    typeof pathname === 'string' && (pathname === '/map' || pathname === '/(tabs)/map' || pathname.endsWith('/map'));
  const isApartmentsHomeRoute =
    typeof pathname === 'string' &&
    (pathname === '/(tabs)/home' || pathname === '/home' || pathname.endsWith('/home'));
  const isSurveyRoute =
    typeof pathname === 'string' && pathname.includes('/onboarding/survey');
  const isStandaloneAddApartmentRoute =
    typeof pathname === 'string' && (pathname === '/add-apartment' || pathname.endsWith('/add-apartment'));
  const hideGlobalTopBar =
    typeof pathname === 'string' &&
    (pathname.includes('/apartment/') || isMapRoute || isSurveyRoute || isStandaloneAddApartmentRoute);
  const isAuthRoute = typeof pathname === 'string' && pathname.startsWith('/auth');
  const isAdminRoute = typeof pathname === 'string' && pathname.startsWith('/admin');
  const shouldShowGlobalTopBar = !!user && !hideGlobalTopBar && !isAuthRoute && !isAdminRoute;
  const isAddApartmentRoute =
    typeof pathname === 'string' &&
    (pathname === '/(tabs)/add-apartment' || pathname === '/add-apartment' || pathname.endsWith('/add-apartment'));
  const isRequestsRoute =
    typeof pathname === 'string' &&
    (pathname === '/requests' ||
      pathname === '/(tabs)/requests' ||
      pathname.endsWith('/requests'));
  const isNotificationsRoute =
    typeof pathname === 'string' &&
    (pathname === '/notifications' ||
      pathname === '/(tabs)/notifications' ||
      pathname.endsWith('/notifications'));
  // Match the screen background per-route so the Safe Area + global header blend in cleanly.
  const globalTopBarBg =
    isAddApartmentRoute || isRequestsRoute || isNotificationsRoute ? '#FAFAFA' : '#FFFFFF';

  if (!supabaseOk) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.envWrap}>
          <Text style={styles.envTitle}>חסרה הגדרת Supabase לפרודקשן</Text>
          <Text style={styles.envBody}>
            כדי שהאפליקציה תרוץ ב‑TestFlight צריך להגדיר ב‑EAS:
            {'\n'}EXPO_PUBLIC_SUPABASE_URL
            {'\n'}EXPO_PUBLIC_SUPABASE_ANON_KEY
          </Text>
          <Text style={styles.envHint}>
            אחרי שמגדירים, צריך לבנות מחדש (EAS build) ולהעלות גרסה חדשה ל‑TestFlight.
          </Text>
        </View>
      </GestureHandlerRootView>
    );
  }


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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppAlertProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="+not-found" />
        </Stack>
        {/* Global white top bar: notifications (left), Homie (center), requests (right) */}
        {shouldShowGlobalTopBar && <GlobalTopBar backgroundColor={globalTopBarBg} />}
        <StatusBar style="auto" />
      </AppAlertProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  envWrap: {
    flex: 1,
    backgroundColor: '#0B1220',
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  envTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'right',
    marginBottom: 12,
  },
  envBody: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    lineHeight: 22,
    marginBottom: 10,
  },
  envHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    lineHeight: 18,
  },
});
