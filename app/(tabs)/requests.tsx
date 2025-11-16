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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Inbox, Send, Filter, Home, Users, UserPlus2, UserPlus } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Apartment, User } from '@/types/database';
import { computeGroupAwareLabel } from '@/lib/group';

export default function RequestsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string | string[]; kind?: string | string[]; status?: string | string[] }>();
  const user = useAuthStore((s) => s.user);
  const toSingle = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;
  type KindFilterValue = 'APT' | 'APT_INVITE' | 'MATCH' | 'GROUP' | 'ALL';
  type StatusFilterValue = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'NOT_RELEVANT';
  const parseTabParam = (value?: string): 'incoming' | 'sent' =>
    value === 'sent' ? 'sent' : 'incoming';
  const parseKindParam = (value?: string): KindFilterValue => {
    if (value === 'MATCH' || value === 'ALL' || value === 'GROUP' || value === 'APT' || value === 'APT_INVITE') {
      return value as KindFilterValue;
    }
    return 'APT';
  };
  const parseStatusParam = (value?: string): StatusFilterValue => {
    switch (value) {
      case 'PENDING':
      case 'APPROVED':
      case 'REJECTED':
      case 'CANCELLED':
      case 'NOT_RELEVANT':
        return value;
      case 'ALL':
        return 'ALL';
      default:
        return 'ALL';
    }
  };
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  type UnifiedItem = {
    id: string;
    kind: 'APT' | 'APT_INVITE' | 'MATCH' | 'GROUP';
    sender_id: string;
    recipient_id: string;
    created_at: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'NOT_RELEVANT';
    apartment_id?: string | null;
    type?: string | null;
    // Internal enrichment fields (not persisted)
    _receiver_group_id?: string | null;
    _sender_group_id?: string | null;
  };
  const [sent, setSent] = useState<UnifiedItem[]>([]);
  const [received, setReceived] = useState<UnifiedItem[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [tab, setTab] = useState<'incoming' | 'sent'>(() => parseTabParam(toSingle(params.tab)));
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>(() => parseStatusParam(toSingle(params.status)));
  const [kindFilter, setKindFilter] = useState<KindFilterValue>(() => parseKindParam(toSingle(params.kind)));

  const [usersById, setUsersById] = useState<Record<string, Partial<User>>>({});
  const [aptsById, setAptsById] = useState<Record<string, Partial<Apartment>>>({});
  const [ownersById, setOwnersById] = useState<Record<string, Partial<User>>>({});
  const [groupMembersByGroupId, setGroupMembersByGroupId] = useState<Record<string, string[]>>({});

  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const APT_PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';
  const WHATSAPP_ICON = 'https://upload.wikimedia.org/wikipedia/commons/5/5e/WhatsApp_Logo_1.png';

  const mapMatchStatus = (status: string | null | undefined): UnifiedItem['status'] => {
    const normalized = (status || '').trim();
    switch (normalized) {
      case 'אושר':
      case 'APPROVED':
        return 'APPROVED';
      case 'נדחה':
      case 'REJECTED':
        return 'REJECTED';
      case 'לא רלוונטי':
      case 'IRRELEVANT':
      case 'NOT_RELEVANT':
        return 'NOT_RELEVANT';
      case 'ממתין':
      case 'PENDING':
        return 'PENDING';
      case 'CANCELLED':
      case 'בוטל':
        return 'CANCELLED';
      default:
        return 'PENDING';
    }
  };

  useEffect(() => {
    fetchAll();
  }, [user?.id]);

  useEffect(() => {
    setTab(parseTabParam(toSingle(params.tab)));
    setKindFilter(parseKindParam(toSingle(params.kind)));
    setStatusFilter(parseStatusParam(toSingle(params.status)));
  }, [params.tab, params.kind, params.status]);

  const fetchAll = async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      setLoading(true);
      // 1) My active group memberships (to pull incoming group-targeted matches)
      const { data: myMemberships, error: memErr } = await supabase
        .from('profile_group_members')
        .select('group_id')
        .eq('user_id', user.id)
        .eq('status', 'ACTIVE');
      if (memErr) throw memErr;
      const myGroupIds = (myMemberships || []).map((r: any) => r.group_id as string);

      // 2) Core queries in parallel
      const [
        { data: sData, error: sErr },
        { data: rData, error: rErr },
        { data: mSent, error: mSErr },
        { data: mRecv, error: mRErr },
        { data: gSent, error: gSErr },
        { data: gRecv, error: gRErr },
        groupRecvResult,
      ] = await Promise.all([
        supabase.from('apartments_request').select('*').eq('sender_id', user.id).order('created_at', { ascending: false }),
        supabase.from('apartments_request').select('*').eq('recipient_id', user.id).order('created_at', { ascending: false }),
        supabase.from('matches').select('*').eq('sender_id', user.id).order('created_at', { ascending: false }),
        supabase.from('matches').select('*').eq('receiver_id', user.id).order('created_at', { ascending: false }),
        supabase.from('profile_group_invites').select('*').eq('inviter_id', user.id).order('created_at', { ascending: false }),
        supabase.from('profile_group_invites').select('*').eq('invitee_id', user.id).order('created_at', { ascending: false }),
        myGroupIds.length
          ? supabase.from('matches').select('*').in('receiver_group_id', myGroupIds).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (sErr) throw sErr;
      if (rErr) throw rErr;
      if (mSErr) throw mSErr;
      if (mRErr) throw mRErr;
      if (gSErr) throw gSErr;
      if (gRErr) throw gRErr;
      const mRecvGroup = (groupRecvResult as any)?.data || [];

      const aptSent: UnifiedItem[] = (sData || [])
        .filter((row: any) => (row.status || 'PENDING') !== 'NOT_RELEVANT')
        .map((row: any) => ({
          id: row.id,
          kind: (row.type || '') === 'INVITE_APT' ? 'APT_INVITE' : 'APT',
          sender_id: row.sender_id,
          recipient_id: row.recipient_id,
          apartment_id: row.apartment_id,
          status: row.status || 'PENDING',
          created_at: row.created_at,
          type: row.type || null,
        }));
      let aptRecv: any[] = (rData || [])
        .filter((row: any) => (row.status || 'PENDING') !== 'NOT_RELEVANT')
        .map((row: any) => ({
          id: row.id,
          kind: (row.type || '') === 'INVITE_APT' ? 'APT_INVITE' : 'APT',
          sender_id: row.sender_id,
          recipient_id: row.recipient_id,
          apartment_id: row.apartment_id,
          status: row.status || 'PENDING',
          created_at: row.created_at,
          type: row.type || null,
        }));

      // Enrich incoming APT/APT_INVITE where sender belongs to a merged profile (show sender's group)
      try {
        const aptIncomingSenderIds = Array.from(new Set(((aptRecv || []) as any[]).map((r: any) => r.sender_id).filter(Boolean)));
        if (aptIncomingSenderIds.length) {
          const { data: aMemberships } = await supabase
            .from('profile_group_members')
            .select('user_id, group_id')
            .eq('status', 'ACTIVE')
            .in('user_id', aptIncomingSenderIds);
          const senderToGroupIdApt: Record<string, string> = {};
          const aptSenderGroupIds = new Set<string>();
          (aMemberships || []).forEach((m: any) => {
            senderToGroupIdApt[m.user_id] = m.group_id;
            aptSenderGroupIds.add(m.group_id);
          });
          if (aptSenderGroupIds.size) {
            const { data: aGroupMembers } = await supabase
              .from('profile_group_members')
              .select('group_id, user_id')
              .eq('status', 'ACTIVE')
              .in('group_id', Array.from(aptSenderGroupIds));
            (aGroupMembers || []).forEach((m: any) => {
              if (!groupMembersByGroupId[m.group_id]) groupMembersByGroupId[m.group_id] = [];
              if (!groupMembersByGroupId[m.group_id].includes(m.user_id)) {
                groupMembersByGroupId[m.group_id].push(m.user_id);
              }
            });
          }
          aptRecv = (aptRecv || []).map((row: any) => ({
            ...row,
            _sender_group_id: senderToGroupIdApt[row.sender_id] || null,
          }));
        }
      } catch {}

      const matchSent: UnifiedItem[] = (mSent || [])
        .filter((row: any) => mapMatchStatus(row.status) !== 'NOT_RELEVANT')
        .map((row: any) => ({
          id: row.id,
          kind: 'MATCH',
          sender_id: row.sender_id,
          recipient_id: row.receiver_id, // may be null for group-targeted; we will normalize below
          apartment_id: null,
          status: mapMatchStatus(row.status),
          created_at: row.created_at,
          // carry through for later normalization
          _receiver_group_id: row.receiver_group_id,
        }));
      let matchRecv: any[] = (mRecv || [])
        .filter((row: any) => mapMatchStatus(row.status) !== 'NOT_RELEVANT')
        .map((row: any) => ({
          id: row.id,
          kind: 'MATCH',
          sender_id: row.sender_id,
          recipient_id: row.receiver_id,
          apartment_id: null,
          status: mapMatchStatus(row.status),
          created_at: row.created_at,
        }));
      // Enrich incoming matches where sender belongs to a merged profile (show sender's group)
      const incomingSenderIds = Array.from(new Set((mRecv || []).map((r: any) => r.sender_id).filter(Boolean)));
      let senderToGroupId: Record<string, string> = {};
      if (incomingSenderIds.length) {
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
        if (senderGroupIds.size) {
          const { data: sGroupMembers } = await supabase
            .from('profile_group_members')
            .select('group_id, user_id')
            .eq('status', 'ACTIVE')
            .in('group_id', Array.from(senderGroupIds));
          (sGroupMembers || []).forEach((m: any) => {
            if (!groupMembersByGroupId[m.group_id]) groupMembersByGroupId[m.group_id] = [];
            if (!groupMembersByGroupId[m.group_id].includes(m.user_id)) {
              groupMembersByGroupId[m.group_id].push(m.user_id);
            }
          });
        }
        // attach sender group id to rows (for rendering)
        matchRecv = matchRecv.map((row: any) => ({
          ...row,
          _sender_group_id: senderToGroupId[row.sender_id] || null,
        }));
      }
      // Incoming matches that target any of my groups
      const matchRecvFromGroups: UnifiedItem[] = (mRecvGroup || [])
        .filter((row: any) => mapMatchStatus(row.status) !== 'NOT_RELEVANT')
        .map((row: any) => ({
          id: row.id,
          kind: 'MATCH',
          sender_id: row.sender_id,
          recipient_id: row.receiver_id, // may be null; not used for incoming display
          apartment_id: null,
          status: mapMatchStatus(row.status),
          created_at: row.created_at,
          _receiver_group_id: row.receiver_group_id,
        }));

      const mapGroupStatus = (status: string | null | undefined): UnifiedItem['status'] => {
        const s = (status || '').toUpperCase();
        // Normalize a variety of server-side spellings to our UI statuses
        if (s === 'PENDING' || s === 'WAITING') return 'PENDING';
        if (s === 'ACCEPTED' || s === 'ACCEPT' || s === 'APPROVED' || s === 'CONFIRMED') return 'APPROVED';
        if (s === 'DECLINED' || s === 'REJECTED' || s === 'DENIED') return 'REJECTED';
        if (s === 'CANCELLED' || s === 'CANCELED') return 'CANCELLED';
        if (s === 'EXPIRED' || s === 'NOT_RELEVANT' || s === 'IRRELEVANT') return 'NOT_RELEVANT';
        return 'PENDING';
      };
      const groupSent: UnifiedItem[] = (gSent || []).map((row: any) => ({
        id: row.id,
        kind: 'GROUP',
        sender_id: row.inviter_id,
        recipient_id: row.invitee_id,
        apartment_id: null,
        status: mapGroupStatus(row.status),
        created_at: row.created_at,
        _sender_group_id: row.group_id, // inviter's group
      }));
      const groupRecv: UnifiedItem[] = (gRecv || []).map((row: any) => ({
        id: row.id,
        kind: 'GROUP',
        sender_id: row.inviter_id,
        recipient_id: row.invitee_id,
        apartment_id: null,
        status: mapGroupStatus(row.status),
        created_at: row.created_at,
        _sender_group_id: row.group_id, // inviter's group
      }));

      const sentUnified = [...aptSent, ...matchSent, ...groupSent].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const recvUnifiedRaw = [...aptRecv, ...matchRecv, ...matchRecvFromGroups, ...groupRecv].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      // Normalize display user for group-targeted matches:
      // For any item with _receiver_group_id, choose a representative member so recipient_id is a real user id.
      const groupIdsForDisplay = Array.from(
        new Set<string>([
          ...((matchSent as any[]) || []).map((r: any) => r._receiver_group_id).filter(Boolean),
          ...((matchRecvFromGroups as any[]) || []).map((r: any) => r._receiver_group_id).filter(Boolean),
          // Also ensure we fetch members for inviter's group in GROUP invites
          ...((groupSent as any[]) || []).map((r: any) => r._sender_group_id).filter(Boolean),
          ...((groupRecv as any[]) || []).map((r: any) => r._sender_group_id).filter(Boolean),
        ])
      );
      let groupIdToMemberIds: Record<string, string[]> = {};
      if (groupIdsForDisplay.length) {
        const { data: dispMembers } = await supabase
          .from('profile_group_members')
          .select('group_id, user_id')
          .eq('status', 'ACTIVE')
          .in('group_id', groupIdsForDisplay);
        groupIdToMemberIds = {};
        (dispMembers || []).forEach((m: any) => {
          if (!groupIdToMemberIds[m.group_id]) groupIdToMemberIds[m.group_id] = [];
          groupIdToMemberIds[m.group_id].push(m.user_id);
        });
      }
      // merge any sender-group members we collected earlier
      Object.entries(groupMembersByGroupId).forEach(([gid, ids]) => {
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
        if (item.kind === 'MATCH' && !item.recipient_id && item._receiver_group_id) {
          const displayUser = pickGroupDisplayUser(item._receiver_group_id, user.id);
          return { ...item, recipient_id: displayUser || item.sender_id };
        }
        return item;
      });
      const normalizeRecv = recvUnifiedRaw.map((item: any) => {
        if (item.kind === 'MATCH' && !item.recipient_id && item._receiver_group_id) {
          const displayUser = pickGroupDisplayUser(item._receiver_group_id, user.id);
          return { ...item, recipient_id: displayUser || item.sender_id };
        }
        return item;
      });

      setSent(normalizeSent as any);
      setReceived(normalizeRecv as any);

      const userIds = Array.from(new Set([
        ...(normalizeSent as UnifiedItem[]).map((r) => r.recipient_id),
        ...(normalizeRecv as UnifiedItem[]).map((r) => r.sender_id),
        ...Object.values(groupIdToMemberIds).flat(), // ensure we have details for group members to display
      ]));
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

      const aptIds = Array.from(new Set([
        ...(normalizeSent as UnifiedItem[])
          .filter((r) => r.kind === 'APT' || r.kind === 'APT_INVITE')
          .map((r) => r.apartment_id)
          .filter(Boolean) as string[],
        ...(normalizeRecv as UnifiedItem[])
          .filter((r) => r.kind === 'APT' || r.kind === 'APT_INVITE')
          .map((r) => r.apartment_id)
          .filter(Boolean) as string[],
      ]));
      if (aptIds.length) {
        const { data: apts } = await supabase
          .from('apartments')
          .select('id, title, city, image_urls, owner_id')
          .in('id', aptIds);
        const aMap: Record<string, any> = {};
        (apts || []).forEach((a: any) => { aMap[a.id] = a; });
        setAptsById(aMap);

        // fetch owners info (phone) for exposing after approval
        const ownerIds = Array.from(
          new Set(((apts || []) as any[]).map((a: any) => a.owner_id).filter(Boolean))
        );
        if (ownerIds.length) {
          const { data: owners } = await supabase
            .from('users')
            .select('id, full_name, phone')
            .in('id', ownerIds);
          const oMap: Record<string, Partial<User>> = {};
          (owners || []).forEach((u: any) => { oMap[u.id] = u; });
          setOwnersById(oMap);
        } else {
          setOwnersById({});
        }
      } else {
        setAptsById({});
        setOwnersById({});
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

  const approveIncoming = async (req: UnifiedItem) => {
    if (!user?.id || !req.apartment_id) return;
    try {
      setActionId(req.id);
      // Load apartment details (for notification text)
      const { data: apt, error: aptErr } = await supabase
        .from('apartments')
        .select('id, owner_id, title, city, partner_ids')
        .eq('id', req.apartment_id)
        .maybeSingle();
      if (aptErr) throw aptErr;
      if (!apt) throw new Error('דירה לא נמצאה');

      // Determine which user should be added as partner based on request type
      const requestType = (req as any)?.type || 'JOIN_APT';
      const userToAddId = requestType === 'INVITE_APT' ? req.recipient_id : req.sender_id;

      // 1) update request status
      await supabase
        .from('apartments_request')
        .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
        .eq('id', req.id);

      // 2) add the approved user to the apartment's partner_ids (idempotent)
      const currentPartnerIds: string[] = Array.isArray((apt as any).partner_ids)
        ? ((apt as any).partner_ids as string[])
        : [];
      if (userToAddId && !currentPartnerIds.includes(userToAddId)) {
        const newPartnerIds = Array.from(new Set([...(currentPartnerIds || []), userToAddId]));
        const { error: updateErr } = await supabase
          .from('apartments')
          .update({ partner_ids: newPartnerIds })
          .eq('id', req.apartment_id);
        if (updateErr) throw updateErr;
      }

      // 3) notify the other party about approval and addition
      const aptTitle = (apt as any)?.title || '';
      const aptCity = (apt as any)?.city || '';
      let approverName = 'משתמש';
      try {
        const { data: me } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle();
        approverName = (me as any)?.full_name || approverName;
      } catch {}

      if (requestType === 'INVITE_APT') {
        // Owner invited; recipient approved — notify owner (sender)
        const approverName = await computeGroupAwareLabel(user.id);
        await supabase.from('notifications').insert({
          sender_id: user.id,
          recipient_id: req.sender_id,
          title: 'הוזמנה אושרה',
          description: `${approverName} אישר/ה והתווסף/ה כשותף/ה לדירה${aptTitle ? `: ${aptTitle}` : ''}${aptCity ? ` (${aptCity})` : ''}.`,
          is_read: false,
        });
      } else {
        // JOIN_APT: requester approved by recipient — notify requester (sender)
        const approverName = await computeGroupAwareLabel(user.id);
        await supabase.from('notifications').insert({
          sender_id: user.id,
          recipient_id: req.sender_id,
          title: 'בקשתך אושרה',
          description: `${approverName} אישר/ה את בקשתך והתווספת כשותף/ה לדירה${aptTitle ? `: ${aptTitle}` : ''}${aptCity ? ` (${aptCity})` : ''}.`,
          is_read: false,
        });
      }

      // 4) Ensure both approver and added user share a merged profile group
      try {
        const approverId = user.id;
        const otherUserId = userToAddId;
        const inviterId = req.sender_id; // prefer inviter's group if exists
        if (approverId && otherUserId && approverId !== otherUserId) {
          // Fetch active memberships for both users
          const [{ data: approverMem }, { data: otherMem }, { data: inviterMem }] = await Promise.all([
            supabase
              .from('profile_group_members')
              .select('group_id')
              .eq('user_id', approverId)
              .eq('status', 'ACTIVE')
              .maybeSingle(),
            supabase
              .from('profile_group_members')
              .select('group_id')
              .eq('user_id', otherUserId)
              .eq('status', 'ACTIVE')
              .maybeSingle(),
            supabase
              .from('profile_group_members')
              .select('group_id')
              .eq('user_id', inviterId)
              .eq('status', 'ACTIVE')
              .maybeSingle(),
          ]);
          let targetGroupId: string | null = null;
          const approverGroupId = (approverMem as any)?.group_id as string | undefined;
          const otherGroupId = (otherMem as any)?.group_id as string | undefined;
          const inviterGroupId = (inviterMem as any)?.group_id as string | undefined;
          // Preference: inviter's group (sender of the request) if exists, else approver's, else other user's
          targetGroupId = inviterGroupId || approverGroupId || otherGroupId || null;
          // Create group if neither has one
          if (!targetGroupId) {
            const { data: newGroup, error: groupErr } = await supabase
              .from('profile_groups')
              .insert({ created_by: inviterId || approverId, name: 'שותפים' } as any)
              .select('id')
              .single();
            if (groupErr) throw groupErr;
            targetGroupId = (newGroup as any)?.id as string;
          }
          // Upsert ACTIVE membership for both users
          // First, check existing membership statuses for both in the target group
          const { data: existingMembers } = await supabase
            .from('profile_group_members')
            .select('user_id, status')
            .eq('group_id', targetGroupId)
            .in('user_id', [approverId, otherUserId] as any);
          const hasApprover = !!(existingMembers || []).find((m: any) => m.user_id === approverId);
          const hasOther = !!(existingMembers || []).find((m: any) => m.user_id === otherUserId);
          const approverStatus = (existingMembers || []).find((m: any) => m.user_id === approverId)?.status;
          const otherStatus = (existingMembers || []).find((m: any) => m.user_id === otherUserId)?.status;
          const inserts: any[] = [];
          if (!hasApprover) inserts.push({ group_id: targetGroupId, user_id: approverId, status: 'ACTIVE' });
          if (!hasOther) inserts.push({ group_id: targetGroupId, user_id: otherUserId, status: 'ACTIVE' });
          if (inserts.length) {
            await supabase.from('profile_group_members').insert(inserts as any);
          }
          const updates: any[] = [];
          if (hasApprover && approverStatus !== 'ACTIVE') {
            updates.push({ user_id: approverId });
          }
          if (hasOther && otherStatus !== 'ACTIVE') {
            updates.push({ user_id: otherUserId });
          }
          for (const u of updates) {
            await supabase
              .from('profile_group_members')
              .update({ status: 'ACTIVE' })
              .eq('group_id', targetGroupId)
              .eq('user_id', u.user_id);
          }
        }
      } catch (e) {
        // non-fatal: log and continue
        console.warn('ensure merged group failed', e);
      }

      await fetchAll();
      Alert.alert('הצלחה', 'הבקשה אושרה והמשתמש הוסף כשותף לדירה');
    } catch (e: any) {
      console.error('approve request failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לאשר את הבקשה');
    } finally {
      setActionId(null);
    }
  };

  const openWhatsApp = async (phone: string, message: string) => {
    const DEFAULT_COUNTRY_CODE = '972'; // IL
    let raw = (phone || '').trim();
    if (!raw) {
      Alert.alert('שגיאה', 'מספר הטלפון לא זמין');
      return;
    }

    // Normalize to international format without '+' for wa.me
    // Examples:
    // '050-1234567' -> '972501234567'
    // '+972-50-1234567' -> '972501234567'
    // '972501234567' -> '972501234567'
    let digits = raw.startsWith('+')
      ? raw.slice(1).replace(/\D/g, '')
      : raw.replace(/\D/g, '');

    if (!digits) {
      Alert.alert('שגיאה', 'מספר הטלפון לא תקין');
      return;
    }

    // If no country code present, assume IL and remove leading zeros
    if (!digits.startsWith(DEFAULT_COUNTRY_CODE)) {
      digits = DEFAULT_COUNTRY_CODE + digits.replace(/^0+/, '');
    }

    if (digits.length < 11) {
      // Typical IL length is 12 (972 + 9 digits). Guard against obviously short numbers.
      // We still try, but inform the user.
      console.warn('Possibly invalid phone for WhatsApp:', digits);
    }

    const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('שגיאה', 'לא ניתן לפתוח את וואטסאפ');
    }
  };

  const rejectIncoming = async (req: UnifiedItem) => {
    try {
      setActionId(req.id);
      await supabase.from('apartments_request').update({ status: 'REJECTED', updated_at: new Date().toISOString() }).eq('id', req.id);
      await fetchAll();
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לדחות את הבקשה');
    } finally {
      setActionId(null);
    }
  };

  const approveIncomingGroup = async (item: UnifiedItem) => {
    if (!user?.id) return;
    try {
      setActionId(item.id);
      // First try a server-side RPC that bypasses RLS (if installed)
      let doneViaRpc = false;
      try {
        const { error: rpcV2Err } = await supabase.rpc('accept_profile_group_invite_v2', { p_invite_id: item.id });
        if (!rpcV2Err) {
          doneViaRpc = true;
        } else {
          // eslint-disable-next-line no-console
          console.error('[group-approve] rpc v2 failed', {
            code: (rpcV2Err as any)?.code,
            message: rpcV2Err.message,
            details: (rpcV2Err as any)?.details,
            hint: (rpcV2Err as any)?.hint,
          });
        }
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.error('[group-approve] rpc v2 exception', e?.message || e);
      }
      if (doneViaRpc) {
        // Optimistic UI update so buttons disappear immediately
        setReceived((prev) =>
          prev.map((r) => (r.id === item.id ? { ...r, status: 'APPROVED' } as any : r))
        );
      } else {
        // Manual acceptance (no RPC)
      // 1) Load invite to get group_id and validate invitee
      const { data: invite, error: inviteErr } = await supabase
        .from('profile_group_invites')
        .select('id, group_id, invitee_id, status')
        .eq('id', item.id)
        .maybeSingle();
      if (inviteErr) {
        // eslint-disable-next-line no-console
        console.error('[group-approve] load invite error', {
          code: (inviteErr as any)?.code,
          message: inviteErr.message,
          details: (inviteErr as any)?.details,
          hint: (inviteErr as any)?.hint,
        });
        throw inviteErr;
      }
      if (!invite) throw new Error('הזמנה לא נמצאה');
      if ((invite as any).invitee_id !== user.id) {
        throw new Error('אין הרשאה לאשר הזמנה זו');
      }
      const groupId = (invite as any).group_id as string;
      // 2) Mark invite as accepted
      const updInviteRes = await supabase
        .from('profile_group_invites')
        .update({ status: 'ACCEPTED', responded_at: new Date().toISOString() })
        .eq('id', item.id);
      if ((updInviteRes as any)?.error) {
        // eslint-disable-next-line no-console
        console.error('[group-approve] update invite error', {
          code: ((updInviteRes as any).error as any)?.code,
          message: (updInviteRes as any).error?.message,
          details: ((updInviteRes as any).error as any)?.details,
          hint: ((updInviteRes as any).error as any)?.hint,
        });
        throw (updInviteRes as any).error;
      }
      // 3) Try insert membership (prefer INSERT to avoid RLS requirements for UPDATE)
      const tryInsert = await supabase
        .from('profile_group_members')
        .insert([{ group_id: groupId, user_id: user.id, status: 'ACTIVE' } as any], {
          onConflict: 'group_id,user_id',
          ignoreDuplicates: true,
        } as any);
      if (tryInsert?.error) {
        // eslint-disable-next-line no-console
        console.error('[group-approve] insert member error', {
          code: (tryInsert.error as any)?.code,
          message: tryInsert.error.message,
          details: (tryInsert.error as any)?.details,
          hint: (tryInsert.error as any)?.hint,
        });
      }
      // 3b) If row already exists or insert was ignored, ensure status is ACTIVE (best-effort)
      if (tryInsert?.error || (tryInsert as any)?.status === 409) {
        const updateRes = await supabase
          .from('profile_group_members')
          .update({ status: 'ACTIVE' })
          .eq('group_id', groupId)
          .eq('user_id', user.id);
        if (updateRes?.error) {
          // eslint-disable-next-line no-console
          console.error('[group-approve] update member error', {
            code: (updateRes.error as any)?.code,
            message: updateRes.error.message,
            details: (updateRes.error as any)?.details,
            hint: (updateRes.error as any)?.hint,
          });
        }
      }
        // Optimistic UI update so buttons disappear immediately
        setReceived((prev) =>
          prev.map((r) => (r.id === item.id ? { ...r, status: 'APPROVED' } as any : r))
        );
      }
      // Notify inviter that invite was accepted
      try {
        const approverName = await computeGroupAwareLabel(user.id);
        await supabase.from('notifications').insert({
          sender_id: user.id,
          recipient_id: item.sender_id,
          title: 'אישרת מיזוג פרופילים',
          description: `${approverName} אישר/ה את בקשת מיזוג הפרופילים.`,
          is_read: false,
        });
      } catch {}
      // If the inviter is already a partner (or owner) in apartment(s), add the approver as a partner too
      try {
        const inviterId = item.sender_id;
        const approverId = user.id;
        if (inviterId && approverId && inviterId !== approverId) {
          const [
            { data: aptsByPartner },
            { data: aptsByOwner },
          ] = await Promise.all([
            supabase.from('apartments').select('id, partner_ids').contains('partner_ids', [inviterId] as any),
            supabase.from('apartments').select('id, partner_ids').eq('owner_id', inviterId),
          ]);
          const merged: any[] = [...(aptsByPartner || []), ...(aptsByOwner || [])];
          const uniqueById: Record<string, any> = {};
          merged.forEach((a: any) => {
            uniqueById[a.id] = a;
          });
          const targets = Object.values(uniqueById);
          if (targets.length) {
            await Promise.all(
              targets.map(async (apt: any) => {
                const currentPartnerIds: string[] = Array.isArray(apt.partner_ids) ? (apt.partner_ids as string[]) : [];
                if (!currentPartnerIds.includes(approverId)) {
                  const newPartnerIds = Array.from(new Set([...(currentPartnerIds || []), approverId]));
                  await supabase.from('apartments').update({ partner_ids: newPartnerIds }).eq('id', apt.id);
                }
              })
            );
          }
        }
      } catch (e) {
        console.warn('auto-add approver to inviter apartments failed', e);
      }
      await fetchAll();
      Alert.alert('הצלחה', 'אושרת להצטרף לקבוצה');
    } catch (e: any) {
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
      // Optimistic UI update so buttons disappear immediately
      setReceived((prev) =>
        prev.map((r) => (r.id === item.id ? { ...r, status: 'REJECTED' } as any : r))
      );
      await fetchAll();
    } catch (e: any) {
      console.error('reject group invite failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לדחות את הבקשה');
    } finally {
      setActionId(null);
    }
  };

  const approveIncomingMatch = async (match: UnifiedItem) => {
    if (!user?.id) return;
    try {
      setActionId(match.id);
      await supabase
        .from('matches')
        .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
        .eq('id', match.id);

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
      setKindFilter('MATCH');
      setStatusFilter('APPROVED');
      router.setParams({ tab: 'incoming', kind: 'MATCH', status: 'APPROVED' });
      Alert.alert('הצלחה', 'בקשת ההתאמה אושרה');
    } catch (e: any) {
      console.error('approve match request failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לאשר את ההתאמה');
    } finally {
      setActionId(null);
    }
  };

  const rejectIncomingMatch = async (match: UnifiedItem) => {
    if (!user?.id) return;
    try {
      setActionId(match.id);
      await supabase
        .from('matches')
        .update({ status: 'REJECTED', updated_at: new Date().toISOString() })
        .eq('id', match.id);

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
            const receiverGroupId = (item as any)?._receiver_group_id as string | undefined;
            const senderGroupId = (item as any)?._sender_group_id as string | undefined;
            const isGroupMatch =
              item.kind === 'MATCH' && (!!receiverGroupId || (incoming && !!senderGroupId));
            const isGroupInvite = item.kind === 'GROUP' && incoming && !!(item as any)?._sender_group_id;
            const effectiveGroupId =
              receiverGroupId || (incoming ? senderGroupId : undefined) || (isGroupInvite ? (item as any)?._sender_group_id : undefined);
            const groupMemberIds = effectiveGroupId ? (groupMembersByGroupId[effectiveGroupId] || []) : [];
            const groupMembers = groupMemberIds.map((id) => usersById[id]).filter(Boolean) as Partial<User>[];
            const apt = (item.kind === 'APT' || item.kind === 'APT_INVITE') && item.apartment_id ? aptsById[item.apartment_id] : undefined;
            const aptImage = apt ? (Array.isArray(apt.image_urls) && (apt.image_urls as any[]).length ? (apt.image_urls as any[])[0] : APT_PLACEHOLDER) : null;
            const ownerUser = apt && (apt as any).owner_id ? ownersById[(apt as any).owner_id as string] : undefined;
            const ownerPhone = ownerUser?.phone as string | undefined;
            return (
              <View style={styles.card}>
                <View style={styles.cardInner}>
                  {!!aptImage ? (
                    <View style={styles.thumbWrap}>
                      <Image source={{ uri: aptImage }} style={styles.thumbImg} />
                    </View>
                  ) : (isGroupMatch || isGroupInvite) && groupMembers.length ? (
                    (() => {
                      const gridMembers = groupMembers.slice(0, 4);
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
                  ) : null}
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.kind === 'APT'
                        ? 'בקשת הצטרפות לדירה'
                        : item.kind === 'APT_INVITE'
                        ? 'הזמנה להצטרף לדירה'
                        : item.kind === 'MATCH'
                        ? 'בקשת התאמה'
                        : 'בקשת מיזוג פרופילים'}
                    </Text>
                    {!!apt && (
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {apt.title} • {apt.city}
                      </Text>
                    )}
                    {(isGroupMatch || isGroupInvite) && groupMembers.length ? (
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {groupMembers.map((m) => m.full_name).filter(Boolean).join(' • ')}
                      </Text>
                    ) : (incoming && (item.kind === 'APT' || item.kind === 'APT_INVITE') && (item as any)?._sender_group_id && groupMembers.length) ? (
                      <Text style={styles.cardSub} numberOfLines={1}>
                        {groupMembers.map((m) => m.full_name).filter(Boolean).join(' • ')}
                      </Text>
                    ) : !!otherUser?.full_name ? (
                      <Text style={styles.cardMeta}>משתמש: {otherUser.full_name}</Text>
                    ) : null}
                    <Text style={styles.cardMeta}>{new Date(item.created_at).toLocaleString()}</Text>
                    <View style={{ marginTop: 10, flexDirection: 'row-reverse', gap: 8 as any }}>
                      {(item.kind === 'APT' || item.kind === 'APT_INVITE') ? <StatusPill status={item.status} /> : null}
                      {incoming && (item.kind === 'APT' || item.kind === 'APT_INVITE') && item.status === 'PENDING' && (
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
                      {incoming && item.kind === 'GROUP' && item.status === 'PENDING' && (
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
                      {/* Recipient view (incoming): after approval allow WhatsApp to requester (only for JOIN_APT) */}
                      {incoming && item.kind === 'APT' && item.status === 'APPROVED' && (item.type === 'JOIN_APT' || !item.type) && (
                        <View style={{ marginTop: 10, alignItems: 'flex-end', gap: 6 as any }}>
                          <Text style={styles.cardMeta}>
                            מספר הפונה: {otherUser?.phone ? otherUser.phone : 'לא זמין'}
                          </Text>
                          {otherUser?.phone ? (
                            <TouchableOpacity
                              style={[styles.approveBtn]}
                              activeOpacity={0.85}
                              onPress={() =>
                                openWhatsApp(
                                  otherUser.phone as string,
                                  `היי${otherUser?.full_name ? ` ${otherUser.full_name.split(' ')[0]}` : ''}, ראיתי שהתעניינת לאחרונה בדירה שלי${apt?.title ? `: ${apt.title}` : ''}${apt?.city ? ` (${apt.city})` : ''} ב-Homie. הבקשה אושרה, אשמח לתאם שיחה או צפייה.`
                                )
                              }
                            >
                              <Text style={styles.approveBtnText}>שליחת וואטסאפ למתעניין/ת</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      )}
                      {/* Sender view: expose owner's phone and WhatsApp action once approved (only for JOIN_APT) */}
                      {!incoming && item.kind === 'APT' && item.status === 'APPROVED' && (item.type === 'JOIN_APT' || !item.type) && (
                        <View style={{ marginTop: 10, alignItems: 'flex-end', gap: 6 as any }}>
                          <Text style={styles.cardMeta}>
                            מספר בעל הדירה: {ownerPhone ? ownerPhone : 'לא זמין'}
                          </Text>
                          {ownerPhone ? (
                            <TouchableOpacity
                              style={[styles.approveBtn]}
                              activeOpacity={0.85}
                              onPress={() =>
                                openWhatsApp(
                                  ownerPhone,
                                  `היי, בקשתי להצטרף לדירה${apt?.title ? `: ${apt.title}` : ''}${apt?.city ? ` (${apt.city})` : ''} אושרה באפליקציית Homie. אשמח לתאם שיחה/צפייה.`
                                )
                              }
                            >
                              <Text style={styles.approveBtnText}>שליחת וואטסאפ לבעל הדירה</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      )}
                      {incoming && item.kind === 'MATCH' && item.status === 'PENDING' && (
                        <View style={{ flexDirection: 'row-reverse', gap: 8 as any }}>
                          <TouchableOpacity
                            style={[styles.approveBtn, actionId === item.id && { opacity: 0.7 }]}
                            onPress={() => approveIncomingMatch(item)}
                            disabled={actionId === item.id}
                            activeOpacity={0.85}
                          >
                            {actionId === item.id ? (
                              <ActivityIndicator size="small" color="#0F0F14" />
                            ) : (
                              <Text style={styles.approveBtnText}>אישור</Text>
                            )}
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
                      {incoming && item.kind === 'MATCH' && item.status === 'APPROVED' && (
                        isGroupMatch && groupMembers.length ? (
                          <View style={{ marginTop: 12, alignItems: 'flex-end', gap: 6 as any }}>
                            <View
                              style={{
                                width: '100%',
                                flexDirection: 'row-reverse',
                                flexWrap: 'wrap',
                                gap: 12 as any,
                                justifyContent: 'flex-end',
                              }}
                            >
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
                                        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>
                                          {m.full_name}
                                        </Text>
                                        <Text style={{ color: '#C9CDD6', fontSize: 13, marginTop: 2 }}>
                                          {m.phone || 'מספר לא זמין'}
                                        </Text>
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
                                        <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>
                                          שלח הודעה בוואטסאפ
                                        </Text>
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
                                  <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '800' }}>
                                    {otherUser?.full_name || 'משתמש'}
                                  </Text>
                                  <Text style={{ color: '#C9CDD6', fontSize: 13, marginTop: 2 }}>
                                    {otherUser?.phone || 'מספר לא זמין'}
                                  </Text>
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
                                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>
                                    שלח הודעה בוואטסאפ
                                  </Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        )
                      )}
                    </View>
                  </View>
                  {!isGroupMatch && (
                    <TouchableOpacity
                      style={styles.avatarWrap}
                      activeOpacity={0.85}
                      onPress={() => {
                        const id = incoming ? item.sender_id : item.recipient_id;
                        if (id) router.push({ pathname: '/user/[id]', params: { id } });
                      }}
                    >
                      {(incoming && (item.kind === 'APT' || item.kind === 'APT_INVITE') && (item as any)?._sender_group_id && groupMembers.length) ? (
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
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );

  const applyKind = (arr: UnifiedItem[]) => arr.filter((r) => (kindFilter === 'ALL' ? true : r.kind === kindFilter));
  const applyStatus = (arr: UnifiedItem[]) => arr.filter((r) => (statusFilter === 'ALL' ? true : r.status === statusFilter));
  const filteredReceived = applyStatus(applyKind(received));
  const filteredSent = applyStatus(applyKind(sent));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {/* placeholder on the right to avoid overlap with global RequestsButton */}
        <View style={styles.iconBtnPlaceholder} />
        <Text style={styles.headerTitle}>בקשות</Text>
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

        <View style={[styles.segmentWrap, { marginTop: 8 }]}>
          <TouchableOpacity
            style={[styles.segmentBtn, kindFilter === 'APT' && styles.segmentBtnActive]}
            onPress={() => setKindFilter('APT')}
            activeOpacity={0.9}
          >
            <Home size={16} color={kindFilter === 'APT' ? '#FFFFFF' : '#C9CDD6'} />
            <Text style={[styles.segmentText, kindFilter === 'APT' && styles.segmentTextActive]}>דירות</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, kindFilter === 'APT_INVITE' && styles.segmentBtnActive]}
            onPress={() => setKindFilter('APT_INVITE')}
            activeOpacity={0.9}
          >
            <UserPlus size={16} color={kindFilter === 'APT_INVITE' ? '#FFFFFF' : '#C9CDD6'} />
            <Text style={[styles.segmentText, kindFilter === 'APT_INVITE' && styles.segmentTextActive]}>הזמנות לדירה</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, kindFilter === 'MATCH' && styles.segmentBtnActive]}
            onPress={() => setKindFilter('MATCH')}
            activeOpacity={0.9}
          >
            <Users size={16} color={kindFilter === 'MATCH' ? '#FFFFFF' : '#C9CDD6'} />
            <Text style={[styles.segmentText, kindFilter === 'MATCH' && styles.segmentTextActive]}>שותפים</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentBtn, kindFilter === 'GROUP' && styles.segmentBtnActive]}
            onPress={() => setKindFilter('GROUP')}
            activeOpacity={0.9}
          >
            <UserPlus2 size={16} color={kindFilter === 'GROUP' ? '#FFFFFF' : '#C9CDD6'} />
            <Text style={[styles.segmentText, kindFilter === 'GROUP' && styles.segmentTextActive]}>מיזוג פרופילים</Text>
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
          <ActivityIndicator size="large" color="#7C5CFF" />
        </View>
      ) : (
        <FlatList
          data={[{ key: tab }]}
          keyExtractor={(i) => i.key}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C5CFF" />}
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
  whatsappIcon: {
    width: 16,
    height: 16,
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


