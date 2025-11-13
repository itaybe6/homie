import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

async function ensurePermissions(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const req = await Notifications.requestPermissionsAsync();
  return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

async function getExpoToken(): Promise<string | null> {
  const ok = await ensurePermissions();
  if (!ok) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync();
    return token.data ?? null;
  } catch {
    return null;
  }
}

export function usePushNotifications() {
  const user = useAuthStore((s) => s.user);

  // Register device and upsert token for the signed-in user
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const token = await getExpoToken();
      if (!token || cancelled) return;
      try {
        await supabase.from('users').update({ expo_push_token: token }).eq('id', user.id);
      } catch {
        // ignore token write failures
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Foreground: show a local notification immediately on new DB notifications for this user
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-push:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          const n: any = payload.new;
          const title = n?.title || 'התראה חדשה';
          const body = n?.description || 'יש לך התראה חדשה';
          Notifications.scheduleNotificationAsync({
            content: { title, body, sound: 'default' },
            trigger: null,
          }).catch(() => undefined);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
}





