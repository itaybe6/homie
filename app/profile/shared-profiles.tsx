import { useEffect, useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, LogOut } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { User } from '@/types/database';

type GroupListItem = {
  id: string;
  name?: string | null;
  members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[];
};

export default function SharedProfilesScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [leavingGroupId, setLeavingGroupId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!user?.id) {
          setGroups([]);
          return;
        }
        const { data: membershipRows, error: membershipError } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE');
        if (membershipError) throw membershipError;
        const groupIds = (membershipRows || []).map((r: any) => r.group_id).filter(Boolean);
        if (!groupIds.length) {
          setGroups([]);
          return;
        }

        const results: GroupListItem[] = [];
        for (const gid of groupIds) {
          const { data: groupRow } = await supabase
            .from('profile_groups')
            .select('id,name,status')
            .eq('id', gid)
            .eq('status', 'ACTIVE')
            .maybeSingle();
          if (!groupRow) continue;

          const { data: memberRows } = await supabase
            .from('profile_group_members')
            .select('user_id')
            .eq('group_id', gid)
            .eq('status', 'ACTIVE');
          const memberIds = (memberRows || []).map((m: any) => m.user_id).filter(Boolean);
          if (!memberIds.length) continue;

          const { data: usersRows, error: usersError } = await supabase
            .from('users')
            .select('id, full_name, avatar_url')
            .in('id', memberIds);
          if (usersError) throw usersError;

          results.push({
            id: gid,
            name: (groupRow as any)?.name,
            members: (usersRows || []) as any,
          });
        }
        setGroups(results);
      } catch (e: any) {
        Alert.alert('שגיאה', e?.message || 'לא ניתן לטעון פרופילים משותפים');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const reloadGroups = async () => {
    setLoading(true);
    try {
      if (!user?.id) {
        setGroups([]);
        return;
      }
      const { data: membershipRows, error: membershipError } = await supabase
        .from('profile_group_members')
        .select('group_id')
        .eq('user_id', user.id)
        .eq('status', 'ACTIVE');
      if (membershipError) throw membershipError;
      const groupIds = (membershipRows || []).map((r: any) => r.group_id).filter(Boolean);
      if (!groupIds.length) {
        setGroups([]);
        return;
      }

      const results: GroupListItem[] = [];
      for (const gid of groupIds) {
        const { data: groupRow } = await supabase
          .from('profile_groups')
          .select('id,name,status')
          .eq('id', gid)
          .eq('status', 'ACTIVE')
          .maybeSingle();
        if (!groupRow) continue;

        const { data: memberRows } = await supabase
          .from('profile_group_members')
          .select('user_id')
          .eq('group_id', gid)
          .eq('status', 'ACTIVE');
        const memberIds = (memberRows || []).map((m: any) => m.user_id).filter(Boolean);
        if (!memberIds.length) continue;

        const { data: usersRows, error: usersError } = await supabase
          .from('users')
          .select('id, full_name, avatar_url')
          .in('id', memberIds);
        if (usersError) throw usersError;

        results.push({
          id: gid,
          name: (groupRow as any)?.name,
          members: (usersRows || []) as any,
        });
      }
      setGroups(results);
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לטעון פרופילים משותפים');
    } finally {
      setLoading(false);
    }
  };

  const leaveGroup = async (groupId: string) => {
    if (!user?.id) return;
    try {
      const shouldProceed = await new Promise<boolean>((resolve) => {
        Alert.alert('עזיבת קבוצה', 'האם לעזוב את הקבוצה הזו? ניתן להצטרף שוב בהזמנה.', [
          { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
          { text: 'עזוב/י', style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
      if (!shouldProceed) return;
      setLeavingGroupId(groupId);
      const { error } = await supabase
        .from('profile_group_members')
        .update({ status: 'LEFT', updated_at: new Date().toISOString() })
        .eq('group_id', groupId)
        .eq('user_id', user.id);
      if (error) throw error;
      await reloadGroups();
      Alert.alert('בוצע', 'עזבת את הקבוצה.');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לעזוב את הקבוצה כעת');
    } finally {
      setLeavingGroupId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#7C5CFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topSpacer} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>פרופילים משותפים</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {!groups.length ? (
          <Text style={styles.emptyText}>אין לך פרופילים משותפים פעילים.</Text>
        ) : (
          groups.map((g) => (
            <View key={g.id} style={styles.groupCard}>
              <View style={styles.cardTopRow}>
                <Text style={styles.groupTitle} numberOfLines={1}>
                  {(g.name || 'שותפים').toString()}
                </Text>
                <TouchableOpacity
                  style={[styles.leaveBtn, leavingGroupId === g.id ? { opacity: 0.7 } : null]}
                  onPress={leavingGroupId ? undefined : () => leaveGroup(g.id)}
                  activeOpacity={0.9}
                >
                  {leavingGroupId === g.id ? (
                    <ActivityIndicator size="small" color="#F87171" />
                  ) : (
                    <>
                      <LogOut size={16} color="#F87171" />
                      <Text style={styles.leaveBtnText}>עזוב/י קבוצה</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.avatarsRow}>
                {g.members.map((m) => (
                  <View key={m.id} style={styles.avatarWrap}>
                    <Image
                      source={{ uri: m.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                      style={styles.avatar}
                    />
                  </View>
                ))}
              </View>
              <Text style={styles.membersLine} numberOfLines={2}>
                {g.members.map((m) => m.full_name || 'חבר').join(' • ')}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
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
  },
  topSpacer: {
    height: 60,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  groupCard: {
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
  cardTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  groupTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  avatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#0F0F14',
    overflow: 'hidden',
    backgroundColor: '#1F1F29',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  membersLine: {
    color: '#C7CBD1',
    fontSize: 13,
    textAlign: 'center',
  },
  emptyText: {
    color: '#9DA4AE',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
  },
  leaveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  leaveBtnText: {
    color: '#F87171',
    fontWeight: '800',
    fontSize: 13,
  },
});


