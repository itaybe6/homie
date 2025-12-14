import { View, Text, StyleSheet, TouchableOpacity, Image, GestureResponderEvent, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { supabase } from '@/lib/supabase';
import { MapPin, Bed, Bath, Users, Heart, Zap } from 'lucide-react-native';
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
    const unique = new Set<string>();
    raw.forEach((original) => {
      const transformed = transformSupabaseImageUrl(original);
      [transformed, original].forEach((url) => {
        const trimmed = (url || '').trim();
        if (trimmed) unique.add(trimmed);
      });
    });
    if (!unique.size) unique.add(PLACEHOLDER);
    if (!unique.has(PLACEHOLDER)) {
      unique.add(PLACEHOLDER);
    }
    return Array.from(unique);
  }, [apartment]);

  const [imageIdx, setImageIdx] = useState(0);
  const candidateKey = imageCandidates.join('|');

  useEffect(() => {
    setImageIdx(0);
  }, [candidateKey]);

  // Deterministic "random" selection of up to 3 images per apartment
  const previewImages = useMemo(() => {
    const realImages = imageCandidates.filter((u) => u !== PLACEHOLDER);
    const list = realImages.length > 0 ? realImages.slice() : [PLACEHOLDER];
    const seedString = String((apartment as any)?.id || (apartment as any)?.title || 'seed');
    let seed = 0;
    for (let i = 0; i < seedString.length; i++) {
      seed = (seed * 31 + seedString.charCodeAt(i)) >>> 0;
    }
    const rand = () => {
      // xorshift32
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      // Convert to 0..1
      return ((seed >>> 0) / 0xffffffff);
    };
    // Shuffle deterministically
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    const sliced = list.slice(0, Math.max(1, Math.min(3, list.length)));
    if (sliced.length === 0) return [PLACEHOLDER];
    return sliced;
  }, [imageCandidates, apartment]);

  // Try to augment images from Supabase Storage folder if DB has fewer than 3
  const [storageImages, setStorageImages] = useState<string[] | null>(null);
  const attemptedStorageRef = useRef(false);
  useEffect(() => {
    if (attemptedStorageRef.current) return;
    if (previewImages.length >= 3) return;
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
            .list(`apartments/${folder}`, { limit: 20 });
          if (error || !data || data.length === 0) continue;
          for (const f of data) {
            const path = `apartments/${folder}/${f.name}`;
            const { data: pub } = supabase.storage.from('apartment-images').getPublicUrl(path);
            if (pub?.publicUrl) candidates.push(transformSupabaseImageUrl(pub.publicUrl));
          }
          if (candidates.length) break;
        }
        if (candidates.length) {
          // Merge and dedupe
          const merged = Array.from(new Set([...previewImages, ...candidates]));
          setStorageImages(merged.slice(0, 3));
        }
      } catch {}
    };
    tryLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewImages.join('|')]);

  const carouselImages = useMemo(() => {
    if (storageImages && storageImages.length > 0) return storageImages;
    return previewImages;
  }, [storageImages, previewImages]);

  const [carouselWidth, setCarouselWidth] = useState<number>(0);

  const partnerIds = useMemo(
    () => normalizePartnerIds((apartment as any).partner_ids),
    [apartment]
  );
  const totalRoommateCapacity =
    typeof (apartment as any).roommate_capacity === 'number'
      ? (apartment as any).roommate_capacity
      : null;
  const partnerSlotsUsed = partnerIds.length;
  const availableRoommateSlots =
    totalRoommateCapacity !== null ? Math.max(0, totalRoommateCapacity - partnerSlotsUsed) : null;

  const isNew = useMemo(() => {
    try {
      const createdIso = (apartment as any).created_at as string | undefined;
      if (!createdIso) return false;
      const created = new Date(createdIso);
      if (Number.isNaN(created.getTime())) return false;
      const days = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
      return days <= 14;
    } catch {
      return false;
    }
  }, [apartment]);
  const [isCarouselInteracting, setIsCarouselInteracting] = useState(false);
  const lastScrollXRef = useRef(0);
  const didSwipeRef = useRef(false);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => {
        if (isCarouselInteracting || didSwipeRef.current) {
          // reset swipe flag after cancelling press
          didSwipeRef.current = false;
          return;
        }
        onPress();
      }}
      activeOpacity={0.9}
      delayPressIn={150}
    >
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
              // Ensure carousel captures touch immediately
              onStartShouldSetResponder={() => true}
              onStartShouldSetResponderCapture={() => true}
              onMoveShouldSetResponder={() => true}
              onMoveShouldSetResponderCapture={() => true}
              nestedScrollEnabled
              scrollEnabled={carouselImages.length > 1}
              snapToInterval={Math.max(1, carouselWidth)}
              decelerationRate="fast"
              onScrollBeginDrag={() => setIsCarouselInteracting(true)}
              onMomentumScrollBegin={() => setIsCarouselInteracting(true)}
              onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const x = e.nativeEvent.contentOffset.x;
                if (Math.abs(x - lastScrollXRef.current) > 2) {
                  didSwipeRef.current = true;
                }
                lastScrollXRef.current = x;
              }}
              onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                const x = e.nativeEvent.contentOffset.x;
                const w = Math.max(1, carouselWidth);
                const idx = Math.round(x / w);
                setImageIdx(Math.max(0, Math.min(idx, carouselImages.length - 1)));
                setIsCarouselInteracting(false);
              }}
              onScrollEndDrag={() => {
                setIsCarouselInteracting(false);
              }}
              scrollEventThrottle={16}
            >
              {carouselImages.map((uri, idx) => (
                <Image
                  key={`${uri}-${idx}`}
                  source={{ uri }}
                  style={[styles.image, carouselWidth ? { width: carouselWidth } : null]}
                  resizeMode="cover"
                />
              ))}
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
          {/* Carousel dots */}
          <View style={styles.dotsRow}>
            {carouselImages.map((_, i) => (
              <View key={`dot-${i}`} style={[styles.dot, { opacity: i === imageIdx ? 1 : 0.5 }]} />
            ))}
          </View>
          {/* Price badge */}
          <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>{apartment.price}</Text>
          <Text style={styles.priceBadgeCurrency}>₪</Text>
          <Text style={styles.priceBadgeUnit}>/חודש</Text>
          </View>
          {/* New */}
          {isNew ? (
            <View style={styles.newChip}>
              <Zap size={12} color="#4C1D95" />
              <Text style={styles.newChipText}>חדש</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.content}>
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
      </View>
    </TouchableOpacity>
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
  card: {
  backgroundColor: '#FFFFFF',
  borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  borderWidth: 1,
  borderColor: '#E5E7EB',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 4,
  },
  priceBadgeText: {
    color: '#c084fc',
    fontSize: 16,
    fontWeight: '900',
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  priceBadgeCurrency: {
    color: '#c084fc',
    fontSize: 14,
    fontWeight: '900',
    marginHorizontal: 2,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  priceBadgeUnit: {
    color: '#6B7280',
    fontSize: 12,
    marginRight: 6,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  newChip: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    backgroundColor: 'rgba(192,132,252,0.12)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  newChipText: {
    color: '#c084fc',
    fontSize: 12,
    fontWeight: '800',
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
    color: '#9DA4AE',
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
  },
  statsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
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
