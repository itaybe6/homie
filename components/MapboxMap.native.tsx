import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
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

  return (
    <WebView
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
          if (msg?.type === 'MAP_DEBUG_LABEL_LAYER_COUNT') {
            // eslint-disable-next-line no-console
            console.log('[Mapbox] label layer count', msg?.count);
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


