import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity, Alert, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { User } from '@/types/database';
import { ArrowLeft, MapPin, UserPlus2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';

export default function UserProfileScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams() as { id?: string; from?: string };
  const insets = useSafeAreaInsets();
  const contentTopPadding = insets.top ;
  const contentBottomPadding = Math.max(180, insets.bottom + 120);

  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const me = useAuthStore((s) => s.user);
  type GroupMember = Pick<User, 'id' | 'full_name' | 'avatar_url'>;
  const [groupContext, setGroupContext] = useState<{ name?: string | null; members: GroupMember[] } | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [galleryWidth, setGalleryWidth] = useState(0);

  const normalizeImageUrls = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return (value as unknown[])
        .filter((u) => typeof u === 'string' && !!(u as string).trim()) as string[];
    }
    if (typeof value === 'string') {
      // Try JSON first
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter((u: any) => typeof u === 'string' && !!u.trim());
        }
      } catch {
        // Not JSON – try Postgres array literal format: {"a","b"} or {a,b}
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
    (async () => {
      try {
        const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        setProfile(data);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const fetchGroupContext = async (userId: string) => {
      setGroupLoading(true);
      try {
        const { data: membershipRows, error: membershipError } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', userId)
          .eq('status', 'ACTIVE');
        if (membershipError) throw membershipError;
        const membership = (membershipRows || [])[0];
        if (!membership?.group_id) {
          if (!cancelled) setGroupContext(null);
          return;
        }
        const groupId = membership.group_id as string;

        const { data: groupRow, error: groupError } = await supabase
          .from('profile_groups')
          .select('id, name')
          .eq('id', groupId)
          .eq('status', 'ACTIVE')
          .maybeSingle();
        if (groupError) throw groupError;
        if (!groupRow) {
          if (!cancelled) setGroupContext(null);
          return;
        }

        const { data: memberRows, error: memberError } = await supabase
          .from('profile_group_members')
          .select('user_id')
          .eq('group_id', groupId)
          .eq('status', 'ACTIVE');
        if (memberError) throw memberError;
        const memberIds = (memberRows || []).map((row: any) => row.user_id).filter(Boolean);
        if (memberIds.length < 2) {
          if (!cancelled) setGroupContext(null);
          return;
        }

        const { data: usersRows, error: usersError } = await supabase
          .from('users')
          .select('id, full_name, avatar_url')
          .in('id', memberIds);
        if (usersError) throw usersError;
        const members = (usersRows || []) as GroupMember[];
        if (members.length < 2) {
          if (!cancelled) setGroupContext(null);
          return;
        }
        const sortedMembers = [...members].sort((a, b) => {
          if (a.id === userId) return -1;
          if (b.id === userId) return 1;
          return (a.full_name || '').localeCompare(b.full_name || '');
        });
        if (!cancelled) setGroupContext({ name: (groupRow as any)?.name, members: sortedMembers });
      } catch (error) {
        console.error('Failed to load group context', error);
        if (!cancelled) setGroupContext(null);
      } finally {
        if (!cancelled) setGroupLoading(false);
      }
    };

    if (profile?.id) {
      fetchGroupContext(profile.id);
    } else {
      setGroupContext(null);
    }

    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const ensureGroupAndInvite = async () => {
    if (!me?.id) {
      Alert.alert('חיבור נדרש', 'כדי לשלוח בקשה למיזוג פרופילים יש להתחבר לחשבון.');
      return;
    }
    if (!profile?.id) return;
    if (me.id === profile.id) {
      Alert.alert('שגיאה', 'לא ניתן לשלוח בקשה לעצמך.');
      return;
    }
    try {
      setInviteLoading(true);
      // Find existing group created by me (pending/active)
      const { data: existingGroup, error: gErr } = await supabase
        .from('profile_groups')
        .select('*')
        .eq('created_by', me.id)
        .in('status', ['PENDING', 'ACTIVE'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (gErr) throw gErr;

      let groupId = existingGroup?.id as string | undefined;

      // Create group if none
      if (!groupId) {
        const { data: newGroup, error: cErr } = await supabase
          .from('profile_groups')
          .insert({
            created_by: me.id,
            name: 'שותפים',
          })
          .select('*')
          .single();
        if (cErr) throw cErr;
        groupId = (newGroup as any)?.id;
      }

      // Prevent duplicate pending invite for same user in same group
      const { data: pendingInvite } = await supabase
        .from('profile_group_invites')
        .select('id,status')
        .eq('group_id', groupId)
        .eq('invitee_id', profile.id)
        .eq('status', 'PENDING')
        .maybeSingle();
      if (pendingInvite?.id) {
        Alert.alert('כבר שלחת', 'כבר קיימת בקשה בהמתנה עבור המשתמש הזה.');
        return;
      }

      // Create invite
      const { error: iErr } = await supabase.from('profile_group_invites').insert({
        group_id: groupId,
        inviter_id: me.id,
        invitee_id: profile.id,
      });
      if (iErr) throw iErr;

      // Create notification for recipient
      let inviterName = 'משתמש';
      try {
        const { data: meRow } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', me.id)
          .maybeSingle();
        inviterName = ((meRow as any)?.full_name as string) || inviterName;
      } catch {}

      const title = 'בקשת מיזוג פרופילים חדשה';
      const desc = `${inviterName} מזמין/ה אותך להצטרף לקבוצת שותפים ולהציג פרופיל ממוזג יחד`;
      await supabase.from('notifications').insert({
        sender_id: me.id,
        recipient_id: profile.id,
        title,
        description: desc,
      });

      Alert.alert('נשלח', 'הבקשה נשלחה ונשלחה התראה למשתמש/ת.');
    } catch (e: any) {
      console.error('send merge invite failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשלוח את הבקשה כעת');
    } finally {
      setInviteLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7C5CFF" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#FFFFFF' }}>לא נמצא משתמש</Text>
      </View>
    );
  }

  const galleryUrls = normalizeImageUrls((profile as any).image_urls);
  const gap = 6;
  const defaultItemSize = Math.floor((Dimensions.get('window').width - 16 * 2 - gap * 2) / 3);
  const galleryItemSize = galleryWidth
    ? Math.floor((galleryWidth - gap * 2) / 3)
    : defaultItemSize;
  const isMeInViewedGroup =
    !!me?.id && !!groupContext?.members?.some((m) => m.id === me.id);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: contentTopPadding,
        paddingBottom: contentBottomPadding,
      }}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            try {
              if (from === 'partners') {
                router.replace('/(tabs)/partners');
                return;
              }
              // Prefer real back when available to preserve position
              // @ts-ignore - canGoBack exists on Expo Router
              if (typeof (router as any).canGoBack === 'function' && (router as any).canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)/home');
              }
            } catch {
              router.replace('/(tabs)/home');
            }
          }}
        >
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        {groupLoading ? null : groupContext && groupContext.members.length >= 2 ? (
          <TouchableOpacity style={styles.mergedChip} activeOpacity={0.9}>
            <View style={styles.mergedAvatarsRow}>
              {groupContext.members.slice(0, 3).map((m, idx) => (
                <View
                  key={m.id}
                  style={[styles.mergedAvatarWrap, idx !== 0 && styles.mergedAvatarOverlap]}
                >
                  {m.avatar_url ? (
                    <Image source={{ uri: m.avatar_url }} style={styles.mergedAvatarImg} />
                  ) : (
                    <View style={styles.mergedAvatarFallback} />
                  )}
                </View>
              ))}
            </View>
          </TouchableOpacity>
        ) : null}
        {!groupLoading && me?.id && me.id !== profile.id && !isMeInViewedGroup ? (
          <TouchableOpacity
            style={styles.mergeHeaderBtn}
            activeOpacity={0.9}
            onPress={inviteLoading ? undefined : ensureGroupAndInvite}
          >
            <UserPlus2 size={16} color="#FFFFFF" />
            <Text style={styles.mergeHeaderText}>{inviteLoading ? 'שולח...' : 'מיזוג'}</Text>
          </TouchableOpacity>
        ) : null}
        <Image
          source={{ uri: profile.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
          style={styles.avatar}
        />
        <Text style={styles.name}>
          {profile.full_name}{profile.age ? `, ${profile.age}` : ''}
        </Text>
        {!!profile.city && (
          <View style={styles.locationRow}>
            <MapPin size={14} color="#C9CDD6" />
            <Text style={styles.locationText}>{profile.city}</Text>
          </View>
        )}
      </View>

      {!!profile.bio && (
        <Text style={styles.headerBio} numberOfLines={6}>
          {profile.bio}
        </Text>
      )}

      {/* merged profile indicator moved to chip on header */}

      {/* merge button moved to header */}

      {/* Bio moved under header */}

      {galleryUrls.length ? (
        <View style={[styles.section, { paddingHorizontal: 12 }]}>
          <Text style={styles.sectionTitle}>גלריה</Text>
          <View
            style={styles.gallery}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w && Math.abs(w - galleryWidth) > 1) setGalleryWidth(w);
            }}
          >
            {galleryUrls.map((url, idx) => (
              <Image
                key={url + idx}
                source={{ uri: url }}
                style={[
                  styles.galleryImg,
                  {
                    width: galleryItemSize,
                    height: galleryItemSize,
                    marginRight: idx % 3 === 2 ? 0 : gap,
                    marginBottom: gap,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F0F14',
  },
  header: {
    alignItems: 'center',
    paddingTop: 104,
    paddingBottom: 12,
  },
  headerBio: {
    color: '#C7CBD1',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 52,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mergedChip: {
    position: 'absolute',
    left: 60,
    top: 52,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  mergedChipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  mergedAvatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  mergedAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#1F1F29',
  },
  mergedAvatarOverlap: {
    marginRight: -12,
  },
  mergedAvatarImg: {
    width: '100%',
    height: '100%',
  },
  mergedAvatarFallback: {
    flex: 1,
    backgroundColor: '#2B2141',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1F1F29',
    marginBottom: 12,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  locationText: {
    color: '#C9CDD6',
    fontSize: 13,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  sectionText: {
    color: '#C7CBD1',
    fontSize: 15,
    lineHeight: 22,
  },
  mergeBtn: {
    marginTop: 4,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#7C5CFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#7C5CFF',
    shadowOpacity: 0.26,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  mergeBtnDisabled: {
    opacity: 0.75,
  },
  mergeBtnText: {
    color: '#0F0F14',
    fontSize: 15,
    fontWeight: '900',
  },
  mergeHeaderBtn: {
    position: 'absolute',
    right: 16,
    top: 52,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mergeHeaderText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  groupSection: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#17171F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    alignItems: 'center',
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#7C5CFF',
    marginBottom: 12,
  },
  groupBadgeText: {
    color: '#0F0F14',
    fontSize: 13,
    fontWeight: '800',
  },
  groupTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  groupAvatars: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  groupAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#0F0F14',
    overflow: 'hidden',
    backgroundColor: '#1F1F29',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupAvatarOverlap: {
    marginRight: -14,
  },
  groupAvatarHighlighted: {
    borderColor: '#7C5CFF',
    borderWidth: 3,
  },
  groupAvatarImg: {
    width: '100%',
    height: '100%',
  },
  groupAvatarFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2B2141',
  },
  groupAvatarFallbackText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '800',
  },
  groupNames: {
    color: '#C7CBD1',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  gallery: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    // gaps handled via per-item margins to ensure precise 3-per-row layout
    justifyContent: 'flex-start',
  },
  galleryImg: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#1F1F29',
  },
});



