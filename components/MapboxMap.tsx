import type { ComponentType } from 'react';
import { Platform } from 'react-native';
import MapboxMapNative from './MapboxMap.native';
import MapboxMapWeb from './MapboxMap.web';
import type { MapboxCenter, MapboxFeatureCollection } from '@/lib/mapboxHtml';

export type MapboxMapProps = {
  accessToken?: string;
  styleUrl?: string;
  center?: MapboxCenter;
  zoom?: number;
  points?: MapboxFeatureCollection;
  /** Color for the point/marker circles (defaults to the current purple). */
  pointColor?: string;
  /** When true, render a slow pulsing ring behind point circles (use for single-location maps). */
  pulsePoints?: boolean;
  /** User's current location (renders as a green dot when provided). */
  userLocation?: MapboxCenter;
  /** Preferred language for basemap labels (e.g. 'he', 'en'). Defaults to 'he'. */
  language?: string;
  /** Apartment id to highlight on the map (used when scrolling the bottom cards). */
  highlightApartmentId?: string | null;
  onApartmentPress?: (apartmentId: string) => void;
};

export default function MapboxMap(props: MapboxMapProps) {
  const Impl = (Platform.OS === 'web' ? MapboxMapWeb : MapboxMapNative) as unknown as ComponentType<MapboxMapProps>;
  return <Impl {...props} language={(props.language || 'he').trim().toLowerCase() || 'he'} />;
}


