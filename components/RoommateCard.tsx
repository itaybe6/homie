import React, { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ViewStyle } from 'react-native';
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
};

function RoommateCardBase({ user, onLike, onPass, onOpen, style }: RoommateCardProps) {
  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const router = useRouter();
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

  return (
    <View style={[styles.card, style]}>
      <TouchableOpacity activeOpacity={0.9} onPress={() => onOpen?.(user)}>
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: user.avatar_url || DEFAULT_AVATAR }}
            style={styles.image}
            resizeMode="cover"
          />
        </View>
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user.full_name}{user.age ? `, ${user.age}` : ''}
          </Text>
          {!!user.city ? (
            <View style={styles.cityRow}>
              <MapPin size={14} color="#C9CDD6" />
              <Text style={styles.city} numberOfLines={1}>
                {user.city}
              </Text>
            </View>
          ) : null}
        </View>

        {!!user.bio ? (
          <Text style={styles.bio} numberOfLines={3}>
            {user.bio}
          </Text>
        ) : null}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.circleBtn, styles.passBtn]}
            onPress={() => onPass(user)}
          >
            <X size={22} color="#F43F5E" />
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.circleBtn, styles.likeBtn]}
            onPress={() => onLike(user)}
          >
            <Heart size={22} color="#22C55E" />
          </TouchableOpacity>
        </View>

        {apartments.length ? (
          <View style={styles.aptSection}>
            <Text style={styles.aptSectionTitle}>
              הדירה של {user.full_name?.split(' ')?.[0] || 'המשתמש/ת'}
            </Text>
            {apartments.map((apt) => {
              const imgs = normalizeImageUrls(apt.image_urls);
              const PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';
              const firstImg = imgs?.length ? imgs[0] : PLACEHOLDER;
              return (
                <TouchableOpacity
                  key={apt.id}
                  style={styles.aptCard}
                  activeOpacity={0.9}
                  onPress={() => router.push({ pathname: '/apartment/[id]', params: { id: apt.id } })}
                >
                  <View style={styles.aptThumbWrap}>
                    <Image
                      source={{ uri: failedThumbs[apt.id] ? PLACEHOLDER : firstImg }}
                      style={styles.aptThumbImg}
                      resizeMode="cover"
                      onError={() =>
                        setFailedThumbs((s) => (s[apt.id] ? s : { ...s, [apt.id]: true }))
                      }
                    />
                  </View>
                  <View style={styles.aptInfo}>
                    <Text style={styles.aptTitle} numberOfLines={1}>
                      {apt.title || 'דירה'}
                    </Text>
                    {!!apt.city ? (
                      <View style={styles.aptMetaRow}>
                        <MapPin size={14} color="#C9CDD6" />
                        <Text style={styles.aptMeta} numberOfLines={1}>
                          {apt.city}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flex: 0 }}>
                    <Text style={styles.aptCta}>לצפייה</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default memo(RoommateCardBase);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#17171F',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  imageWrap: {
    width: '100%',
    height: 260,
    backgroundColor: '#22232E',
  },
  image: {
    width: '100%',
    height: '100%',
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
    color: '#7C5CFF',
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.35)',
  },
});