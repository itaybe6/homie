import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { buildMapboxHtml, type MapboxCenter, type MapboxFeatureCollection } from '@/lib/mapboxHtml';

export default function MapboxMap(props: {
  accessToken?: string;
  styleUrl?: string;
  center?: MapboxCenter;
  zoom?: number;
  points?: MapboxFeatureCollection;
  pointColor?: string;
  pulsePoints?: boolean;
  userLocation?: MapboxCenter;
  onApartmentPress?: (apartmentId: string) => void;
}) {
  const token = props.accessToken ?? '';

  useEffect(() => {
    if (!props.onApartmentPress) return;
    const handler = (ev: MessageEvent) => {
      try {
        const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        if (data?.type === 'OPEN_APARTMENT' && data?.id) {
          props.onApartmentPress?.(String(data.id));
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
  }, [props.onApartmentPress]);

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
    });
  }, [token, props.styleUrl, props.center, props.zoom, props.points, props.pointColor, props.pulsePoints, props.userLocation]);

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


