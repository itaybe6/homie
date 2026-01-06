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
import { ArrowLeft, Inbox, Send, UserPlus2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { User } from '@/types/database';
import { computeGroupAwareLabel } from '@/lib/group';
import { insertNotificationOnce } from '@/lib/notifications';

type StatusFilterValue = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'NOT_RELEVANT';

type UnifiedItem = {
  id: string;
  sender_id: string; // inviter_id
  recipient_id: string; // invitee_id
  created_at: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'NOT_RELEVANT';
  _sender_group_id?: string | null; // inviter's group
};

export default function GroupRequestsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [tab, setTab] = useState<'incoming' | 'sent'>('incoming');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('ALL');

  const [received, setReceived] = useState<UnifiedItem[]>([]);
  const [sent, setSent] = useState<UnifiedItem[]>([]);

  const [usersById, setUsersById] = useState<Record<string, Partial<User>>>({});
  const [groupMembersByGroupId, setGroupMembersByGroupId] = useState<Record<string, string[]>>({});

  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const MAX_GROUP_MEMBERS = 4;

  const mapGroupStatus = (status: string | null | undefined): UnifiedItem['status'] => {
    const s = (status || '').toUpperCase();
    if (s === 'PENDING' || s === 'WAITING') return 'PENDING';
    if (s === 'ACCEPTED' || s === 'ACCEPT' || s === 'APPROVED' || s === 'CONFIRMED') return 'APPROVED';
    if (s === 'DECLINED' || s === 'REJECTED' || s === 'DENIED') return 'REJECTED';
    if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED';
    if (s === 'EXPIRED' || s === 'NOT_RELEVANT' || s === 'IRRELEVANT') return 'NOT_RELEVANT';
    return 'PENDING';
  };

  useEffect(() => {
    fetchAll();
  }, [user?.id]);

  const fetchAll = async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      setLoading(true);
      // 1) My active group ids
      const { data: myMemberships } = await supabase
        .from('profile_group_members')
        .select('group_id')
        .eq('user_id', user.id)
        .eq('status', 'ACTIVE');
      const myGroupIds = (myMemberships || []).map((r: any) => r.group_id as string);

      // 2) Core queries
      const [
        { data: gSent, error: gSErr },
        { data: gRecvSelf, error: gRErr },
      ] = await Promise.all([
        supabase.from('profile_group_invites').select('*').eq('inviter_id', user.id).order('created_at', { ascending: false }),
        supabase.from('profile_group_invites').select('*').eq('invitee_id', user.id).order('created_at', { ascending: false }),
      ]);
      if (gSErr) throw gSErr;
      if (gRErr) throw gRErr;

      // 3) Additional incoming: invites to any ACTIVE member of my groups
      let gRecvForMyGroups: any[] = [];
      try {
        if (myGroupIds.length) {
          const { data: myGroupMembers } = await supabase
            .from('profile_group_members')
            .select('user_id')
            .eq('status', 'ACTIVE')
            .in('group_id', myGroupIds);
          const myGroupmateIds = Array.from(
            new Set(((myGroupMembers || []) as any[]).map((r: any) => r.user_id).filter(Boolean))
          );
          if (myGroupmateIds.length) {
            const { data: invitesToGroupmates } = await supabase
              .from('profile_group_invites')
              .select('*')
              .in('invitee_id', myGroupmateIds)
              .order('created_at', { ascending: false });
            gRecvForMyGroups = (invitesToGroupmates || []) as any[];
          }
        }
      } catch {
        gRecvForMyGroups = [];
      }

      // 4) Normalize
      const groupSent: UnifiedItem[] = (gSent || []).map((row: any) => ({
        id: row.id,
        sender_id: row.inviter_id,
        recipient_id: row.invitee_id,
        status: mapGroupStatus(row.status),
        created_at: row.created_at,
        _sender_group_id: row.group_id,
      }));
      const groupRecvRaw = (() => {
        const map: Record<string, any> = {};
        ([(gRecvSelf || []), gRecvForMyGroups] as any[]).flat().forEach((row: any) => {
          if (row?.id && !map[row.id]) map[row.id] = row;
        });
        return Object.values(map);
      })();
      const groupRecv: UnifiedItem[] = (groupRecvRaw || []).map((row: any) => ({
        id: row.id,
        sender_id: row.inviter_id,
        recipient_id: row.invitee_id,
        status: mapGroupStatus(row.status),
        created_at: row.created_at,
        _sender_group_id: row.group_id,
      }));

      // 5) Enrich members for groups we need to render
      const groupIds = Array.from(
        new Set<string>([
          ...groupSent.map((r) => r._sender_group_id).filter(Boolean) as string[],
          ...groupRecv.map((r) => r._sender_group_id).filter(Boolean) as string[],
        ])
      );
      let groupIdToMemberIds: Record<string, string[]> = {};
      if (groupIds.length) {
        const { data: members } = await supabase
          .from('profile_group_members')
          .select('group_id, user_id')
          .eq('status', 'ACTIVE')
          .in('group_id', groupIds);
        (members || []).forEach((m: any) => {
          if (!groupIdToMemberIds[m.group_id]) groupIdToMemberIds[m.group_id] = [];
          groupIdToMemberIds[m.group_id].push(m.user_id);
        });
      }
      setGroupMembersByGroupId(groupIdToMemberIds);

      // 6) Fetch users (inviter, invitee, and group members)
      const userIds = Array.from(new Set([
        ...groupSent.map((r) => r.recipient_id),
        ...groupRecv.map((r) => r.sender_id),
        ...Object.values(groupIdToMemberIds).flat(),
      ].filter(Boolean) as string[]));
      if (userIds.length) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, full_name, avatar_url, phone')
          .in('id', userIds);
        const map: Record<string, Partial<User>> = {};
        (usersData || []).forEach((u: any) => { map[u.id] = u; });
        setUsersById(map);
      } else {
        setUsersById({});
      }

      setSent(groupSent.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
      setReceived(groupRecv.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load group requests', e);
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

  const approveIncomingGroup = async (item: UnifiedItem) => {
    if (!user?.id) return;
    try {
      setActionId(item.id);
      // 1) Load invite (holds inviter_id, invitee_id, and optional inviter group_id)
      const { data: invite, error: inviteErr } = await supabase
        .from('profile_group_invites')
        .select('id, group_id, invitee_id, inviter_id, status')
        .eq('id', item.id)
        .maybeSingle();
      if (inviteErr) throw inviteErr;
      if (!invite) throw new Error('הזמנה לא נמצאה');
      const inviterId = (invite as any).inviter_id as string;
      const inviteeId = (invite as any).invitee_id as string;

      // 2) Determine ACTIVE group ids (before accepting, so we can enforce capacity)
      const [{ data: meGroupRow }, { data: inviterGroupRow }] = await Promise.all([
        supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE')
          .maybeSingle(),
        supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', inviterId)
          .eq('status', 'ACTIVE')
          .maybeSingle(),
      ]);
      const approverGroupId = (meGroupRow as any)?.group_id as string | undefined;
      let inviterGroupId = (inviterGroupRow as any)?.group_id as string | undefined;

      // Detect a "solo" temporary inviter group
      let inviterSoloGroupId: string | undefined;
      if (inviterGroupId) {
        try {
          const { data: inviterGroupMembers } = await supabase
            .from('profile_group_members')
            .select('user_id')
            .eq('group_id', inviterGroupId)
            .eq('status', 'ACTIVE');
          const members = (inviterGroupMembers || []) as any[];
          if (members.length === 1 && members[0]?.user_id === inviterId) {
            inviterSoloGroupId = inviterGroupId;
          }
        } catch {
          inviterSoloGroupId = undefined;
        }
      }
      if (inviterSoloGroupId) {
        try { await supabase.from('profile_group_members').delete().eq('group_id', inviterSoloGroupId); } catch {}
        try { await supabase.from('profile_group_invites').delete().eq('group_id', inviterSoloGroupId); } catch {}
        try { await supabase.from('profile_groups').delete().eq('id', inviterSoloGroupId); } catch {}
        inviterGroupId = undefined;
      }

      // 3) Capacity guard (max 4 members in the resulting shared profile)
      try {
        const getMembers = async (gid?: string) => {
          if (!gid) return [];
          const { data } = await supabase
            .from('profile_group_members')
            .select('user_id')
            .eq('group_id', gid)
            .eq('status', 'ACTIVE');
          return (data || []).map((r: any) => String(r?.user_id || '').trim()).filter(Boolean);
        };
        const memberSet = new Set<string>();
        // Always include the two "parties" of the invite and the approver (covers "invite to groupmate" cases).
        [inviterId, inviteeId, user.id].forEach((id) => id && memberSet.add(String(id)));
        (await getMembers(approverGroupId)).forEach((id) => memberSet.add(id));
        (await getMembers(inviterGroupId)).forEach((id) => memberSet.add(id));
        if (memberSet.size > MAX_GROUP_MEMBERS) {
          Alert.alert(
            'לא ניתן לאשר',
            `אישור הבקשה ייצור פרופיל משותף עם ${memberSet.size} משתמשים. המקסימום הוא ${MAX_GROUP_MEMBERS}.`
          );
          return;
        }
      } catch {
        // If capacity check fails (RLS/network), fall back to previous behavior.
      }

      // 4) Accept the invite
      await supabase
        .from('profile_group_invites')
        .update({ status: 'ACCEPTED', responded_at: new Date().toISOString() })
        .eq('id', item.id);
      
      // 5) Execute scenario
      let finalGroupId: string | undefined;
      if (approverGroupId && !inviterGroupId) {
        const insertRes = await supabase
          .from('profile_group_members')
          .insert([{ group_id: approverGroupId, user_id: inviterId, status: 'ACTIVE' } as any], {
            onConflict: 'group_id,user_id',
            ignoreDuplicates: true,
          } as any);
        if ((insertRes as any)?.error) {
          try {
            await supabase.from('profile_group_invites').insert({
              inviter_id: user.id,
              invitee_id: inviterId,
              group_id: approverGroupId,
              status: 'PENDING',
            } as any, { ignoreDuplicates: true } as any);
          } catch {}
        }
        setReceived((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: 'APPROVED' } as any : r)));
        finalGroupId = approverGroupId;
      } else if (!approverGroupId && inviterGroupId) {
        const insertRes = await supabase
          .from('profile_group_members')
          .insert([{ group_id: inviterGroupId, user_id: inviteeId, status: 'ACTIVE' } as any], {
            onConflict: 'group_id,user_id',
            ignoreDuplicates: true,
          } as any);
        if ((insertRes as any)?.error) {
          try {
            await supabase.from('profile_group_invites').insert({
              inviter_id: user.id,
              invitee_id: inviteeId,
              group_id: inviterGroupId,
              status: 'PENDING',
            } as any, { ignoreDuplicates: true } as any);
          } catch {}
        }
        setReceived((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: 'APPROVED' } as any : r)));
        finalGroupId = inviterGroupId;
      } else if (!approverGroupId && !inviterGroupId) {
        const { data: created } = await supabase
          .from('profile_groups')
          .insert({ created_by: user.id, name: 'שותפים', status: 'ACTIVE' } as any)
          .select('id')
          .single();
        const newGroupId = (created as any)?.id as string;
        if (newGroupId) {
          await supabase
            .from('profile_group_members')
            .insert(
              [
                { group_id: newGroupId, user_id: inviterId, status: 'ACTIVE' },
                { group_id: newGroupId, user_id: inviteeId, status: 'ACTIVE' },
              ] as any[],
              { onConflict: 'group_id,user_id', ignoreDuplicates: true } as any
            );
        }
        setReceived((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: 'APPROVED' } as any : r)));
        finalGroupId = newGroupId;
      } else if (approverGroupId && inviterGroupId && approverGroupId !== inviterGroupId) {
        const [approverMembersRes, inviterMembersRes] = await Promise.all([
          supabase
            .from('profile_group_members')
            .select('user_id')
            .eq('group_id', approverGroupId)
            .eq('status', 'ACTIVE'),
          supabase
            .from('profile_group_members')
            .select('user_id')
            .eq('group_id', inviterGroupId)
            .eq('status', 'ACTIVE'),
        ]);
        const memberSet = new Set<string>();
        (approverMembersRes.data || []).forEach((row: any) => row?.user_id && memberSet.add(row.user_id));
        (inviterMembersRes.data || []).forEach((row: any) => row?.user_id && memberSet.add(row.user_id));
        memberSet.add(inviterId);
        memberSet.add(inviteeId);
        memberSet.add(user.id);
        const allMemberIds = Array.from(memberSet);

        const { data: newGroupRow, error: newGroupErr } = await supabase
          .from('profile_groups')
          .insert({ created_by: user.id, name: 'שותפים', status: 'ACTIVE' } as any)
          .select('id')
          .single();
        if (newGroupErr) throw newGroupErr;
        const newGroupId = (newGroupRow as any)?.id as string;

        const groupsToMerge = [approverGroupId, inviterGroupId].filter(Boolean) as string[];
        if (groupsToMerge.length) {
          await supabase
            .from('profile_group_members')
            .update({ status: 'LEFT' } as any)
            .in('group_id', groupsToMerge as any)
            .eq('status', 'ACTIVE');
        }
        if (allMemberIds.length) {
          const { error: memberInsertErr } = await supabase
            .from('profile_group_members')
            .insert(
              allMemberIds.map((uid) => ({ group_id: newGroupId, user_id: uid, status: 'ACTIVE' })) as any[],
              { onConflict: 'group_id,user_id', ignoreDuplicates: true } as any
            );
          if (memberInsertErr) throw memberInsertErr;
        }
        try {
          if (groupsToMerge.length) {
            await supabase.from('profile_group_invites').delete().in('group_id', groupsToMerge as any);
          }
        } catch {}
        try {
          if (groupsToMerge.length) {
            await supabase.from('profile_group_members').delete().in('group_id', groupsToMerge as any);
          }
        } catch {}
        try {
          if (groupsToMerge.length) {
            await supabase.from('profile_groups').delete().in('id', groupsToMerge as any);
          }
        } catch {}
        setReceived((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: 'APPROVED' } as any : r)));
        finalGroupId = newGroupId;
      }

      // Notify inviter
      try {
        const approverName = await computeGroupAwareLabel(user.id);
        await insertNotificationOnce({
          sender_id: user.id,
          recipient_id: item.sender_id,
          title: 'אישרת מיזוג פרופילים',
          description: `${approverName} אישר/ה את בקשת מיזוג הפרופילים.`,
          is_read: false,
          event_key: `profile_merge:${item.id}:approved`,
        });
      } catch {}

      await fetchAll();
      Alert.alert('הצלחה', 'אושרת להצטרף לקבוצה');
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('approve group invite failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לאשר את הבקשה');
    } finally {
      setActionId(null);
    }
  };

  const rejectIncomingGroup = async (item: UnifiedItem) => {
    if (!user?.id) return;
    try {
      setActionId(item.id);
      await supabase
        .from('profile_group_invites')
        .update({ status: 'DECLINED', responded_at: new Date().toISOString() })
        .eq('id', item.id);
      setReceived((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, status: 'REJECTED' } as any : r))
      );
      // Clean up inviter's temporary solo group if exists
      try {
        const inviterId = item.sender_id;
        if (inviterId) {
          const { data: inviterMembership } = await supabase
            .from('profile_group_members')
            .select('group_id')
            .eq('user_id', inviterId)
            .eq('status', 'ACTIVE')
            .maybeSingle();
          const inviterGroupId = (inviterMembership as any)?.group_id as string | undefined;
          if (inviterGroupId) {
            const { data: members } = await supabase
              .from('profile_group_members')
              .select('user_id')
              .eq('group_id', inviterGroupId)
              .eq('status', 'ACTIVE');
            if ((members || []).length === 1 && (members || [])[0]?.user_id === inviterId) {
              await supabase.from('profile_group_members').delete().eq('group_id', inviterGroupId);
              await supabase.from('profile_group_invites').delete().eq('group_id', inviterGroupId);
              await supabase.from('profile_groups').delete().eq('id', inviterGroupId);
            }
          }
        }
      } catch {}
      await fetchAll();
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('reject group invite failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לדחות את הבקשה');
    } finally {
      setActionId(null);
    }
  };

  const StatusPill = ({ status }: { status: UnifiedItem['status'] }) => {
    const config: Record<UnifiedItem['status'], { bg: string; color: string; text: string }> = {
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

  const applyStatus = (arr: UnifiedItem[]) => arr.filter((r) => (statusFilter === 'ALL' ? true : r.status === statusFilter));
  const filteredReceived = applyStatus(received);
  const filteredSent = applyStatus(sent);

  const Section = ({ title, data, incoming }: { title: string; data: UnifiedItem[]; incoming?: boolean }) => (
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
            const senderGroupId = item._sender_group_id as string | undefined;
            const groupMemberIds = senderGroupId ? (groupMembersByGroupId[senderGroupId] || []) : [];
            const groupMembers = groupMemberIds.map((id) => usersById[id]).filter(Boolean) as Partial<User>[];
            return (
              <View style={styles.card}>
                <View style={styles.cardInner}>
                  {groupMembers.length ? (
                    (() => {
                      const gridMembers = groupMembers.slice(0, 4);
                      if (gridMembers.length === 1) {
                        return (
                          <View style={styles.thumbWrap}>
                            <Image
                              source={{ uri: gridMembers[0]?.avatar_url || DEFAULT_AVATAR }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="cover"
                            />
                          </View>
                        );
                      }
                      const isThree = gridMembers.length === 3;
                      const rows = isThree ? 1 : Math.ceil(gridMembers.length / 2);
                      const cellHeightPct = rows === 1 ? '100%' : (`${100 / rows}%` as any);
                      const cellWidthPct = isThree ? '33.3333%' : '50%';
                      return (
                        <View style={styles.thumbWrap}>
                          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                            {gridMembers.map((gm, idx) => (
                              <View key={idx} style={{ width: cellWidthPct, height: cellHeightPct, padding: 1 }}>
                                <Image
                                  source={{ uri: gm.avatar_url || DEFAULT_AVATAR }}
                                  style={{ width: '100%', height: '100%' }}
                                  resizeMode="cover"
                                />
                              </View>
                            ))}
                          </View>
                        </View>
                      );
                    })()
                  ) : (
                    <View style={styles.thumbWrap}>
                      <Image
                        source={{ uri: otherUser?.avatar_url || DEFAULT_AVATAR }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    </View>
                  )}

                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      בקשת מיזוג פרופילים
                    </Text>
                    {groupMembers.length ? (
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {groupMembers.map((m) => m.full_name).filter(Boolean).join(' • ')}
                      </Text>
                    ) : !!otherUser?.full_name ? (
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {otherUser.full_name}
                      </Text>
                    ) : null}

                    <View style={{ marginTop: 10, flexDirection: 'row-reverse', gap: 8 as any }}>
                      <StatusPill status={item.status} />
                      {incoming && item.status === 'PENDING' && (
                        <View style={{ flexDirection: 'row-reverse', gap: 8 as any }}>
                          <TouchableOpacity
                            style={[styles.approveBtn, actionId === item.id && { opacity: 0.7 }]}
                            onPress={() => approveIncomingGroup(item)}
                            disabled={actionId === item.id}
                            activeOpacity={0.85}
                          >
                            {actionId === item.id ? <ActivityIndicator size="small" color="#0F0F14" /> : <Text style={styles.approveBtnText}>אישור</Text>}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.rejectBtn, actionId === item.id && { opacity: 0.7 }]}
                            onPress={() => rejectIncomingGroup(item)}
                            disabled={actionId === item.id}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.rejectBtnText}>דחייה</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                    {!!item.created_at ? (
                      <Text style={styles.cardMeta}>{new Date(item.created_at).toLocaleString()}</Text>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={styles.avatarWrap}
                    activeOpacity={0.85}
                    onPress={() => {
                      const id = incoming ? item.sender_id : item.recipient_id;
                      if (id) router.push({ pathname: '/user/[id]', params: { id } });
                    }}
                  >
                    {groupMembers.length ? (
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
                      <Image source={{ uri: otherUser?.avatar_url || DEFAULT_AVATAR }} style={styles.avatarImg} />
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconBtnPlaceholder} />
        <Text style={styles.headerTitle}>בקשות מיזוג פרופילים</Text>
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
                  : key === 'REJECTED'
                  ? 'נדחה'
                  : 'בוטל'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#5e3f2d" />
        </View>
      ) : (
        <FlatList
          data={[{ key: tab }]}
          keyExtractor={(i) => i.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5e3f2d" />}
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
  thumbWrap: {
    width: 96,
    height: 96,
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





