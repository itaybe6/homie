import { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Bell } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Notification } from '@/types/database';

export default function NotificationsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [sendersById, setSendersById] = useState<Record<string, { id: string; full_name?: string; avatar_url?: string }>>({});
  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const [apartmentsById, setApartmentsById] = useState<Record<string, { id: string; title?: string; city?: string; image_url?: string; image_urls?: string[] }>>({});
  const APT_PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';

  useEffect(() => {
    fetchNotifications();
  }, [user?.id]);

  const fetchNotifications = async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const notifications = ((data || []) as Notification[]);
      setItems(notifications);

      // Fetch sender profiles for avatars
      const uniqueSenderIds = Array.from(
        new Set(
          notifications
            .map((n) => n.sender_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      );
      if (uniqueSenderIds.length > 0) {
        const { data: usersData, error: usersErr } = await supabase
          .from('users')
          .select('id, full_name, avatar_url')
          .in('id', uniqueSenderIds);
        if (usersErr) throw usersErr;
        const map: Record<string, { id: string; full_name?: string; avatar_url?: string }> = {};
        (usersData || []).forEach((u: any) => { map[u.id] = u; });
        setSendersById(map);
      } else {
        setSendersById({});
      }

      // Fetch apartments referenced by notifications (using embedded metadata)
      const aptIds = Array.from(
        new Set(
          notifications
            .map((n) => extractInviteApartmentId(n.description))
            .filter((aptId): aptId is string => typeof aptId === 'string' && aptId.length > 0)
        )
      );
      if (aptIds.length > 0) {
        const { data: apts, error: aptsErr } = await supabase
          .from('apartments')
          .select('id, title, city, image_urls')
          .in('id', aptIds);
        if (aptsErr) throw aptsErr;
        const aMap: Record<string, any> = {};
        (apts || []).forEach((a: any) => { aMap[a.id] = a; });
        setApartmentsById(aMap);
      } else {
        setApartmentsById({});
      }

      // Mark all as read once fetched
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', user.id);
    } catch (e) {
      console.error('Failed to load notifications', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const extractInviteApartmentId = (description: string): string | null => {
    if (!description) return null;
    const parts = description.split('---');
    if (parts.length < 2) return null;
    const meta = parts[1] || '';
    const match = meta.match(/(?:INVITE_APT|APPROVED_APT):([A-Za-z0-9-]+)/);
    return match ? match[1] : null;
  };

  const isInviteApproved = (description: string): boolean => {
    if (!description) return false;
    const parts = description.split('---');
    if (parts.length < 2) return false;
    const meta = parts[1] || '';
    return /STATUS:APPROVED/.test(meta) || /APPROVED_APT:/.test(meta);
  };

  const displayDescription = (description: string): string => {
    if (!description) return '';
    const parts = description.split('---');
    return (parts[0] || '').trim();
  };

  const handleApproveInvite = async (notification: Notification, apartmentId: string) => {
    if (!user?.id) return;
    try {
      setActionLoadingId(notification.id);
      const { data: apt, error: aptErr } = await supabase
        .from('apartments')
        .select('id, partner_ids, owner_id')
        .eq('id', apartmentId)
        .maybeSingle();
      if (aptErr) throw aptErr;
      if (!apt) throw new Error('הדירה לא נמצאה');

      const currentPartnerIds: string[] = Array.isArray((apt as any).partner_ids)
        ? ((apt as any).partner_ids as string[])
        : [];
      if (currentPartnerIds.includes(user.id)) {
        // Already a partner; just remove the notification
        const approvedTitle = 'אושר צירוף לדירה';
        const approvedDesc = `אישרת את הבקשה להיות שותף בדירה\n---\nINVITE_APT:${apartmentId}\nSTATUS:APPROVED`;
        await supabase.from('notifications').update({ title: approvedTitle, description: approvedDesc, is_read: true }).eq('id', notification.id);
        await fetchNotifications();
        Alert.alert('הצלחה', 'כבר הוספת לדירה');
        return;
      }

      const newPartnerIds = Array.from(new Set([...(currentPartnerIds || []), user.id]));
      const { error: updateErr } = await supabase
        .from('apartments')
        .update({ partner_ids: newPartnerIds })
        .eq('id', apartmentId);
      if (updateErr) throw updateErr;

      // Update notification in-place to reflect approval and hide the button
      const approvedTitle = 'אושר צירוף לדירה';
      const approvedDesc = `אישרת את הבקשה להיות שותף בדירה\n---\nINVITE_APT:${apartmentId}\nSTATUS:APPROVED`;
      const { error: updNotifErr } = await supabase
        .from('notifications')
        .update({ title: approvedTitle, description: approvedDesc, is_read: true })
        .eq('id', notification.id);
      if (updNotifErr) throw updNotifErr;

      // Notify original sender that the invite was approved
      try {
        const { data: me } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        const approverName = (me as any)?.full_name || 'משתמש';
        const backTitle = 'שותף אישר להצטרף';
        const backDesc = `${approverName} אישר להצטרף לדירה${(apt as any)?.title ? `: ${(apt as any).title}` : ''}${(apt as any)?.city ? ` (${(apt as any).city})` : ''}\n---\nAPPROVED_APT:${apartmentId}\nSTATUS:APPROVED`;
        await supabase.from('notifications').insert({
          sender_id: user.id,
          recipient_id: notification.sender_id,
          title: backTitle,
          description: backDesc,
        });
      } catch {}

      await fetchNotifications();
      Alert.alert('הצלחה', 'אושרת והוספת כשותף לדירה');
    } catch (e: any) {
      console.error('Approve invite failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לאשר את ההזמנה');
    } finally {
      setActionLoadingId(null);
    }
  };

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
        <Text style={styles.headerTitle}>התראות</Text>
        <View style={styles.iconBtnPlaceholder} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#7C5CFF" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C5CFF" />
          }
          contentContainerStyle={[
            styles.listContent,
            items.length === 0 ? { flex: 1, justifyContent: 'center' } : null,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                <Bell size={28} color="#9DA4AE" />
              </View>
              <Text style={styles.emptyText}>אין התראות להצגה</Text>
              <Text style={styles.emptySubtext}>כשתתקבלנה התראות חדשות הן יופיעו כאן</Text>
            </View>
          }
          renderItem={({ item }) => {
            const sender = sendersById[item.sender_id];
            const aptId = extractInviteApartmentId(item.description);
            const apt = aptId ? apartmentsById[aptId] : undefined;
            const aptImage = apt
              ? (Array.isArray(apt.image_urls) && apt.image_urls.length ? apt.image_urls[0] : APT_PLACEHOLDER)
              : null;
            return (
              <View style={styles.rowRtl}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.bubble}
                  onPress={() => {
                    if (aptId) {
                      router.push({ pathname: '/apartment/[id]', params: { id: aptId } });
                    }
                  }}
                >
                  <View style={styles.bubbleInner}>
                    {aptImage ? (
                      <View style={styles.thumbWrap}>
                        <Image source={{ uri: aptImage }} style={styles.thumbImg} />
                      </View>
                    ) : null}
                    <View style={styles.bubbleTextArea}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                      {!!sender?.full_name && (
                        <Text style={styles.senderName} numberOfLines={1}>{sender.full_name}</Text>
                      )}
                      <Text style={styles.cardDesc} numberOfLines={2}>{displayDescription(item.description)}</Text>
                      <Text style={styles.cardMeta}>
                        {new Date(item.created_at).toLocaleString()}
                      </Text>
                      {aptId && !isInviteApproved(item.description) ? (
                        <View style={styles.actionsRow}>
                          <TouchableOpacity
                            style={[
                              styles.approveBtn,
                              actionLoadingId === item.id ? styles.approveBtnDisabled : null,
                            ]}
                            activeOpacity={0.85}
                            disabled={actionLoadingId === item.id}
                            onPress={() => handleApproveInvite(item, aptId)}
                          >
                            <Text style={styles.approveBtnText}>
                              {actionLoadingId === item.id ? 'מאשר...' : 'אישור'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.avatarRing}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (sender?.id) {
                      router.push({ pathname: '/user/[id]', params: { id: sender.id } });
                    }
                  }}
                >
                  <View style={styles.avatarShadow} />
                  <View style={styles.avatarWrap}>
                    <Image
                      source={{ uri: sender?.avatar_url || DEFAULT_AVATAR }}
                      style={styles.avatarImg}
                    />
                  </View>
                </TouchableOpacity>
              </View>
            );
          }}
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
    gap: 10 as any,
  },
  emptyContainer: {
    alignItems: 'center',
    gap: 10 as any,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 6,
  },
  emptyText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtext: {
    color: '#9DA4AE',
    fontSize: 13,
  },
  rowRtl: {
    position: 'relative',
    flexDirection: 'row',
    gap: 12 as any,
    alignItems: 'center',
    paddingRight: 70,
  },
  bubble: {
    flex: 1,
    backgroundColor: '#15151C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  bubbleInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 14,
    gap: 12 as any,
  },
  bubbleTextArea: {
    flex: 1,
    alignItems: 'flex-end',
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
  avatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124,92,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124,92,255,0.35)',
    position: 'absolute',
    right: 0,
  },
  avatarShadow: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(0,0,0,0.20)',
    top: 3,
    left: 3,
    right: 3,
    bottom: 3,
    opacity: 0.35,
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
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  senderName: {
    color: '#E6E9F0',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
    textAlign: 'right',
  },
  cardDesc: {
    color: '#C9CDD6',
    fontSize: 14,
    textAlign: 'right',
  },
  cardMeta: {
    color: '#9DA4AE',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8 as any,
    marginTop: 10,
  },
  approveBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  approveBtnDisabled: {
    opacity: 0.7,
  },
  approveBtnText: {
    color: '#0F0F14',
    fontSize: 14,
    fontWeight: '800',
  },
});


