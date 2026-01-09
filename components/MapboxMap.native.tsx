import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildMapboxHtml, type MapboxCenter, type MapboxFeatureCollection } from '@/lib/mapboxHtml';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export default function MapboxMap(props: {
  accessToken?: string;
  styleUrl?: string;
  center?: MapboxCenter;
  zoom?: number;
  points?: MapboxFeatureCollection;
  pointColor?: string;
  pulsePoints?: boolean;
  userLocation?: MapboxCenter;
  language?: string;
  highlightApartmentId?: string | null;
  onApartmentPress?: (apartmentId: string) => void;
}) {
  const token = props.accessToken ?? '';
  const webViewRef = useRef<WebView>(null);
  const { user } = useAuthStore();

  const postToMap = useCallback((msg: any) => {
    try {
      webViewRef.current?.postMessage(JSON.stringify(msg));
    } catch {
      // ignore
    }
  }, []);

  const html = useMemo(() => {
    return buildMapboxHtml({
      accessToken: token,
      styleUrl: props.styleUrl,
      center: props.center,
      zoom: props.zoom,
      points: props.points,
      pointColor: props.pointColor,
      pulsePoints: props.pulsePoints,
      userLocation: props.userLocation,
      language: props.language,
    });
  }, [token, props.styleUrl, props.center, props.zoom, props.points, props.pointColor, props.pulsePoints, props.userLocation, props.language]);

  useEffect(() => {
    // Tell the map which apartment to highlight (if any)
    postToMap({ type: 'HIGHLIGHT_APARTMENT', id: props.highlightApartmentId ?? null });
  }, [props.highlightApartmentId]);

  if (!token) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>חסר EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN</Text>
      </View>
    );
  }

  return (
    <WebView
      ref={webViewRef}
      originWhitelist={['*']}
      source={{ html }}
      style={styles.webview}
      javaScriptEnabled
      domStorageEnabled
      onMessage={(e) => {
        try {
          const raw = e?.nativeEvent?.data;
          if (!raw) return;
          const msg = JSON.parse(String(raw));
          if (msg?.type === 'OPEN_APARTMENT' && msg?.id) {
            props.onApartmentPress?.(String(msg.id));
          }
          if (msg?.type === 'REQUEST_LIKE_STATUS' && msg?.id) {
            const apartmentId = String(msg.id);
            if (!user?.id) {
              postToMap({ type: 'LIKE_STATUS', id: apartmentId, isLiked: false });
              return;
            }
            supabase
              .from('users')
              .select('likes')
              .eq('id', user.id)
              .single()
              .then(({ data }) => {
                const likes: string[] = (data?.likes as any) || [];
                postToMap({ type: 'LIKE_STATUS', id: apartmentId, isLiked: likes.includes(apartmentId) });
              })
              .catch(() => postToMap({ type: 'LIKE_STATUS', id: apartmentId, isLiked: false }));
          }
          if (msg?.type === 'TOGGLE_LIKE_APARTMENT' && msg?.id) {
            const apartmentId = String(msg.id);
            if (!user?.id) return;
            supabase
              .from('users')
              .select('likes')
              .eq('id', user.id)
              .single()
              .then(({ data }) => {
                const currentLikes: string[] = (data?.likes as any) || [];
                const nextIsLiked = !currentLikes.includes(apartmentId);
                const nextLikes = nextIsLiked
                  ? Array.from(new Set([...currentLikes, apartmentId]))
                  : currentLikes.filter((id) => id !== apartmentId);
                return supabase
                  .from('users')
                  .update({ likes: nextLikes, updated_at: new Date().toISOString() })
                  .eq('id', user.id)
                  .then(() => {
                    postToMap({ type: 'LIKE_STATUS', id: apartmentId, isLiked: nextIsLiked });
                  });
              })
              .catch(() => {
                // ignore
              });
          }
          if (msg?.type === 'MAP_DEBUG_LABEL_KEYS') {
            // eslint-disable-next-line no-console
            console.log('[Mapbox] label debug', msg);
          }
        } catch {
          // ignore
        }
      }}
      // Keep it simple: we’re only rendering a map
      allowsInlineMediaPlayback
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#FEE2E2',
  },
  fallbackText: {
    color: '#991B1B',
    fontWeight: '800',
    textAlign: 'center',
  },
});


