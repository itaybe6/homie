import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { User } from '@/types/database';
import { ArrowLeft, MapPin, UserPlus2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';

export default function UserProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const contentTopPadding = insets.top ;
  const contentBottomPadding = Math.max(32, insets.bottom + 16);

  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const me = useAuthStore((s) => s.user);

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
            name: 'קבוצת שותפים חדשה',
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: contentTopPadding,
        paddingBottom: contentBottomPadding,
      }}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
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

      {me?.id && me.id !== profile.id ? (
        <View style={styles.section}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={inviteLoading ? undefined : ensureGroupAndInvite}
            style={[styles.mergeBtn, inviteLoading ? styles.mergeBtnDisabled : null]}
          >
            <UserPlus2 size={18} color="#0F0F14" />
            <Text style={styles.mergeBtnText}>
              {inviteLoading ? 'שולח...' : 'בקש/י מיזוג פרופילים'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {profile.bio ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>אודות</Text>
          <Text style={styles.sectionText}>{profile.bio}</Text>
        </View>
      ) : null}

      {!!profile.image_urls?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>גלריה</Text>
          <View style={styles.gallery}>
            {profile.image_urls.map((url, idx) => (
              <Image key={url + idx} source={{ uri: url }} style={styles.galleryImg} />
            ))}
          </View>
        </View>
      )}
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
    paddingTop: 52,
    paddingBottom: 12,
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
  gallery: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  galleryImg: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#1F1F29',
  },
});



