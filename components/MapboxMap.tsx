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
  onApartmentPress?: (apartmentId: string) => void;
};

export default function MapboxMap(props: MapboxMapProps) {
  const Impl = (Platform.OS === 'web' ? MapboxMapWeb : MapboxMapNative) as unknown as ComponentType<MapboxMapProps>;
  return <Impl {...props} />;
}


