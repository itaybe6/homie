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
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Inbox, Send } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { User } from '@/types/database';
import { computeGroupAwareLabel } from '@/lib/group';

type MatchStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'NOT_RELEVANT';

type UnifiedMatchItem = {
  id: string;
  kind: 'MATCH';
  sender_id: string;
  recipient_id: string | null;
  created_at: string;
  status: MatchStatus;
  _receiver_group_id?: string | null;
  _sender_group_id?: string | null;
};

export default function MatchRequestsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sent, setSent] = useState<UnifiedMatchItem[]>([]);
  const [received, setReceived] = useState<UnifiedMatchItem[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [tab, setTab] = useState<'incoming' | 'sent'>('incoming');
  const [statusFilter, setStatusFilter] = useState<'ALL' | MatchStatus>('ALL');

  const [usersById, setUsersById] = useState<Record<string, Partial<User>>>({});
  const [groupMembersByGroupId, setGroupMembersByGroupId] = useState<Record<string, string[]>>({});

  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';

  const mapMatchStatus = (status: string | null | undefined): MatchStatus => {
    const normalized = (status || '').trim();
    switch (normalized) {
      case 'APPROVED':
      case 'אושר':
        return 'APPROVED';
      case 'REJECTED':
      case 'נדחה':
        return 'REJECTED';
      case 'NOT_RELEVANT':
      case 'IRRELEVANT':
      case 'לא רלוונטי':
        return 'NOT_RELEVANT';
      case 'CANCELLED':
      case 'בוטל':
        return 'CANCELLED';
      case 'PENDING':
      case 'ממתין':
      default:
        return 'PENDING';
    }
  };

  useEffect(() => {
    fetchAll();
  }, [user?.id]);

  const fetchAll = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      // eslint-disable-next-line no-console
      console.log('[match-requests] fetchAll start', { userId: user.id });
      // Local accumulator to avoid state write-read races inside a single fetch
      const collectedGroupMembers: Record<string, string[]> = {};
      // My active group ids (for incoming group-targeted matches)
      const { data: myMemberships } = await supabase
        .from('profile_group_members')
        .select('group_id')
        .eq('user_id', user.id)
        .eq('status', 'ACTIVE');
      const myGroupIds = (myMemberships || []).map((r: any) => r.group_id as string);
      // eslint-disable-next-line no-console
      console.log('[match-requests] myGroupIds', myGroupIds);

      const [
        { data: mSent, error: mSErr },
        { data: mRecv, error: mRErr },
        groupRecvResult,
      ] = await Promise.all([
        supabase.from('matches').select('*').eq('sender_id', user.id).order('created_at', { ascending: false }),
        supabase.from('matches').select('*').eq('receiver_id', user.id).order('created_at', { ascending: false }),
        myGroupIds.length
          ? supabase.from('matches').select('*').in('receiver_group_id', myGroupIds).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (mSErr) throw mSErr;
      if (mRErr) throw mRErr;
      const mRecvGroup = (groupRecvResult as any)?.data || [];
      // eslint-disable-next-line no-console
      console.log('[match-requests] base queries', {
        sentCount: (mSent || []).length,
        recvCount: (mRecv || []).length,
        recvGroupCount: (mRecvGroup || []).length,
      });

      let matchSent: UnifiedMatchItem[] = (mSent || [])
        .filter((row: any) => mapMatchStatus(row.status) !== 'NOT_RELEVANT')
        .map((row: any) => ({
          id: row.id,
          kind: 'MATCH',
          sender_id: row.sender_id,
          recipient_id: row.receiver_id,
          status: mapMatchStatus(row.status),
          created_at: row.created_at,
          _receiver_group_id: row.receiver_group_id,
        }));

      let matchRecv: UnifiedMatchItem[] = (mRecv || [])
        .filter((row: any) => mapMatchStatus(row.status) !== 'NOT_RELEVANT')
        .map((row: any) => ({
          id: row.id,
          kind: 'MATCH',
          sender_id: row.sender_id,
          recipient_id: row.receiver_id,
          status: mapMatchStatus(row.status),
          created_at: row.created_at,
        }));

      // Enrich incoming matches where sender belongs to a merged profile (sender's group)
      const incomingSenderIds = Array.from(new Set((mRecv || []).map((r: any) => r.sender_id).filter(Boolean)));
      let senderToGroupId: Record<string, string> = {};
      if (incomingSenderIds.length) {
        // eslint-disable-next-line no-console
        console.log('[match-requests] enriching incoming senders', { incomingSenderIds });
        const { data: sMemberships } = await supabase
          .from('profile_group_members')
          .select('user_id, group_id')
          .eq('status', 'ACTIVE')
          .in('user_id', incomingSenderIds);
        senderToGroupId = {};
        const senderGroupIds = new Set<string>();
        (sMemberships || []).forEach((m: any) => {
          senderToGroupId[m.user_id] = m.group_id;
          senderGroupIds.add(m.group_id);
        });
        // eslint-disable-next-line no-console
        console.log('[match-requests] senderToGroupId map', senderToGroupId);
        if (senderGroupIds.size) {
          const { data: sGroupMembers } = await supabase
            .from('profile_group_members')
            .select('group_id, user_id')
            .eq('status', 'ACTIVE')
            .in('group_id', Array.from(senderGroupIds));
          const gm: Record<string, string[]> = {};
          (sGroupMembers || []).forEach((m: any) => {
            if (!gm[m.group_id]) gm[m.group_id] = [];
            if (!gm[m.group_id].includes(m.user_id)) gm[m.group_id].push(m.user_id);
          });
          // accumulate locally; we'll merge once at the end of fetchAll
          Object.entries(gm).forEach(([gid, ids]) => {
            if (!collectedGroupMembers[gid]) collectedGroupMembers[gid] = [];
            ids.forEach((id) => {
              if (!collectedGroupMembers[gid].includes(id)) collectedGroupMembers[gid].push(id);
            });
          });
          // eslint-disable-next-line no-console
          console.log('[match-requests] merged incoming sender group members', gm);
        }
        matchRecv = matchRecv.map((row: any) => ({
          ...row,
          _sender_group_id: senderToGroupId[row.sender_id] || null,
        }));
      }

      // Incoming matches that target any of my groups
      const matchRecvFromGroups: UnifiedMatchItem[] = (mRecvGroup || [])
        .filter((row: any) => mapMatchStatus(row.status) !== 'NOT_RELEVANT')
        .map((row: any) => ({
          id: row.id,
          kind: 'MATCH',
          sender_id: row.sender_id,
          recipient_id: row.receiver_id,
          status: mapMatchStatus(row.status),
          created_at: row.created_at,
          _receiver_group_id: row.receiver_group_id,
        }));
      // eslint-disable-next-line no-console
      console.log('[match-requests] matchRecvFromGroups count', (matchRecvFromGroups || []).length);

      // Enrich SENT matches where the recipient belongs to a merged profile (show recipient's group)
      try {
        const sentRecipientIds = Array.from(
          new Set((mSent || []).map((r: any) => r?.receiver_id).filter(Boolean))
        ) as string[];
        if (sentRecipientIds.length) {
          // eslint-disable-next-line no-console
          console.log('[match-requests] enriching sent recipients', { sentRecipientIds });
          const { data: rMemberships } = await supabase
            .from('profile_group_members')
            .select('user_id, group_id')
            .eq('status', 'ACTIVE')
            .in('user_id', sentRecipientIds);
          const recvToGroupId: Record<string, string> = {};
          const recvGroupIds = new Set<string>();
          (rMemberships || []).forEach((m: any) => {
            recvToGroupId[m.user_id] = m.group_id;
            recvGroupIds.add(m.group_id);
          });
          // eslint-disable-next-line no-console
          console.log('[match-requests] recvToGroupId map', recvToGroupId);
          if (recvGroupIds.size) {
            const { data: rGroupMembers } = await supabase
              .from('profile_group_members')
              .select('group_id, user_id')
              .eq('status', 'ACTIVE')
              .in('group_id', Array.from(recvGroupIds));
            const gm: Record<string, string[]> = {};
            (rGroupMembers || []).forEach((m: any) => {
              if (!gm[m.group_id]) gm[m.group_id] = [];
              if (!gm[m.group_id].includes(m.user_id)) gm[m.group_id].push(m.user_id);
            });
          // accumulate locally; we'll merge once at the end of fetchAll
          Object.entries(gm).forEach(([gid, ids]) => {
            if (!collectedGroupMembers[gid]) collectedGroupMembers[gid] = [];
            ids.forEach((id) => {
              if (!collectedGroupMembers[gid].includes(id)) collectedGroupMembers[gid].push(id);
            });
          });
            // eslint-disable-next-line no-console
            console.log('[match-requests] merged recipient group members', gm);
          }
          // attach receiver group id to sent rows (for rendering)
          matchSent = matchSent.map((row: any) => ({
            ...row,
            _receiver_group_id: row._receiver_group_id || recvToGroupId[row.recipient_id as string] || null,
          }));
          // eslint-disable-next-line no-console
          console.log('[match-requests] matchSent after receiver group attach', matchSent.map((r) => ({ id: r.id, receiver_group: (r as any)?._receiver_group_id })));
        }
      } catch {
        // ignore enrichment failures
      }

      const sentUnified = [...matchSent].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const recvUnifiedRaw = [...matchRecv, ...matchRecvFromGroups].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      // Normalize display user for group-targeted matches by selecting a representative member
      const groupIdsForDisplay = Array.from(
        new Set<string>([
          ...((matchSent as any[]) || []).map((r: any) => r._receiver_group_id).filter(Boolean),
          ...((matchRecvFromGroups as any[]) || []).map((r: any) => r._receiver_group_id).filter(Boolean),
        ])
      );
      let groupIdToMemberIds: Record<string, string[]> = {};
      if (groupIdsForDisplay.length) {
        const { data: dispMembers } = await supabase
          .from('profile_group_members')
          .select('group_id, user_id')
          .eq('status', 'ACTIVE')
          .in('group_id', groupIdsForDisplay);
        (dispMembers || []).forEach((m: any) => {
          if (!groupIdToMemberIds[m.group_id]) groupIdToMemberIds[m.group_id] = [];
          groupIdToMemberIds[m.group_id].push(m.user_id);
        });
      }
      // Merge previously-known state (from earlier fetches) to preserve cache
      Object.entries(groupMembersByGroupId).forEach(([gid, ids]) => {
        if (!groupIdToMemberIds[gid]) groupIdToMemberIds[gid] = [];
        ids.forEach((id) => {
          if (!groupIdToMemberIds[gid].includes(id)) {
            groupIdToMemberIds[gid].push(id);
          }
        });
      });
      // Merge newly collected members from this fetch cycle
      Object.entries(collectedGroupMembers).forEach(([gid, ids]) => {
        if (!groupIdToMemberIds[gid]) groupIdToMemberIds[gid] = [];
        ids.forEach((id) => {
          if (!groupIdToMemberIds[gid].includes(id)) {
            groupIdToMemberIds[gid].push(id);
          }
        });
      });
      setGroupMembersByGroupId(groupIdToMemberIds);

      const pickGroupDisplayUser = (groupId?: string | null, excludeId?: string): string | undefined => {
        if (!groupId) return undefined;
        const ids = groupIdToMemberIds[groupId] || [];
        const candidate = ids.find((id) => id && id !== excludeId);
        return candidate || ids[0];
        };

      const normalizeSent = sentUnified.map((item: any) => {
        if (!item.recipient_id && item._receiver_group_id) {
          const displayUser = pickGroupDisplayUser(item._receiver_group_id, user.id);
          return { ...item, recipient_id: displayUser || item.sender_id };
        }
        return item;
      });
      const normalizeRecv = recvUnifiedRaw.map((item: any) => {
        if (!item.recipient_id && item._receiver_group_id) {
          const displayUser = pickGroupDisplayUser(item._receiver_group_id, user.id);
          return { ...item, recipient_id: displayUser || item.sender_id };
        }
        return item;
      });

      setSent(normalizeSent as any);
      setReceived(normalizeRecv as any);
      // eslint-disable-next-line no-console
      console.log('[match-requests] normalized', {
        sent: (normalizeSent || []).length,
        recv: (normalizeRecv || []).length,
        groupKeys: Object.keys(groupIdToMemberIds || {}),
      });

      const userIds = Array.from(
        new Set<string>([
          ...(normalizeSent as UnifiedMatchItem[]).map((r) => r.recipient_id || '').filter(Boolean) as string[],
          ...(normalizeRecv as UnifiedMatchItem[]).map((r) => r.sender_id || '').filter(Boolean) as string[],
          ...Object.values(groupIdToMemberIds).flat(),
        ])
      );
      if (userIds.length) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, avatar_url, phone')
          .in('id', userIds);
        const map: Record<string, Partial<User>> = {};
        (usersData || []).forEach((u: any) => {
          map[u.id] = u;
        });
        setUsersById(map);
        // eslint-disable-next-line no-console
        console.log('[match-requests] users loaded', Object.keys(map).length);
      } else {
        setUsersById({});
      }
    } catch (e) {
      console.error('Failed to load match requests', e);
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

  const openWhatsApp = async (phone: string, message: string) => {
    const DEFAULT_COUNTRY_CODE = '972'; // IL
    let raw = (phone || '').trim();
    if (!raw) {
      Alert.alert('שגיאה', 'מספר הטלפון לא זמין');
      return;
    }
    let digits = raw.startsWith('+') ? raw.slice(1).replace(/\D/g, '') : raw.replace(/\D/g, '');
    if (!digits) {
      Alert.alert('שגיאה', 'מספר הטלפון לא תקין');
      return;
    }
    if (!digits.startsWith(DEFAULT_COUNTRY_CODE)) {
      digits = DEFAULT_COUNTRY_CODE + digits.replace(/^0+/, '');
    }
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לפתוח את וואטסאפ');
    }
  };

  const approveIncomingMatch = async (match: UnifiedMatchItem) => {
    if (!user?.id) return;
    try {
      setActionId(match.id);
      await supabase.from('matches').update({ status: 'APPROVED', updated_at: new Date().toISOString() }).eq('id', match.id);
      const approverLabel = await computeGroupAwareLabel(user.id);
      await supabase.from('notifications').insert({
        sender_id: user.id,
        recipient_id: match.sender_id,
        title: 'בקשת ההתאמה אושרה',
        description: `${approverLabel} אישר/ה את בקשת ההתאמה שלך. ניתן להמשיך לשיחה ולתאם היכרות.`,
        is_read: false,
      });
      await fetchAll();
      setTab('incoming');
      setStatusFilter('APPROVED');
      Alert.alert('הצלחה', 'בקשת ההתאמה אושרה');
    } catch (e: any) {
      console.error('approve match request failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לאשר את ההתאמה');
    } finally {
      setActionId(null);
    }
  };

  const rejectIncomingMatch = async (match: UnifiedMatchItem) => {
    if (!user?.id) return;
    try {
      setActionId(match.id);
      await supabase.from('matches').update({ status: 'REJECTED', updated_at: new Date().toISOString() }).eq('id', match.id);
      const rejecterLabel = await computeGroupAwareLabel(user.id);
      await supabase.from('notifications').insert({
        sender_id: user.id,
        recipient_id: match.sender_id,
        title: 'בקשת ההתאמה נדחתה',
        description: `${rejecterLabel} דחה/תה את בקשת ההתאמה שלך. אפשר להמשיך ולחפש התאמות נוספות.`,
        is_read: false,
      });
      await fetchAll();
    } catch (e: any) {
      console.error('reject match request failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לדחות את ההתאמה');
    } finally {
      setActionId(null);
    }
  };

  const StatusPill = ({ status }: { status: MatchStatus }) => {
    const config: Record<MatchStatus, { bg: string; color: string; text: string }> = {
      PENDING: { bg: '#363649', color: '#E5E7EB', text: 'ממתין' },
      APPROVED: { bg: 'rgba(34,197,94,0.18)', color: '#22C55E', text: 'אושר' },
      REJECTED: { bg: 'rgba(248,113,113,0.18)', color: '#F87171', text: 'נדחה' },
      CANCELLED: { bg: 'rgba(148,163,184,0.18)', color: '#94A3B8', text: 'בוטל' },
      NOT_RELEVANT: { bg: 'rgba(148,163,184,0.18)', color: '#94A3B8', text: 'לא רלוונטי' },
    };
    const { bg, color, text } = config[status] || config.PENDING;
    return (
      <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
        <Text style={{ color, fontWeight: '900', fontSize: 12 }}>{text}</Text>
      </View>
    );
  };

  const Section = ({ title, data, incoming }: { title: string; data: UnifiedMatchItem[]; incoming?: boolean }) => (
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
            const otherUser = incoming ? usersById[item.sender_id] : (item.recipient_id ? usersById[item.recipient_id] : undefined);
            const receiverGroupId = (item as any)?._receiver_group_id as string | undefined;
            const senderGroupId = (item as any)?._sender_group_id as string | undefined;
            const isGroupMatch = !!receiverGroupId || (incoming && !!senderGroupId);
            const effectiveGroupId = receiverGroupId || (incoming ? senderGroupId : undefined);
            const groupMemberIds = effectiveGroupId ? (groupMembersByGroupId[effectiveGroupId] || []) : [];
            const groupMembers = groupMemberIds.map((id) => usersById[id]).filter(Boolean) as Partial<User>[];
            return (
              <View style={styles.card}>
                <View style={styles.cardInner}>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>בקשת התאמה</Text>
                    {(isGroupMatch && groupMembers.length) ? (
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {groupMembers.map((m) => m.full_name).filter(Boolean).join(' • ')}
                      </Text>
                    ) : !!otherUser?.full_name ? (
                      <Text style={styles.cardMeta}>משתמש: {otherUser.full_name}</Text>
                    ) : null}
                    <Text style={styles.cardMeta}>{new Date(item.created_at).toLocaleString()}</Text>
                    <View style={{ marginTop: 10, flexDirection: 'row-reverse', gap: 8 as any }}>
                      <StatusPill status={item.status} />
                      {incoming && item.status === 'PENDING' && (
                        <View style={{ flexDirection: 'row-reverse', gap: 8 as any }}>
                          <TouchableOpacity
                            style={[styles.approveBtn, actionId === item.id && { opacity: 0.7 }]}
                            onPress={() => approveIncomingMatch(item)}
                            disabled={actionId === item.id}
                            activeOpacity={0.85}
                          >
                            {actionId === item.id ? <ActivityIndicator size="small" color="#0F0F14" /> : <Text style={styles.approveBtnText}>אישור</Text>}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.rejectBtn, actionId === item.id && { opacity: 0.7 }]}
                            onPress={() => rejectIncomingMatch(item)}
                            disabled={actionId === item.id}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.rejectBtnText}>דחייה</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {incoming && item.status === 'APPROVED' && (
                        isGroupMatch && groupMembers.length ? (
                          <View style={{ marginTop: 12, alignItems: 'flex-end', gap: 6 as any }}>
                            <View style={{ width: '100%', flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 as any, justifyContent: 'flex-end' }}>
                              {groupMembers.map((m, idx) => {
                                const firstName = (m.full_name || '').split(' ')[0] || '';
                                return (
                                  <View
                                    key={idx}
                                    style={{
                                      flexBasis: '48%',
                                      flexGrow: 0,
                                      minWidth: 240,
                                      maxWidth: 360,
                                      backgroundColor: 'rgba(124,92,255,0.08)',
                                      borderRadius: 12,
                                      borderWidth: 1,
                                      borderColor: 'rgba(124,92,255,0.2)',
                                      padding: 12,
                                      gap: 10 as any,
                                    }}
                                  >
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 as any }}>
                                      <Image
                                        source={{ uri: m.avatar_url || DEFAULT_AVATAR }}
                                        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1F1F29', borderWidth: 2, borderColor: 'rgba(124,92,255,0.3)' }}
                                      />
                                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>{m.full_name}</Text>
                                        <Text style={{ color: '#C9CDD6', fontSize: 13, marginTop: 2 }}>{m.phone || 'מספר לא זמין'}</Text>
                                      </View>
                                    </View>
                                    {m.phone ? (
                                      <TouchableOpacity
                                        style={{
                                          flexDirection: 'row-reverse',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: 8 as any,
                                          backgroundColor: '#25D366',
                                          paddingVertical: 11,
                                          paddingHorizontal: 16,
                                          borderRadius: 10,
                                        }}
                                        activeOpacity={0.85}
                                        onPress={() =>
                                          openWhatsApp(
                                            m.phone as string,
                                            `היי${firstName ? ` ${firstName}` : ''}, אישרתי את בקשת ההתאמה ב-Homie. בוא/י נדבר ונראה אם יש התאמה!`
                                          )
                                        }
                                      >
                                        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>שלח הודעה בוואטסאפ</Text>
                                      </TouchableOpacity>
                                    ) : null}
                                  </View>
                                );
                              })}
                            </View>
                          </View>
                        ) : (
                          <View style={{ marginTop: 10, alignItems: 'flex-end', gap: 10 as any }}>
                            <View
                              style={{
                                width: '100%',
                                backgroundColor: 'rgba(124,92,255,0.08)',
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: 'rgba(124,92,255,0.2)',
                                padding: 12,
                                gap: 10 as any,
                              }}
                            >
                              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 as any }}>
                                <Image
                                  source={{ uri: otherUser?.avatar_url || DEFAULT_AVATAR }}
                                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1F1F29', borderWidth: 2, borderColor: 'rgba(124,92,255,0.3)' }}
                                />
                                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                  <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>{otherUser?.full_name || 'משתמש'}</Text>
                                  <Text style={{ color: '#C9CDD6', fontSize: 13, marginTop: 2 }}>{otherUser?.phone || 'מספר לא זמין'}</Text>
                                </View>
                              </View>
                              {otherUser?.phone ? (
                                <TouchableOpacity
                                  style={{
                                    flexDirection: 'row-reverse',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8 as any,
                                    backgroundColor: '#25D366',
                                    paddingVertical: 11,
                                    paddingHorizontal: 16,
                                    borderRadius: 10,
                                  }}
                                  activeOpacity={0.85}
                                  onPress={() =>
                                    openWhatsApp(
                                      otherUser.phone as string,
                                      `היי${otherUser?.full_name ? ` ${otherUser.full_name.split(' ')[0]}` : ''}, אישרתי את בקשת ההתאמה ב-Homie. בוא/י נדבר ונראה אם יש התאמה!`
                                    )
                                  }
                                >
                                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>שלח הודעה בוואטסאפ</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        )
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
                    {(isGroupMatch && groupMembers.length) ? (
                      (() => {
                        const gm = groupMembers.slice(0, 4);
                        if (gm.length === 1) {
                          const m = gm[0];
                          return (
                            <Image
                              source={{ uri: m?.avatar_url || DEFAULT_AVATAR }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="cover"
                            />
                          );
                        }
                        if (gm.length === 2) {
                          return (
                            <View style={{ flex: 1, flexDirection: 'row' }}>
                              {gm.map((m, idx) => (
                                <View key={idx} style={{ width: '50%', height: '100%' }}>
                                  <Image
                                    source={{ uri: m?.avatar_url || DEFAULT_AVATAR }}
                                    style={{ width: '100%', height: '100%' }}
                                    resizeMode="cover"
                                  />
                                </View>
                              ))}
                            </View>
                          );
                        }
                        return (
                          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                            {gm.map((m, idx) => (
                              <View key={idx} style={{ width: '50%', height: '50%' }}>
                                <Image
                                  source={{ uri: m?.avatar_url || DEFAULT_AVATAR }}
                                  style={{ width: '100%', height: '100%' }}
                                  resizeMode="cover"
                                />
                              </View>
                            ))}
                          </View>
                        );
                      })()
                    ) : (
                      <Image
                        source={{ uri: (incoming ? usersById[item.sender_id]?.avatar_url : (item.recipient_id ? usersById[item.recipient_id]?.avatar_url : undefined)) || DEFAULT_AVATAR }}
                        style={styles.avatarImg}
                      />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );

  const applyStatus = (arr: UnifiedMatchItem[]) => arr.filter((r) => (statusFilter === 'ALL' ? true : r.status === statusFilter));
  const filteredReceived = applyStatus(received);
  const filteredSent = applyStatus(sent);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {/* placeholder on the right to avoid overlap with global buttons */}
        <View style={styles.iconBtnPlaceholder} />
        <Text style={styles.headerTitle}>בקשות שותפים</Text>
        {/* move back button to the left side */}
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
          <ArrowLeft size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filtersWrap}>
        <View style={styles.segmentWrap}>
          <TouchableOpacity
            style={[styles.segmentBtn, tab === 'incoming' && styles.segmentBtnActive]}
            onPress={() => setTab('incoming')}
            activeOpacity={0.9}
          >
            <Inbox size={16} color={tab === 'incoming' ? '#FFFFFF' : '#C9CDD6'} />
            <Text style={[styles.segmentText, tab === 'incoming' && styles.segmentTextActive]}>בקשות אליי</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, tab === 'sent' && styles.segmentBtnActive]}
            onPress={() => setTab('sent')}
            activeOpacity={0.9}
          >
            <Send size={16} color={tab === 'sent' ? '#FFFFFF' : '#C9CDD6'} />
            <Text style={[styles.segmentText, tab === 'sent' && styles.segmentTextActive]}>בקשות שלי</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusChipsRow}>
          {(['ALL','PENDING','APPROVED','REJECTED'] as const).map((key) => (
            <TouchableOpacity
              key={key}
              onPress={() => setStatusFilter(key)}
              activeOpacity={0.9}
              style={[styles.statusChip, statusFilter === key && styles.statusChipActive]}
            >
              <Text style={[styles.statusChipText, statusFilter === key && styles.statusChipTextActive]}>
                {key === 'ALL'
                  ? 'הכל'
                  : key === 'PENDING'
                  ? 'ממתין'
                  : key === 'APPROVED'
                  ? 'אושר'
                  : 'נדחה'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#4C1D95" />
        </View>
      ) : (
        <FlatList
          data={[{ key: tab }]}
          keyExtractor={(i) => i.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4C1D95" />}
          renderItem={({ item }) => {
            if (item.key === 'incoming') {
              return <Section title="בקשות אליי" data={filteredReceived} incoming />;
            }
            return <Section title="הבקשות שלי" data={filteredSent} />;
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
  filtersWrap: {
    paddingHorizontal: 16,
    paddingBottom: 6,
    alignItems: 'flex-end',
  },
  segmentWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8 as any,
  },
  segmentBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8 as any,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  segmentBtnActive: {
    borderColor: 'rgba(124,92,255,0.55)',
    backgroundColor: 'rgba(124,92,255,0.10)',
  },
  segmentText: {
    color: '#C9CDD6',
    fontWeight: '800',
    fontSize: 13,
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  statusChipsRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8 as any,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statusChipActive: {
    borderColor: 'rgba(124,92,255,0.55)',
    backgroundColor: 'rgba(124,92,255,0.10)',
  },
  statusChipText: {
    color: '#C9CDD6',
    fontSize: 12,
    fontWeight: '800',
  },
  statusChipTextActive: {
    color: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 52,
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
  approveBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  approveBtnText: {
    color: '#22C55E',
    fontSize: 14,
    fontWeight: '800',
  },
  rejectBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.45)',
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



