import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Heart, X, MapPin } from 'lucide-react-native';
import { User } from '@/types/database';

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
          <Text style={styles.locationText}>מיקום לא זמין</Text>
        </View>

        <View style={styles.badgesRow}>
          {['מקצועי/ת', 'נקי/ה', 'אוהב/ת לילה'].map((b) => (
            <View key={b} style={styles.badge}>
              <Text style={styles.badgeText}>{b}</Text>
            </View>
          ))}
        </View>

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


