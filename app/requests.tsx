import { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Check, X } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Apartment, Request, User } from '@/types/database';

export default function RequestsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sent, setSent] = useState<Request[]>([]);
  const [received, setReceived] = useState<Request[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);

  const [usersById, setUsersById] = useState<Record<string, Partial<User>>>({});
  const [aptsById, setAptsById] = useState<Record<string, Partial<Apartment>>>({});

  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const APT_PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';

  useEffect(() => {
    fetchAll();
  }, [user?.id]);

  const fetchAll = async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      setLoading(true);
      const [{ data: sData, error: sErr }, { data: rData, error: rErr }] = await Promise.all([
        supabase.from('requests').select('*').eq('sender_id', user.id).order('created_at', { ascending: false }),
        supabase.from('requests').select('*').eq('recipient_id', user.id).order('created_at', { ascending: false }),
      ]);
      if (sErr) throw sErr;
      if (rErr) throw rErr;
      const sentReqs = (sData || []) as Request[];
      const recReqs = (rData || []) as Request[];
      setSent(sentReqs);
      setReceived(recReqs);

      const userIds = Array.from(new Set([
        ...sentReqs.map((r) => r.recipient_id),
        ...recReqs.map((r) => r.sender_id),
      ]));
      if (userIds.length) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, avatar_url')
          .in('id', userIds);
        const map: Record<string, Partial<User>> = {};
        (usersData || []).forEach((u: any) => { map[u.id] = u; });
        setUsersById(map);
      } else {
        setUsersById({});
      }

      const aptIds = Array.from(new Set([
        ...sentReqs.map((r) => r.apartment_id).filter(Boolean) as string[],
        ...recReqs.map((r) => r.apartment_id).filter(Boolean) as string[],
      ]));
      if (aptIds.length) {
        const { data: apts } = await supabase
          .from('apartments')
          .select('id, title, city, image_urls');
        const aMap: Record<string, any> = {};
        (apts || []).forEach((a: any) => { aMap[a.id] = a; });
        setAptsById(aMap);
      } else {
        setAptsById({});
      }
    } catch (e) {
      console.error('Failed to load requests', e);
      setSent([]);
      setReceived([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const approveIncoming = async (req: Request) => {
    if (!user?.id || !req.apartment_id) return;
    try {
      setActionId(req.id);
      // 1) add sender to apartment partners
      const { data: apt, error: aptErr } = await supabase
        .from('apartments')
        .select('id, partner_ids, owner_id, title, city')
        .eq('id', req.apartment_id)
        .maybeSingle();
      if (aptErr) throw aptErr;
      if (!apt) throw new Error('דירה לא נמצאה');
      const currentPartnerIds: string[] = Array.isArray((apt as any).partner_ids) ? (apt as any).partner_ids : [];
      if (!currentPartnerIds.includes(req.sender_id)) {
        const newPartnerIds = Array.from(new Set([...(currentPartnerIds || []), req.sender_id]));
        const { error: upAptErr } = await supabase.from('apartments').update({ partner_ids: newPartnerIds }).eq('id', req.apartment_id);
        if (upAptErr) throw upAptErr;
      }

      // 2) update request status
      await supabase.from('requests').update({ status: 'APPROVED', updated_at: new Date().toISOString() }).eq('id', req.id);

      // 3) notify original sender
      const backTitle = 'בקשה אושרה';
      const backDesc = `בקשתך להצטרף לדירה${(apt as any)?.title ? `: ${(apt as any).title}` : ''}${(apt as any)?.city ? ` (${(apt as any).city})` : ''}\n---\nAPPROVED_APT:${req.apartment_id}\nSTATUS:APPROVED`;
      await supabase.from('notifications').insert({
        sender_id: user.id,
        recipient_id: req.sender_id,
        title: backTitle,
        description: backDesc,
        is_read: false,
      });

      await fetchAll();
      Alert.alert('הצלחה', 'הבקשה אושרה');
    } catch (e: any) {
      console.error('approve request failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לאשר את הבקשה');
    } finally {
      setActionId(null);
    }
  };

  const rejectIncoming = async (req: Request) => {
    try {
      setActionId(req.id);
      await supabase.from('requests').update({ status: 'REJECTED', updated_at: new Date().toISOString() }).eq('id', req.id);
      await fetchAll();
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לדחות את הבקשה');
    } finally {
      setActionId(null);
    }
  };

  const StatusPill = ({ status }: { status: Request['status'] }) => {
    let bg = '#363649', color = '#E5E7EB', text = 'ממתין';
    if (status === 'APPROVED') { bg = 'rgba(34,197,94,0.18)'; color = '#22C55E'; text = 'אושר'; }
    if (status === 'REJECTED') { bg = 'rgba(248,113,113,0.18)'; color = '#F87171'; text = 'נדחה'; }
    if (status === 'CANCELLED') { bg = 'rgba(148,163,184,0.18)'; color = '#94A3B8'; text = 'בוטל'; }
    return (
      <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
        <Text style={{ color, fontWeight: '900', fontSize: 12 }}>{text}</Text>
      </View>
    );
  };

  const Section = ({ title, data, incoming }: { title: string; data: Request[]; incoming?: boolean }) => (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {data.length === 0 ? (
        <Text style={styles.emptyText}>אין פריטים להצגה</Text>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const otherUser = incoming ? usersById[item.sender_id] : usersById[item.recipient_id];
            const apt = item.apartment_id ? aptsById[item.apartment_id] : undefined;
            const aptImage = apt ? (Array.isArray(apt.image_urls) && (apt.image_urls as any[]).length ? (apt.image_urls as any[])[0] : APT_PLACEHOLDER) : null;
            return (
              <View style={styles.card}>
                <View style={styles.cardInner}>
                  {!!aptImage && (
                    <View style={styles.thumbWrap}>
                      <Image source={{ uri: aptImage }} style={styles.thumbImg} />
                    </View>
                  )}
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.type === 'JOIN_APT' ? 'בקשת הצטרפות לדירה' : 'בקשה'}
                    </Text>
                    {!!apt && (
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {apt.title} • {apt.city}
                      </Text>
                    )}
                    {!!otherUser?.full_name && (
                      <Text style={styles.cardMeta}>משתמש: {otherUser.full_name}</Text>
                    )}
                    <Text style={styles.cardMeta}>{new Date(item.created_at).toLocaleString()}</Text>
                    <View style={{ marginTop: 10, flexDirection: 'row-reverse', gap: 8 as any }}>
                      <StatusPill status={item.status} />
                      {incoming && item.status === 'PENDING' && (
                        <View style={{ flexDirection: 'row-reverse', gap: 8 as any }}>
                          <TouchableOpacity
                            style={[styles.approveBtn, actionId === item.id && { opacity: 0.7 }]}
                            onPress={() => approveIncoming(item)}
                            disabled={actionId === item.id}
                            activeOpacity={0.85}
                          >
                            {actionId === item.id ? <ActivityIndicator size="small" color="#0F0F14" /> : <Text style={styles.approveBtnText}>אישור</Text>}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.rejectBtn, actionId === item.id && { opacity: 0.7 }]}
                            onPress={() => rejectIncoming(item)}
                            disabled={actionId === item.id}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.rejectBtnText}>דחייה</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.avatarWrap}
                    activeOpacity={0.85}
                    onPress={() => {
                      const id = incoming ? item.sender_id : item.recipient_id;
                      if (id) router.push({ pathname: '/user/[id]', params: { id } });
                    }}
                  >
                    <Image source={{ uri: otherUser?.avatar_url || DEFAULT_AVATAR }} style={styles.avatarImg} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if ((router as any).canGoBack?.()) {
              router.back();
            } else {
              router.replace('/(tabs)/home');
            }
          }}
          style={styles.iconBtn}
          activeOpacity={0.85}
        >
          <ArrowRight size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>בקשות</Text>
        <View style={styles.iconBtnPlaceholder} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#7C5CFF" />
        </View>
      ) : (
        <FlatList
          data={[{ key: 'received' }, { key: 'sent' }]}
          keyExtractor={(i) => i.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C5CFF" />}
          renderItem={({ item }) => {
            if (item.key === 'received') {
              return <Section title="בקשות אליי" data={received} incoming />;
            }
            return <Section title="הבקשות שלי" data={sent} />;
          }}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  iconBtnPlaceholder: {
    width: 36,
    height: 36,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
    gap: 12 as any,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'right',
  },
  emptyText: {
    color: '#9DA4AE',
    textAlign: 'right',
  },
  card: {
    backgroundColor: '#15151C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  cardInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 14,
    gap: 12 as any,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  cardSub: {
    color: '#E6E9F0',
    fontSize: 14,
    textAlign: 'right',
    marginTop: 4,
  },
  cardMeta: {
    color: '#9DA4AE',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  avatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    backgroundColor: '#1F1F29',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  thumbWrap: {
    width: 70,
    height: 70,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1F1F29',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  approveBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  approveBtnText: {
    color: '#0F0F14',
    fontSize: 14,
    fontWeight: '800',
  },
  rejectBtn: {
    backgroundColor: 'rgba(248,113,113,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  rejectBtnText: {
    color: '#F87171',
    fontSize: 14,
    fontWeight: '800',
  },
});


