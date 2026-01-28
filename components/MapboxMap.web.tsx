import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { user } = useAuthStore();

  const postToMap = useCallback((msg: any) => {
    try {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      win.postMessage(JSON.stringify(msg), '*');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!props.onApartmentPress) return;
    const handler = (ev: MessageEvent) => {
      try {
        const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        if (data?.type === 'OPEN_APARTMENT' && data?.id) {
          props.onApartmentPress?.(String(data.id));
        }
        if (data?.type === 'REQUEST_LIKE_STATUS' && data?.id) {
          const apartmentId = String(data.id);
          if (!user?.id) {
            postToMap({ type: 'LIKE_STATUS', id: apartmentId, isLiked: false });
            return;
          }
          supabase
            .from('users')
            .select('likes')
            .eq('id', user.id)
            .single()
            .then(({ data: userData }) => {
              const likes: string[] = (userData?.likes as any) || [];
              postToMap({ type: 'LIKE_STATUS', id: apartmentId, isLiked: likes.includes(apartmentId) });
            })
            .catch(() => postToMap({ type: 'LIKE_STATUS', id: apartmentId, isLiked: false }));
        }
        if (data?.type === 'TOGGLE_LIKE_APARTMENT' && data?.id) {
          const apartmentId = String(data.id);
          if (!user?.id) return;
          supabase
            .from('users')
            .select('likes')
            .eq('id', user.id)
            .single()
            .then(({ data: userData }) => {
              const currentLikes: string[] = (userData?.likes as any) || [];
              const nextIsLiked = !currentLikes.includes(apartmentId);
              const nextLikes = nextIsLiked
                ? Array.from(new Set([...currentLikes, apartmentId]))
                : currentLikes.filter((id) => id !== apartmentId);
              return supabase
                .from('users')
                .update({ likes: nextLikes, updated_at: new Date().toISOString() })
                .eq('id', user.id)
                .then(() => postToMap({ type: 'LIKE_STATUS', id: apartmentId, isLiked: nextIsLiked }));
            })
            .catch(() => {
              // ignore
            });
        }
        if (data?.type === 'MAP_DEBUG_LABEL_KEYS') {
          // Helpful during development: shows which "name*" properties exist on rendered features.
          // This helps diagnose why labels stay in English for a given Mapbox style/tileset.
          // eslint-disable-next-line no-console
          console.log('[Mapbox] label keys sample', data);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [props.onApartmentPress, postToMap, user?.id]);

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
    // Highlight selected apartment id (if any)
    postToMap({ type: 'HIGHLIGHT_APARTMENT', id: props.highlightApartmentId ?? null });
  }, [props.highlightApartmentId]);

  if (!token) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>חסר EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN</Text>
      </View>
    );
  }

  // RN Web allows rendering DOM elements in .web.tsx files
  return (
    <iframe
      title="Map"
      srcDoc={html}
      ref={iframeRef}
      style={{
        border: 0,
        width: '100%',
        height: '100%',
      }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      referrerPolicy="no-referrer"
    />
  );
}

const styles = StyleSheet.create({
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


