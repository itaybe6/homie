import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';

export default function Index() {
  const { user, isLoading, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    checkUser();

    authService.onAuthStateChange((authUser) => {
      setUser(authUser);
      setLoading(false);
    });
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        setUser({
          id: currentUser.id,
          email: currentUser.email!,
          // @ts-expect-error runtime role from profile
          role: (currentUser as any).role,
        });
      }
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4C1D95" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/auth/intro" />;
  }

  // Redirect admins into the admin interface
  if ((user as any)?.role === 'admin') {
    return <Redirect href="/admin" />;
  }
  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
});
