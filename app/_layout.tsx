import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';

export default function RootLayout() {
  useFrameworkReady();
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    let isMounted = true;

    // Ensure auth state is initialized on any route (not only index)
    (async () => {
      try {
        setLoading(true);
        const currentUser = await authService.getCurrentUser();
        if (!isMounted) return;
        if (currentUser) {
          setUser({ id: currentUser.id, email: currentUser.email! });
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
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
