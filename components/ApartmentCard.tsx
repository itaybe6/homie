import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { MapPin, Bed, Bath, Users } from 'lucide-react-native';
import { Apartment } from '@/types/database';
import { useState, useMemo, useEffect } from 'react';

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

  const currentImage = imageCandidates[Math.min(imageIdx, imageCandidates.length - 1)] || PLACEHOLDER;

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
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.imageWrap}>
        <Image
          source={{ uri: currentImage }}
          style={styles.image}
          resizeMode="cover"
          onError={() => {
            const nextIdx = imageIdx + 1;
            if (nextIdx < imageCandidates.length) {
              setImageIdx(nextIdx);
            } else if (currentImage !== PLACEHOLDER) {
              setImageIdx(imageCandidates.length - 1);
            }
          }}
        />
        {totalRoommateCapacity !== null ? (
          <View style={styles.capacityOverlayWrap}>
            <View style={styles.capacityOverlay}>
              <View style={styles.capacityOverlaySlots}>
                <Users size={16} color="#FFFFFF" />
                <Text style={styles.capacityOverlaySlotsText}>
                  {partnerSlotsUsed}/{totalRoommateCapacity}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {apartment.title}
          </Text>
        </View>

        <View style={styles.locationRow}>
          <MapPin size={16} color="#9DA4AE" />
          <Text style={styles.location}>{apartment.city}</Text>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detail}>
            <Bed size={16} color="#7C5CFF" />
            <Text style={styles.detailText}>{apartment.bedrooms}</Text>
          </View>

          <View style={styles.detail}>
            <Bath size={16} color="#7C5CFF" />
            <Text style={styles.detailText}>{apartment.bathrooms}</Text>
          </View>
        </View>

        <View style={styles.chipsRow}>
          {['Pets ok', 'Non-smoking', 'Furnished'].map((label) => (
            <View key={label} style={styles.chip}>
              <Text style={styles.chipText}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footerRow}>
          {apartment.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {apartment.description}
            </Text>
          ) : (
            <View />
          )}
        </View>

        <View style={styles.bottomBar}>
          <View style={styles.priceContainer}>
            <Text style={styles.currency}>₪</Text>
            <Text style={styles.price}>{apartment.price}</Text>
            <Text style={styles.priceUnit}>/חודש</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#17171F',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: '#22232E',
  },
  capacityOverlayWrap: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  capacityOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,20,32,0.92)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  capacityOverlaySlots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(124,92,255,0.18)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  capacityOverlaySlotsText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  overlayButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,15,20,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  content: {
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  locationRow: {
    flexDirection: 'row',
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
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 14,
    color: '#E5E7EB',
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    fontSize: 18,
    fontWeight: '900',
    color: '#22C55E',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  currency: {
    fontSize: 16,
    fontWeight: '900',
    color: '#22C55E',
    marginRight: 4,
  },
  priceUnit: {
    fontSize: 12,
    color: '#9DA4AE',
    marginLeft: 2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1F1F29',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chipText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomBar: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  description: {
    fontSize: 14,
    color: '#C7CBD1',
    lineHeight: 20,
    flex: 1,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#A78BFA',
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 14,
    marginLeft: 12,
  },
  chatBtnText: {
    color: '#0F0F14',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
