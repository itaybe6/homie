import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { buildMapboxHtml, type MapboxCenter, type MapboxFeatureCollection } from '@/lib/mapboxHtml';

export default function MapboxMap(props: {
  accessToken?: string;
  styleUrl?: string;
  center?: MapboxCenter;
  zoom?: number;
  points?: MapboxFeatureCollection;
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
    });
  }, [token, props.styleUrl, props.center, props.zoom, props.points]);

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


