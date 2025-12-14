import React, { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, X, MapPin } from 'lucide-react-native';
import { User } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

type RoommateCardProps = {
  user: User;
  onLike: (user: User) => void;
  onPass: (user: User) => void;
  onOpen?: (user: User) => void;
  style?: ViewStyle;
  matchPercent?: number | null;
  mediaHeight?: number;
};

function RoommateCardBase({ user, onLike, onPass, onOpen, style, matchPercent, mediaHeight }: RoommateCardProps) {
  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const router = useRouter();
  const resolvedMediaHeight = typeof mediaHeight === 'number' && Number.isFinite(mediaHeight) ? mediaHeight : 520;
  type ProfileApartment = {
    id: string;
    title?: string | null;
    city?: string | null;
    image_urls?: any;
  };
  const [apartments, setApartments] = useState<ProfileApartment[]>([]);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});

  const normalizeImageUrls = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return (value as unknown[])
        .filter((u) => typeof u === 'string' && !!(u as string).trim()) as string[];
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter((u: any) => typeof u === 'string' && !!u.trim());
        }
      } catch {
        try {
          const cleaned = value.replace(/^\s*\{|\}\s*$/g, '');
          if (!cleaned) return [];
          return cleaned
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) {
        if (!cancelled) setApartments([]);
        return;
      }
      try {
        const [owned, partner] = await Promise.all([
          supabase
            .from('apartments')
            .select('id, title, city, image_urls')
            .eq('owner_id', user.id),
          supabase
            .from('apartments')
            .select('id, title, city, image_urls')
            .contains('partner_ids', [user.id] as any),
        ]);
        const merged = [...(owned.data || []), ...(partner.data || [])] as ProfileApartment[];
        const uniq: Record<string, ProfileApartment> = {};
        merged.forEach((a) => {
          if (a?.id) uniq[a.id] = a;
        });
        if (!cancelled) setApartments(Object.values(uniq));
      } catch {
        if (!cancelled) setApartments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const formattedMatch = matchPercent === null || matchPercent === undefined ? '--%' : `${matchPercent}%`;

  return (
    <View style={[styles.card, style]}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => onOpen?.(user)}>
        <View style={[styles.imageWrap, { height: resolvedMediaHeight }]}>
          <Image
            source={{ uri: user.avatar_url || DEFAULT_AVATAR }}
            style={styles.image}
            resizeMode="cover"
          />
          <View style={styles.matchBadge}>
            <Text style={styles.matchBadgeValue}>{formattedMatch}</Text>
            <Text style={styles.matchBadgeLabel}>התאמה</Text>
          </View>
          <View style={styles.bottomOverlayWrap}>
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.bottomOverlayGradient}
            />
            <View style={styles.bottomOverlayContent}>
              {!!user.full_name ? (
                <Text style={styles.overlayName} numberOfLines={1}>
                  {user.full_name}{user.age ? `, ${user.age}` : ''}
                </Text>
              ) : null}
              {!!user.bio ? (
                <Text style={styles.overlayBio} numberOfLines={2}>
                  {user.bio}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* Bottom action buttons removed — swipe on card in parent */}
    </View>
  );
}

export default memo(RoommateCardBase);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summary: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  summaryTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  summaryText: {
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
    marginTop: 4,
  },
  imageWrap: {
    width: '100%',
    height: 520,
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  bottomOverlayWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 128,
  },
  bottomOverlayGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  bottomOverlayContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'flex-end',
  },
  overlayName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  overlayAge: {
    color: '#E5E7EB',
    fontSize: 13,
    marginTop: 2,
    textAlign: 'right',
  },
  overlayBio: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    textAlign: 'right',
  },
  matchBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,15,20,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.35)',
    zIndex: 2,
  },
  matchBadgeValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  matchBadgeLabel: {
    color: '#C9CDD6',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerRow: {
    alignItems: 'flex-end',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 as any,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  city: {
    color: '#C9CDD6',
    fontSize: 13,
  },
  bio: {
    color: '#C7CBD1',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
    marginTop: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  circleBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  passBtn: {
    borderColor: 'rgba(244,63,94,0.6)',
    backgroundColor: 'rgba(244,63,94,0.08)',
  },
  likeBtn: {
    borderColor: 'rgba(34,197,94,0.6)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  aptSection: {
    marginTop: 14,
    gap: 8 as any,
    direction: 'rtl',
    writingDirection: 'rtl',
  },
  aptSectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    alignSelf: 'flex-end',
  },
  aptCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12 as any,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  aptThumbWrap: {
    width: 92,
    height: 92,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1F1F29',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  aptThumbImg: {
    width: '100%',
    height: '100%',
  },
  aptInfo: {
    flex: 1,
    alignItems: 'flex-end',
    direction: 'rtl',
    writingDirection: 'rtl',
  },
  aptTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
  },
  aptMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6 as any,
    alignSelf: 'flex-end',
  },
  aptMeta: {
    color: '#C9CDD6',
    fontSize: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aptCta: {
    color: '#4C1D95',
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.35)',
  },
});