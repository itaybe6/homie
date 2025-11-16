import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Heart, X, MapPin } from 'lucide-react-native';
import { Apartment, User } from '@/types/database';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';

interface RoommateCardProps {
  user: User;
  onLike?: (user: User) => void;
  onPass?: (user: User) => void;
  onOpen?: (user: User) => void;
}

const DEFAULT_AVATAR =
  'https://cdn-icons-png.flaticon.com/512/847/847969.png';

function computeMatchPercent(id: string | undefined, seedText: string | undefined) {
  const base = `${id || ''}:${seedText || ''}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = (hash * 31 + base.charCodeAt(i)) >>> 0;
  }
  // Stable range 68-95
  return 68 + (hash % 28);
}

function buildReasons(user: User): string[] {
  const reasons: string[] = [];
  if (user.age && user.age >= 20 && user.age <= 35) reasons.push('טווח גילאים דומה');
  if ((user.bio || '').toLowerCase().includes('לילה')) reasons.push('אוהבי לילה');
  if ((user.bio || '').toLowerCase().includes('נקי')) reasons.push('אוהבים נקיון');
  if (reasons.length < 3) reasons.push('תקציב דומה');
  if (reasons.length < 3) reasons.push('תחביבים משותפים');
  return reasons.slice(0, 3);
}

export default function RoommateCard({
  user,
  onLike,
  onPass,
  onOpen,
}: RoommateCardProps) {
  const match = computeMatchPercent(user.id, user.bio || user.full_name);
  const reasons = buildReasons(user);
  const cityLabel = (user.city || '').trim() || 'מיקום לא זמין';
  const router = useRouter();

  const [apartment, setApartment] = useState<Pick<Apartment, 'id' | 'title' | 'city' | 'image_urls' | 'image_url' | 'price'> | null>(null);
  const [aptLoading, setAptLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    async function loadApartmentForUser(uid: string | undefined) {
      if (!uid) return;
      setAptLoading(true);
      try {
        // Owner case (limit 1)
        const { data: ownerRows, error: ownerErr } = await supabase
          .from('apartments')
          .select('id, title, city, image_urls, image_url, price')
          .eq('owner_id', uid)
          .limit(1);
        if (ownerErr && !String(ownerErr?.message || '').includes('PGRST')) throw ownerErr;
        const ownerFirst = Array.isArray(ownerRows) && ownerRows.length ? ownerRows[0] : null;
        if (ownerFirst && isMounted) {
          setApartment(ownerFirst as any);
          return;
        }
        // Partner (member) case (limit 1)
        const { data: memberRows, error: memberErr } = await supabase
          .from('apartments')
          .select('id, title, city, image_urls, image_url, price')
          .contains('partner_ids', [uid])
          .limit(1);
        if (memberErr && !String(memberErr?.message || '').includes('PGRST')) throw memberErr;
        const memberFirst = Array.isArray(memberRows) && memberRows.length ? memberRows[0] : null;
        if (isMounted) setApartment(memberFirst || null);
      } catch {
        if (isMounted) setApartment(null);
      } finally {
        if (isMounted) setAptLoading(false);
      }
    }
    setApartment(null);
    loadApartmentForUser(user?.id);
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const primaryImage = useMemo(() => {
    const PLACEHOLDER =
      'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';
    if (!apartment) return PLACEHOLDER;
    // Prefer first image from image_urls
    const urls: any = (apartment as any)?.image_urls;
    if (Array.isArray(urls) && urls[0]) return urls[0] as string;
    if (typeof urls === 'string' && urls) {
      try {
        const parsed = JSON.parse(urls);
        if (Array.isArray(parsed) && parsed[0]) return parsed[0] as string;
      } catch {
        try {
          const asArray = urls
            .replace(/^{|}$/g, '')
            .split(',')
            .map((s: string) => s.replace(/^"+|"+$/g, '').trim())
            .filter(Boolean);
          if (asArray[0]) return asArray[0];
        } catch {}
      }
    }
    // Fallback to single image_url
    const single: any = (apartment as any)?.image_url;
    if (typeof single === 'string' && single) return single;
    return PLACEHOLDER;
  }, [apartment]);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => onOpen?.(user)}>
      <View style={styles.imageWrap}>
        <Image
          source={{ uri: user.avatar_url || DEFAULT_AVATAR }}
          style={styles.image}
        />

        <View style={styles.matchBadge}>
          <Text style={styles.matchText}>{match}%</Text>
        </View>

        <View style={styles.reasonsBox}>
          <Text style={styles.reasonsTitle}>למה זה מתאים?</Text>
          <View style={styles.reasonsChips}>
            {reasons.map((r) => (
              <View key={r} style={styles.reasonChip}>
                <Text style={styles.reasonText}>{r}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.name} numberOfLines={1}>
            {user.full_name}
            {user.age ? `, ${user.age}` : ''}
          </Text>
        </View>

        <View style={styles.locationRow}>
          <MapPin size={16} color="#9DA4AE" />
          <Text style={styles.locationText}>{cityLabel}</Text>
        </View>

        <View style={styles.badgesRow}>
          {['מקצועי/ת', 'נקי/ה', 'אוהב/ת לילה'].map((b) => (
            <View key={b} style={styles.badge}>
              <Text style={styles.badgeText}>{b}</Text>
            </View>
          ))}
        </View>

        {apartment ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/apartment/[id]',
                params: { id: apartment.id } as any,
              })
            }
            style={styles.apartmentBox}
          >
            <View style={styles.apartmentLeft}>
              <Image source={{ uri: primaryImage }} style={styles.apartmentThumb} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.apartmentTitle} numberOfLines={1}>
                {apartment.title || 'דירה משויכת'}
              </Text>
              <View style={styles.apartmentMetaRow}>
                <MapPin size={14} color="#C9CDD6" />
                <Text style={styles.apartmentMetaText} numberOfLines={1}>
                  {apartment.city}
                </Text>
                {typeof (apartment as any).price === 'number' ? (
                  <Text style={styles.apartmentPrice}>
                    ₪{(apartment as any).price}
                  </Text>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        ) : null}

        {user.bio ? (
          <Text style={styles.bio} numberOfLines={3}>
            {user.bio}
          </Text>
        ) : null}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.circleBtn, styles.passBtn]}
            onPress={() => onPass?.(user)}
          >
            <X size={22} color="#F43F5E" />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.circleBtn, styles.likeBtn]}
            onPress={() => onLike?.(user)}
          >
            <Heart size={22} color="#22C55E" />
          </TouchableOpacity>

        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#17171F',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  apartmentBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#1C1C26',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  apartmentLeft: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#22232E',
  },
  apartmentThumb: {
    width: '100%',
    height: '100%',
  },
  apartmentTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
    marginBottom: 4,
  },
  apartmentMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  apartmentMetaText: {
    color: '#C9CDD6',
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },
  apartmentPrice: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '900',
  },
  imageWrap: {
    position: 'relative',
    backgroundColor: '#22232E',
  },
  image: {
    width: '100%',
    height: 280,
  },
  matchBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(15,15,20,0.7)',
    borderWidth: 2,
    borderColor: 'rgba(124,92,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  reasonsBox: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    left: 14,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(15,15,20,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  reasonsTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'right',
  },
  reasonsChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1F1F29',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  reasonText: {
    color: '#E6E9F0',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  locationText: {
    color: '#9DA4AE',
    fontSize: 14,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1F1F29',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  badgeText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '700',
  },
  bio: {
    color: '#C7CBD1',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    textAlign: 'right',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circleBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    // Buttons sit at opposite sides; no side margin needed
  },
  passBtn: {
    borderColor: 'rgba(244,63,94,0.6)',
    backgroundColor: 'rgba(244,63,94,0.08)',
  },
  likeBtn: {
    borderColor: 'rgba(34,197,94,0.6)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#A78BFA',
  },
  messageText: {
    color: '#0F0F14',
    fontSize: 14,
    fontWeight: '800',
  },
});


