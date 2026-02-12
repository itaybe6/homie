import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { supabase } from '@/lib/supabase';
import { BedDouble, ShowerHead, Users } from 'lucide-react-native';
import { Apartment } from '@/types/database';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { formatTimeAgoHe } from '@/utils/time';
import { alpha, colors } from '@/lib/theme';

interface ApartmentCardProps {
  apartment: Apartment;
  onPress: () => void;
  variant?: 'default' | 'home';
}

export default function ApartmentCard({
  apartment,
  onPress,
  variant = 'default',
}: ApartmentCardProps) {
  const PLACEHOLDER =
    'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';

  const isHome = variant === 'home';

  const normalizeImageUrls = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return (value as unknown[])
        .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
            .filter(Boolean);
        }
      } catch {
        try {
          return value
            .replace(/^\s*\{|\}\s*$/g, '')
            .split(',')
            .map((s) => s.replace(/^"+|"+$/g, '').trim())
            .filter(Boolean);
        } catch {
          return [];
        }
      }
    }
    return [];
  };

  const transformSupabaseImageUrl = (value: string): string => {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.includes('/storage/v1/object/public/')) {
      const [base, query] = trimmed.split('?');
      const transformed = base.replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/'
      );
      const params: string[] = [];
      if (query) params.push(query);
      params.push('width=800', 'quality=85', 'format=webp');
      return `${transformed}?${params.join('&')}`;
    }
    return trimmed;
  };

  const normalizePartnerIds = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return (value as unknown[])
        .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
            .filter(Boolean);
        }
      } catch {
        return value
          .replace(/^\s*\{|\}\s*$/g, '')
          .split(',')
          .map((s) => s.replace(/^"+|"+$/g, '').trim())
          .filter(Boolean);
      }
    }
    return [];
  };

  const imageCandidates = useMemo(() => {
    const raw = normalizeImageUrls((apartment as any).image_urls);

    // Deduplicate while keeping original order.
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const url of raw) {
      const trimmed = (url || '').trim();
      if (!trimmed) continue;
      if (seen.has(trimmed)) continue;
      seen.add(trimmed);
      ordered.push(trimmed);
    }

    // Only fallback to placeholder when there are no images at all.
    return ordered.length ? ordered : [PLACEHOLDER];
  }, [apartment]);

  const [imageIdx, setImageIdx] = useState(0);
  const [failedUris, setFailedUris] = useState<Record<string, true>>({});
  const [imageUriOverrides, setImageUriOverrides] = useState<Record<string, string>>({});
  const candidateKey = imageCandidates.join('|');

  useEffect(() => {
    setImageIdx(0);
    setFailedUris({});
    setImageUriOverrides({});
  }, [candidateKey]);

  // Prefer showing ALL images (in order) on the home card.
  const previewImages = useMemo(() => imageCandidates, [imageCandidates]);

  // Try to augment images from Supabase Storage folder only when DB has < 2 images.
  // This keeps the home list lighter while still helping older records.
  const [storageImages, setStorageImages] = useState<string[] | null>(null);
  const attemptedStorageRef = useRef(false);
  useEffect(() => {
    if (attemptedStorageRef.current) return;
    if (previewImages.filter((u) => u !== PLACEHOLDER).length >= 2) return;
    attemptedStorageRef.current = true;
    const tryLoad = async () => {
      try {
        const candidates: string[] = [];
        const folders = new Set<string>();
        // Prefer folder named by apartment id
        const aptId = String((apartment as any)?.id || '').trim();
        if (aptId) folders.add(aptId);
        // Try derive folder from any existing URL
        for (const url of imageCandidates) {
          const m = url.match(/\/apartment-images\/apartments\/([^/]+)\//);
          if (m && m[1]) folders.add(m[1]);
        }
        for (const folder of folders) {
          const { data, error } = await supabase.storage
            .from('apartment-images')
            .list(`apartments/${folder}`, { limit: 50 });
          if (error || !data || data.length === 0) continue;
          for (const f of data) {
            const path = `apartments/${folder}/${f.name}`;
            const { data: pub } = supabase.storage.from('apartment-images').getPublicUrl(path);
            if (pub?.publicUrl) {
              // Store the original public URL; we will try a "render" URL at display time (with fallback).
              candidates.push(pub.publicUrl);
            }
          }
          if (candidates.length) break;
        }
        if (candidates.length) {
          // Merge and dedupe
          const merged = Array.from(new Set([...previewImages, ...candidates]));
          // Avoid unbounded carousels on the home list.
          setStorageImages(merged.slice(0, 10));
        }
      } catch {}
    };
    tryLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewImages.join('|')]);

  const carouselImages = useMemo(() => {
    const base = storageImages && storageImages.length > 0 ? storageImages : previewImages;
    // Filter out items we fully failed to load (after trying fallback).
    const filtered = base.filter((original) => {
      const key = (original || '').trim();
      if (!key) return false;
      return !failedUris[key];
    });
    const resolved = filtered.length ? filtered : [PLACEHOLDER];
    // Home list should only show up to 5 images; full gallery is available in the apartment page.
    return isHome ? resolved.slice(0, 5) : resolved;
  }, [storageImages, previewImages, failedUris, isHome]);

  useEffect(() => {
    // Keep index valid if we filtered images after failures
    setImageIdx((prev) => Math.max(0, Math.min(prev, carouselImages.length - 1)));
  }, [carouselImages.length]);

  const [carouselWidth, setCarouselWidth] = useState<number>(0);

  const partnerIds = useMemo(
    () => normalizePartnerIds((apartment as any).partner_ids),
    [apartment]
  );
  // Prefer roommate_capacity (value set in upload/edit apartment),
  // fallback to max_roommates if it exists in some environments.
  const maxRoommates: number | null =
    typeof (apartment as any)?.roommate_capacity === 'number'
      ? ((apartment as any).roommate_capacity as number)
      : typeof (apartment as any)?.max_roommates === 'number'
        ? ((apartment as any).max_roommates as number)
        : null;

  const partnerSlotsUsed = partnerIds.length;
  const availableRoommateSlots =
    maxRoommates !== null ? Math.max(0, maxRoommates - partnerSlotsUsed) : null;

  const roommatesCapacityLabel =
    maxRoommates !== null ? `${maxRoommates} שותפים` : `${partnerSlotsUsed} שותפים`;

  const neighborhood = String((apartment as any)?.neighborhood || '').trim();
  const address = String((apartment as any)?.address || (apartment as any)?.street_address || '').trim();
  const city = String((apartment as any)?.city || '').trim();

  const locationLabel = useMemo(() => {
    const primary = (address || neighborhood || '').trim();
    if (!primary && !city) return '';
    if (primary && !city) return primary;
    if (!primary && city) return city;

    const addrLower = primary.toLowerCase();
    const cityLower = city.toLowerCase();
    // If primary already contains the city name, don't duplicate.
    if (addrLower.includes(cityLower)) return primary;

    return `${city} · ${primary}`;
  }, [address, neighborhood, city]);

  const priceLabel = useMemo(() => {
    const n = apartment.price;
    const formatted = typeof n === 'number' ? n.toLocaleString?.() ?? String(n) : String(n ?? '');
    // Home design in the screenshot shows ₪ before the number.
    return isHome ? `₪${formatted}` : `${formatted}₪`;
  }, [apartment.price, isHome]);

  const timeAgoLabel = useMemo(() => {
    const createdAt = (apartment as any)?.created_at;
    return createdAt ? formatTimeAgoHe(createdAt) : '';
  }, [apartment]);

  return (
    <View style={[styles.cardOuter, isHome ? styles.cardOuterHome : null]}>
      <View style={[styles.cardInner, isHome ? styles.cardInnerHome : null]}>
        <View style={[styles.imageWrap, isHome ? styles.imageWrapHome : null]}>
          <View style={[styles.imageInner, isHome ? styles.imageInnerHome : null]}>
            <View
              style={{ width: '100%' }}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (typeof w === 'number' && w > 0) setCarouselWidth(w);
              }}
            >
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                style={{ width: '100%' }}
                nestedScrollEnabled
                scrollEnabled={carouselImages.length > 1}
                onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                  const idx = Math.round(
                    e.nativeEvent.contentOffset.x / e.nativeEvent.layoutMeasurement.width
                  );
                  setImageIdx(Math.max(0, Math.min(idx, carouselImages.length - 1)));
                }}
                scrollEventThrottle={16}
              >
                {carouselImages.map((original, idx) => {
                  const displayUri =
                    imageUriOverrides[original] ?? transformSupabaseImageUrl(original) ?? original;

                  return (
                    <View
                      key={`${original}-${idx}`}
                      style={carouselWidth ? { width: carouselWidth } : { width: '100%' }}
                    >
                      <TouchableOpacity
                        activeOpacity={0.98}
                        delayPressIn={150}
                        onPress={onPress}
                      >
                        <Image
                          source={{ uri: displayUri }}
                          style={[styles.image, isHome ? styles.imageHome : null]}
                          resizeMode="cover"
                          onError={() => {
                            // If we tried a transformed (render) URL and it failed, fall back to the original URL.
                            if (displayUri !== original) {
                              setImageUriOverrides((prev) => {
                                if (prev[original] === original) return prev;
                                return { ...prev, [original]: original };
                              });
                              return;
                            }

                            // If original also failed, mark as failed and remove it from carousel list.
                            setFailedUris((prev) => {
                              if (prev[original]) return prev;
                              return { ...prev, [original]: true };
                            });
                          }}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
            {/* Bottom text overlay (like apartment hero) */}
            <View style={styles.imageTextOverlay} pointerEvents="none">
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.imageTextOverlayGradient}
              />
              <View style={styles.imageTextOverlayContent}>
                <View style={styles.imageOverlayRow}>
                  <View style={styles.imageOverlayRight}>
                    <Text style={styles.imageTitle} numberOfLines={1}>
                      {apartment.title}
                    </Text>
                    <Text style={styles.imageSubtitle} numberOfLines={1}>
                      {locationLabel || city}
                    </Text>
                  </View>

                  {timeAgoLabel ? (
                    <Text style={styles.imageTimeAgoBottomLeft} numberOfLines={1}>
                      {timeAgoLabel}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Price (replaces the heart button position) */}
            <View
              style={[
                styles.priceBadge,
                styles.priceBadgeTopLeft,
                isHome ? styles.priceBadgeTopLeftHome : null,
              ]}
              pointerEvents="none"
            >
              <Text style={[styles.priceBadgeText, styles.priceBadgeTextTopLeft]}>
                {priceLabel}
              </Text>
            </View>
            {/* Roommates badge */}
            {!isHome ? (
              <View style={styles.roommatesBadge} pointerEvents="none">
                <View style={styles.badgeIconCircle}>
                  <Users size={16} color={colors.primary} strokeWidth={2.5} />
                </View>
                <Text style={styles.roommatesBadgeText}>
                  {typeof maxRoommates === 'number' ? `${partnerSlotsUsed}/${maxRoommates}` : `${partnerSlotsUsed}`}
                </Text>
              </View>
            ) : null}
            {isHome ? (
              <View style={styles.roommatesBadgeHome} pointerEvents="none">
                <View style={styles.badgeIconCircleHome}>
                  <Users size={14} color={colors.primary} strokeWidth={2.5} />
                </View>
                <Text style={styles.roommatesBadgeHomeText}>
                  {typeof maxRoommates === 'number' ? `${partnerSlotsUsed}/${maxRoommates}` : `${partnerSlotsUsed}`}
                </Text>
              </View>
            ) : null}
            {/* Carousel dots */}
          </View>
        </View>
        <TouchableOpacity
          style={[styles.content, isHome ? styles.contentHome : null]}
          onPress={onPress}
          activeOpacity={0.9}
          delayPressIn={150}
        >
          {isHome ? (
            <View style={styles.homeContentWrap}>
              <View style={styles.metaRowHome}>
                <View style={styles.metaItemHome}>
                  <View style={[styles.iconCircle, styles.iconCircleCompact]}>
                    <Users size={16} color={colors.primary} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.metaTextHome} numberOfLines={1}>
                    {roommatesCapacityLabel}
                  </Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaItemHome}>
                  <View style={[styles.iconCircle, styles.iconCircleCompact]}>
                    <BedDouble size={16} color={colors.primary} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.metaTextHome} numberOfLines={1}>
                    {apartment.bedrooms ?? ''} חדרי שינה
                  </Text>
                </View>
                <View style={styles.metaDivider} />
                <View style={styles.metaItemHome}>
                  <View style={[styles.iconCircle, styles.iconCircleCompact]}>
                    <ShowerHead size={16} color={colors.primary} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.metaTextHome} numberOfLines={1}>
                    {apartment.bathrooms ?? ''} חדרי רחצה
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.bottomContainer}>
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <View style={[styles.iconCircle, styles.iconCircleCompact]}>
                      <Users size={16} color={colors.primary} strokeWidth={2.5} />
                    </View>
                    <Text style={styles.statText}>{roommatesCapacityLabel}</Text>
                  </View>
                  <View style={styles.stat}>
                    <View style={[styles.iconCircle, styles.iconCircleCompact]}>
                      <BedDouble size={16} color={colors.primary} strokeWidth={2.5} />
                    </View>
                    <Text style={styles.statText}>{apartment.bedrooms} חדרים</Text>
                  </View>
                  <View style={styles.stat}>
                    <View style={[styles.iconCircle, styles.iconCircleCompact]}>
                      <ShowerHead size={16} color={colors.primary} strokeWidth={2.5} />
                    </View>
                    <Text style={styles.statText}>{apartment.bathrooms} מקלחות</Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    marginBottom: 16,
    padding: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    // IMPORTANT: keep overflow visible so Android elevation shadow isn't clipped
    overflow: 'visible',
    // Stronger shadow for separation from background
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 10,
  },
  cardInner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(229,231,235,0.65)',
  },
  cardOuterHome: {
    borderRadius: 28,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  cardInnerHome: {
    borderRadius: 26,
  },
  imageWrap: {
    position: 'relative',
    padding: 12,
  },
  imageWrapHome: {
    padding: 0,
  },
  imageInner: {
    position: 'relative',
    borderRadius: 22,
    overflow: 'hidden',
  },
  imageInnerHome: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  image: {
    width: '100%',
    aspectRatio: 4/3,
    backgroundColor: '#0B0B10',
  },
  imageHome: {
    // Slightly taller than 16:9 (per design feedback)
    aspectRatio: 16 / 10,
  },
  imageTextOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 6,
  },
  imageTextOverlayGradient: {
    ...StyleSheet.absoluteFillObject as any,
  },
  imageTextOverlayContent: {
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 14,
  },
  imageOverlayRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  imageOverlayRight: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 0,
  },
  imageTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  imageTimeAgoBottomLeft: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'left',
    writingDirection: 'rtl',
    flexShrink: 0,
  },
  imageSubtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  roommatesBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    // Match "בניין/מ״ר" tag pill but with an opaque background for better readability on images
    borderColor: alpha(colors.primary, 0.18),
    backgroundColor: 'rgba(255,255,255,0.90)',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  badgeIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'transparent',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roommatesBadgeText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    writingDirection: 'ltr',
  },
  roommatesBadgeHome: {
    position: 'absolute',
    top: 12,
    right: 12,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    // Match "בניין/מ״ר" tag pill but with an opaque background for better readability on images
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.18),
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  badgeIconCircleHome: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'transparent',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roommatesBadgeHomeText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  priceBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.18),
    zIndex: 10,
  },
  priceBadgeText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '800',
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  priceBadgeTopLeft: {
    top: 10,
    left: 10,
    right: undefined,
    bottom: undefined,
  },
  priceBadgeTopLeftHome: {
    top: 12,
    left: 12,
  },
  priceBadgeTextTopLeft: {
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'flex-end',
  },
  contentHome: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: 'stretch',
  },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  titleHome: {
    marginBottom: 6,
    fontSize: 17,
  },
  homeContentWrap: {
    width: '100%',
  },
  homeTop: {
    width: '100%',
    alignItems: 'flex-end',
    paddingBottom: 6,
  },
  subtitleHome: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  timeAgoInline: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'left',
    writingDirection: 'rtl',
    marginTop: 2,
    marginLeft: 10,
    flexShrink: 0,
  },
  timeAgoInlineHome: {
    fontSize: 11,
    marginTop: 2,
  },
  featuresRowHome: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
  },
  featureItemHome: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    minWidth: 0,
  },
  featureTextHome: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
    flexShrink: 1,
  },
  metaRowHome: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
    gap: 12,
  },
  metaItemHome: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    justifyContent: 'center',
  },
  metaTextHome: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  metaDotHome: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '900',
    marginTop: -1,
  },
  metaDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  locationRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  location: {
    fontSize: 14,
    color: colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 8,
  },
  bottomContainer: {
    marginTop: 6,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    width: '100%',
  },
  stat: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    justifyContent: 'center',
  },
  statText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
