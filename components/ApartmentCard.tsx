import { View, Text, StyleSheet, TouchableOpacity, Image, GestureResponderEvent, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { supabase } from '@/lib/supabase';
import { MapPin, Bed, Bath, Users, Heart } from 'lucide-react-native';
import { Apartment } from '@/types/database';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/authStore';

interface ApartmentCardProps {
  apartment: Apartment;
  onPress: () => void;
}

export default function ApartmentCard({
  apartment,
  onPress,
}: ApartmentCardProps) {
  const PLACEHOLDER =
    'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';

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
    return filtered.length ? filtered : [PLACEHOLDER];
  }, [storageImages, previewImages, failedUris]);

  useEffect(() => {
    // Keep index valid if we filtered images after failures
    setImageIdx((prev) => Math.max(0, Math.min(prev, carouselImages.length - 1)));
  }, [carouselImages.length]);

  const [carouselWidth, setCarouselWidth] = useState<number>(0);

  const partnerIds = useMemo(
    () => normalizePartnerIds((apartment as any).partner_ids),
    [apartment]
  );
  // Prefer max_roommates (new schema), fallback to roommate_capacity (legacy schema).
  const maxRoommates: number | null =
    typeof (apartment as any)?.max_roommates === 'number'
      ? ((apartment as any).max_roommates as number)
      : typeof (apartment as any)?.roommate_capacity === 'number'
        ? ((apartment as any).roommate_capacity as number)
        : null;

  const partnerSlotsUsed = partnerIds.length;
  const availableRoommateSlots =
    maxRoommates !== null ? Math.max(0, maxRoommates - partnerSlotsUsed) : null;

  return (
    <View style={styles.cardOuter}>
      <View style={styles.cardInner}>
        <View style={styles.imageWrap}>
          <View style={styles.imageInner}>
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
                          style={styles.image}
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
            {/* gradient overlay */}
            <LinearGradient
              colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.0)']}
              start={{ x: 0.5, y: 1 }}
              end={{ x: 0.5, y: 0 }}
              pointerEvents="none"
              style={styles.gradientOverlay}
            />
            {/* Favorite */}
            <FavoriteButton apartmentId={apartment.id} />
            {/* Roommates badge */}
            <View style={styles.roommatesBadge} pointerEvents="none">
              <Users size={18} color="#111827" />
              <Text style={styles.roommatesBadgeText}>
                {typeof maxRoommates === 'number' ? `${partnerSlotsUsed}/${maxRoommates}` : `${partnerSlotsUsed}`}
              </Text>
            </View>
            {/* Carousel dots */}
            <View style={styles.dotsRow} pointerEvents="none">
              {carouselImages.map((_, i) => (
                <View key={`dot-${i}`} style={[styles.dot, { opacity: i === imageIdx ? 1 : 0.5 }]} />
              ))}
            </View>
            {/* Price badge */}
            <View style={styles.priceBadge}>
              <Text style={styles.priceBadgeText}>
                {apartment.price?.toLocaleString?.() ?? String(apartment.price ?? '')}
                <Text style={styles.priceBadgeCurrency}>₪</Text>
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.content} onPress={onPress} activeOpacity={0.9} delayPressIn={150}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {apartment.title}
            </Text>
          </View>

          <View style={styles.locationRow}>
            <MapPin size={16} color="#6B7280" />
            <Text style={styles.location}>{apartment.city}</Text>
          </View>

          <View style={styles.bottomContainer}>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Users size={16} color="#c084fc" />
                <Text style={styles.statText}>שותפים {partnerSlotsUsed}</Text>
              </View>
              <View style={styles.stat}>
                <Bath size={16} color="#c084fc" />
                <Text style={styles.statText}>מקלחות {apartment.bathrooms}</Text>
              </View>
              <View style={styles.stat}>
                <Bed size={16} color="#c084fc" />
                <Text style={styles.statText}>חדרים {apartment.bedrooms}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function FavoriteButton({ apartmentId }: { apartmentId: string }) {
  const { user } = useAuthStore();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check if this apartment is in the user's likes on mount
  useEffect(() => {
    const checkIfLiked = async () => {
      if (!user?.id) return;
      try {
        const { data, error } = await supabase
          .from('users')
          .select('likes')
          .eq('id', user.id)
          .single();

        if (!error && data?.likes) {
          setIsFavorite(data.likes.includes(apartmentId));
        }
      } catch (err) {
        console.error('Error checking like status:', err);
      }
    };
    checkIfLiked();
  }, [user?.id, apartmentId]);

  const onToggle = async (e: GestureResponderEvent) => {
    // Prevent triggering the card onPress
    e.stopPropagation();
    
    if (!user?.id || isLoading) return;
    
    setIsLoading(true);
    try {
      // Get current likes
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('likes')
        .eq('id', user.id)
        .single();

      if (fetchError) throw fetchError;

      const currentLikes: string[] = userData?.likes || [];
      let newLikes: string[];

      if (isFavorite) {
        // Remove from likes
        newLikes = currentLikes.filter((id) => id !== apartmentId);
      } else {
        // Add to likes
        newLikes = [...currentLikes, apartmentId];
      }

      // Update in database
      const { error: updateError } = await supabase
        .from('users')
        .update({ likes: newLikes, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setIsFavorite(!isFavorite);
    } catch (err) {
      console.error('Error toggling like:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={isFavorite ? 'הסר מאהבתי' : 'הוסף לאהבתי'}
      disabled={isLoading}
      style={[
        styles.favoriteButton,
        isFavorite ? styles.favoriteButtonActive : styles.favoriteButtonInactive,
        isLoading && { opacity: 0.6 },
      ]}
    >
      <Heart
        size={18}
        color={isFavorite ? '#FFFFFF' : '#1F2937'}
        fill={isFavorite ? '#FFFFFF' : 'transparent'}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 16,
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
    borderRadius: 20,
    overflow: 'hidden',
  },
  imageWrap: {
    position: 'relative',
    padding: 12,
  },
  imageInner: {
    position: 'relative',
    borderRadius: 20,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    aspectRatio: 4/3,
    backgroundColor: '#0B0B10',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject as any,
  },
  favoriteButton: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  favoriteButtonInactive: {
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
  favoriteButtonActive: {
    backgroundColor: '#8B5CF6',
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
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(255,255,255,0.75)',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  roommatesBadgeText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    writingDirection: 'ltr',
  },
  dotsRow: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  priceBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  priceBadgeText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  priceBadgeCurrency: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    alignItems: 'flex-end',
  },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  locationRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  location: {
    fontSize: 14,
    color: '#4C1D95',
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
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    width: '100%',
  },
  stat: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
  },
});
