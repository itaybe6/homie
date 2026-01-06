import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  View,
  Text,
  StyleSheet,
  Animated,
  SectionList,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Bell, Inbox, Filter, Home, Users, UserPlus2, UserPlus, Sparkles, MessageCircle, X } from 'lucide-react-native';
import WhatsAppSvg from '@/components/icons/WhatsAppSvg';
import { FabButton } from '@/components/FabButton';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Apartment, Notification, User } from '@/types/database';
import { computeGroupAwareLabel } from '@/lib/group';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTimeAgoHe } from '@/utils/time';
import { insertNotificationOnce } from '@/lib/notifications';
import { useNotificationsStore } from '@/stores/notificationsStore';

export default function RequestsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const scrollY = useRef(new Animated.Value(0)).current;
  const markSeenNow = useNotificationsStore((s) => s.markSeenNow);
  const [ownerDetails, setOwnerDetails] = useState<null | { full_name?: string; avatar_url?: string; phone?: string }>(null);
  const toSingle = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  type InboxFilterId = 'ALL' | 'MATCHES' | 'MERGE' | 'APARTMENTS';
  const [inboxFilter, setInboxFilter] = useState<InboxFilterId>('ALL');
  const [aptPanelAptId, setAptPanelAptId] = useState<string | null>(null);
  const [aptPanelOpen, setAptPanelOpen] = useState(false);
  const aptPanelCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const [received, setReceived] = useState<UnifiedItem[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);

  const [usersById, setUsersById] = useState<Record<string, Partial<User>>>({});
  const [aptsById, setAptsById] = useState<Record<string, Partial<Apartment>>>({});
  const [ownersById, setOwnersById] = useState<Record<string, Partial<User>>>({});
  const [groupMembersByGroupId, setGroupMembersByGroupId] = useState<Record<string, string[]>>({});

  // Notifications (unified inbox: notifications + requests)
  const [notifItems, setNotifItems] = useState<Notification[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  // notifications refresh uses the same pull-to-refresh as requests
  const [notifActionLoadingId, setNotifActionLoadingId] = useState<string | null>(null);
  const [notifSendersById, setNotifSendersById] = useState<
    Record<string, { id: string; full_name?: string; avatar_url?: string; phone?: string }>
  >({});
  const [notifSenderGroupIdByUserId, setNotifSenderGroupIdByUserId] = useState<Record<string, string>>({});
  const [notifGroupMembersByGroupId, setNotifGroupMembersByGroupId] = useState<Record<string, string[]>>({});
  const [notifApartmentsById, setNotifApartmentsById] = useState<
    Record<string, { id: string; title?: string; city?: string; image_urls?: string[] }>
  >({});

  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const APT_PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';
  // Use a vector icon to ensure it always renders (remote PNGs can fail/tint inconsistently)

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

  const isPartnerRequestNotification = (n: Notification): boolean => {
    const t = (n?.title || '').trim();
    return t.includes('בקשת שותפות חדשה');
  };

  const isMergeProfileNotification = (n: Notification): boolean => {
    const t = (n?.title || '').trim();
    return t.includes('מיזוג פרופילים');
  };

  const isMatchNotification = (n: Notification): boolean => {
    const title = String(n?.title || '').trim();
    const desc = String(n?.description || '').trim();
    if (title.includes('בקשת התאמה') || title.includes('בקשת ההתאמה') || title.includes('התאמה')) return true;
    // Our EVENT_KEY convention: "match:<matchId>:approved"
    if (/EVENT_KEY:match:/.test(desc)) return true;
    return false;
  };

  const isApprovedNotification = (n: Notification): boolean => {
    const desc = (n?.description || '').trim();
    const title = (n?.title || '').trim();
    // Don't show WhatsApp for merge profile notifications
    if (title.includes('מיזוג פרופילים')) return false;
    return desc.includes('אישר/ה את בקשת') || desc.includes('אושרה');
  };

  const extractInviteApartmentId = (description: string): string | null => {
    if (!description) return null;
    const parts = description.split('---');
    if (parts.length < 2) return null;
    const meta = parts[1] || '';
    const match = meta.match(/(?:INVITE_APT|APPROVED_APT):([A-Za-z0-9-]+)/);
    return match ? match[1] : null;
  };

  const isApartmentNotification = (n: Notification): boolean => {
    const title = String(n?.title || '').trim();
    const desc = String(n?.description || '').trim();
    if (extractInviteApartmentId(desc)) return true;
    if (/INVITE_APT:|APPROVED_APT:/.test(desc)) return true;
    // Keep heuristic broad: copy variants mention "דירה" / "שותף בדירה"
    if (title.includes('דירה') || desc.includes('דירה') || desc.includes('שותף בדירה')) return true;
    return false;
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

  const openApartmentPanel = (aptId: string) => {
    if (!aptId) return;
    if (aptPanelCloseTimerRef.current) clearTimeout(aptPanelCloseTimerRef.current);
    setAptPanelAptId(aptId);
    requestAnimationFrame(() => setAptPanelOpen(true));
  };

  const closeApartmentPanel = () => {
    if (aptPanelCloseTimerRef.current) clearTimeout(aptPanelCloseTimerRef.current);
    setAptPanelOpen(false);
    aptPanelCloseTimerRef.current = setTimeout(() => {
      setAptPanelAptId(null);
    }, 520);
  };

  const fetchNotifications = async (opts?: { markRead?: boolean }) => {
    if (!user?.id) {
      setNotifItems([]);
      setNotifLoading(false);
      return;
    }
    try {
      setNotifLoading(true);
      // Determine whether the user is part of an ACTIVE group and, if so, collect all ACTIVE member ids
      let recipientIds: string[] = [user.id];
      try {
        const { data: myMemberships } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE');
        const myGroupIds = (myMemberships || []).map((r: any) => r?.group_id).filter(Boolean);
        if (myGroupIds.length > 0) {
          const { data: membersRows } = await supabase
            .from('profile_group_members')
            .select('user_id')
            .eq('status', 'ACTIVE')
            .in('group_id', myGroupIds as any);
          const memberIds = (membersRows || []).map((r: any) => r.user_id).filter(Boolean);
          if (memberIds.length > 0) {
            recipientIds = Array.from(new Set(memberIds));
          }
        }
      } catch {}

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .in('recipient_id', recipientIds as any)
        .order('created_at', { ascending: false });
      if (error) throw error;
      let notifications = ((data || []) as Notification[]);

      // Best-effort UI dedupe by EVENT_KEY if present (prevents double entries).
      try {
        const seen = new Set<string>();
        const extractEventKey = (desc: string): string | null => {
          const m = String(desc || '').match(/EVENT_KEY:([^\n\r]+)/);
          return m ? String(m[1] || '').trim() : null;
        };
        notifications = notifications.filter((n) => {
          const k = extractEventKey(n.description);
          if (!k) return true;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      } catch {}

      // Fetch sender profiles for avatars
      const allSenderIds = Array.from(
        new Set(
          notifications
            .map((n) => n.sender_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      );
      let usersMap: Record<string, { id: string; full_name?: string; avatar_url?: string; phone?: string }> = {};
      if (allSenderIds.length > 0) {
        const { data: usersData, error: usersErr } = await supabase
          .from('users')
          .select('id, full_name, avatar_url, phone')
          .in('id', allSenderIds);
        if (usersErr) throw usersErr;
        (usersData || []).forEach((u: any) => {
          usersMap[u.id] = u;
        });

        // If a sender user was deleted, remove their notifications too.
        const missingSenderIds = allSenderIds.filter((id) => !usersMap[id]);
        if (missingSenderIds.length > 0) {
          const missingSet = new Set(missingSenderIds);
          const orphanNotifIds = notifications
            .filter((n) => typeof n.sender_id === 'string' && missingSet.has(n.sender_id))
            .map((n) => n.id);

          if (orphanNotifIds.length > 0) {
            try {
              await supabase.from('notifications').delete().in('id', orphanNotifIds as any);
            } catch {}
            notifications = notifications.filter((n) => !orphanNotifIds.includes(n.id));
          }
        }
      }

      const uniqueSenderIds = Array.from(
        new Set(
          notifications
            .map((n) => n.sender_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      );

      // Find if any sender belongs to an ACTIVE merged profile (group)
      let senderToGroup: Record<string, string> = {};
      let groupIdToMemberIds: Record<string, string[]> = {};
      if (uniqueSenderIds.length > 0) {
        const { data: memberships } = await supabase
          .from('profile_group_members')
          .select('user_id, group_id')
          .eq('status', 'ACTIVE')
          .in('user_id', uniqueSenderIds);
        const sendersWithGroups = (memberships || []) as any[];
        senderToGroup = {};
        const groupIds = new Set<string>();
        sendersWithGroups.forEach((m) => {
          senderToGroup[m.user_id] = m.group_id;
          groupIds.add(m.group_id);
        });
        if (groupIds.size > 0) {
          const { data: groupMembers } = await supabase
            .from('profile_group_members')
            .select('group_id, user_id')
            .eq('status', 'ACTIVE')
            .in('group_id', Array.from(groupIds));
          groupIdToMemberIds = {};
          (groupMembers || []).forEach((m: any) => {
            if (!groupIdToMemberIds[m.group_id]) groupIdToMemberIds[m.group_id] = [];
            groupIdToMemberIds[m.group_id].push(m.user_id);
          });
        }
      }

      // Ensure user profiles are loaded for group members too
      const extraUserIds = Array.from(new Set(Object.values(groupIdToMemberIds).flat())).filter((id) => !usersMap[id]);
      if (extraUserIds.length > 0) {
        const { data: extraUsers } = await supabase
          .from('users')
          .select('id, full_name, avatar_url')
          .in('id', extraUserIds);
        (extraUsers || []).forEach((u: any) => {
          usersMap[u.id] = u;
        });
      }
      setNotifSendersById(usersMap);
      setNotifSenderGroupIdByUserId(senderToGroup);
      setNotifGroupMembersByGroupId(groupIdToMemberIds);

      // Fetch apartments referenced by notifications
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
        (apts || []).forEach((a: any) => {
          aMap[a.id] = a;
        });
        setNotifApartmentsById(aMap);
      } else {
        setNotifApartmentsById({});
      }

      setNotifItems(notifications);

      if (opts?.markRead) {
        try {
          // Mark read for ALL recipients that are part of the unified inbox (supports merged profiles).
          await supabase.from('notifications').update({ is_read: true }).in('recipient_id', recipientIds as any);
          // Do not force-set the badge to 0 here; the bell badge is a combined count
          // (unread notifications + pending requests) and is refreshed by the button itself.
        } catch {}
      }
    } catch (e) {
      console.error('Failed to load notifications', e);
      setNotifItems([]);
    } finally {
      setNotifLoading(false);
    }
  };

  const handleApproveInviteFromNotification = async (notification: Notification, apartmentId: string) => {
    if (!user?.id) return;
    try {
      setNotifActionLoadingId(notification.id);
      const { data: apt, error: aptErr } = await supabase
        .from('apartments')
        .select('id, partner_ids, owner_id, title, city')
        .eq('id', apartmentId)
        .maybeSingle();
      if (aptErr) throw aptErr;
      if (!apt) throw new Error('הדירה לא נמצאה');

      const currentPartnerIds: string[] = Array.isArray((apt as any).partner_ids) ? ((apt as any).partner_ids as string[]) : [];
      if (!currentPartnerIds.includes(user.id)) {
        const newPartnerIds = Array.from(new Set([...(currentPartnerIds || []), user.id]));
        const { error: updateErr } = await supabase.from('apartments').update({ partner_ids: newPartnerIds }).eq('id', apartmentId);
        if (updateErr) throw updateErr;
      }

      // Update notification in-place to reflect approval and hide the button
      const approvedTitle = 'אושר צירוף לדירה';
      const approvedDesc = `אישרת את הבקשה להיות שותף בדירה\n---\nINVITE_APT:${apartmentId}\nSTATUS:APPROVED`;
      await supabase.from('notifications').update({ title: approvedTitle, description: approvedDesc, is_read: true }).eq('id', notification.id);

      // Notify original sender (deduped)
      try {
        const approverName = await computeGroupAwareLabel(user.id);
        const backTitle = 'שותף אישר להצטרף';
        const backDesc = `${approverName} אישר/ה להצטרף לדירה${(apt as any)?.title ? `: ${(apt as any).title}` : ''}${
          (apt as any)?.city ? ` (${(apt as any).city})` : ''
        }\n---\nAPPROVED_APT:${apartmentId}\nSTATUS:APPROVED`;
        await insertNotificationOnce({
          sender_id: user.id,
          recipient_id: notification.sender_id,
          title: backTitle,
          description: backDesc,
          is_read: false,
          event_key: `apt_invite_notif:${notification.id}:approved`,
        });
      } catch {}

      await fetchNotifications({ markRead: true });
      Alert.alert('הצלחה', 'אושרת והוספת כשותף לדירה');
    } catch (e: any) {
      console.error('Approve invite failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לאשר את ההזמנה');
    } finally {
      setNotifActionLoadingId(null);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [user?.id]);

  // When opening this screen (also used for /notifications), clear the unified bell badge.
  // Needs to run on focus (tab switches don't always remount the component).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const run = async () => {
        if (!user?.id) return;

        // 1) Hide immediately (optimistic)
        markSeenNow();

        // 2) Mark notifications read in DB (including merged-profile recipients)
        await fetchNotifications({ markRead: true });

        // 3) Re-assert after DB update to avoid a race where the bell refetches before the update finishes
        if (!cancelled) markSeenNow();
      };
      run();
      return () => {
        cancelled = true;
      };
    }, [user?.id])
  );

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

      // 2) Core INCOMING queries in parallel (we no longer show "sent requests")
      const [
        { data: rData, error: rErr },
        { data: mRecv, error: mRErr },
        { data: gRecv, error: gRErr },
        groupRecvResult,
      ] = await Promise.all([
        supabase.from('apartments_request').select('*').eq('recipient_id', user.id).order('created_at', { ascending: false }),
        supabase.from('matches').select('*').eq('receiver_id', user.id).order('created_at', { ascending: false }),
        supabase.from('profile_group_invites').select('*').eq('invitee_id', user.id).order('created_at', { ascending: false }),
        myGroupIds.length
          ? supabase.from('matches').select('*').in('receiver_group_id', myGroupIds).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (rErr) throw rErr;
      if (mRErr) throw mRErr;
      if (gRErr) throw gRErr;
      const mRecvGroup = (groupRecvResult as any)?.data || [];

      // 2b) Additional incoming GROUP invites: include invites sent to ANY ACTIVE member of my merged profile(s)
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
          // If there are groupmate ids, fetch invites addressed to them (this includes me; we'll dedupe by id)
          if (myGroupmateIds.length) {
            const { data: gRecvGroupmates } = await supabase
              .from('profile_group_invites')
              .select('*')
              .in('invitee_id', myGroupmateIds)
              .order('created_at', { ascending: false });
            gRecvForMyGroups = (gRecvGroupmates || []) as any[];
          }
        }
      } catch {
        gRecvForMyGroups = [];
      }

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
      // Merge direct incoming group invites (to me) with those targeting my groupmates; dedupe by id
      const groupRecvRaw = (() => {
        const map: Record<string, any> = {};
        ([(gRecv || []), gRecvForMyGroups] as any[]).flat().forEach((row: any) => {
          if (row?.id && !map[row.id]) map[row.id] = row;
        });
        return Object.values(map);
      })();
      const groupRecv: UnifiedItem[] = (groupRecvRaw || []).map((row: any) => ({
        id: row.id,
        kind: 'GROUP',
        sender_id: row.inviter_id,
        recipient_id: row.invitee_id,
        apartment_id: null,
        status: mapGroupStatus(row.status),
        created_at: row.created_at,
        _sender_group_id: row.group_id, // inviter's group
      }));

      const recvUnifiedRaw = [...aptRecv, ...matchRecv, ...matchRecvFromGroups, ...groupRecv]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      // Normalize display user for group-targeted matches:
      // For any item with _receiver_group_id, choose a representative member so recipient_id is a real user id.
      const groupIdsForDisplay = Array.from(
        new Set<string>([
          ...((matchRecvFromGroups as any[]) || []).map((r: any) => r._receiver_group_id).filter(Boolean),
          // Ensure we fetch members for inviter's group in GROUP invites and match sender groups
          ...((groupRecv as any[]) || []).map((r: any) => r._sender_group_id).filter(Boolean),
          ...((matchRecv as any[]) || []).map((r: any) => r._sender_group_id).filter(Boolean),
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
      const normalizeRecv = recvUnifiedRaw.map((item: any) => {
        if (item.kind === 'MATCH' && !item.recipient_id && item._receiver_group_id) {
          const displayUser = pickGroupDisplayUser(item._receiver_group_id, user.id);
          return { ...item, recipient_id: displayUser || item.sender_id };
        }
        return item;
      });

      setReceived(normalizeRecv as any);

      const userIds = Array.from(new Set([
        ...(normalizeRecv as UnifiedItem[]).map((r) => r.sender_id),
        ...(normalizeRecv as UnifiedItem[]).map((r) => r.recipient_id),
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
      setReceived([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchAll(), fetchNotifications({ markRead: true })]);
    } finally {
      setRefreshing(false);
    }
  };

  const approveIncoming = async (req: UnifiedItem) => {
    if (!user?.id || !req.apartment_id) return;
    try {
      setActionId(req.id);
      // eslint-disable-next-line no-console
      console.log('[requests/approveIncoming] start', {
        reqId: req.id,
        kind: req.kind,
        type: (req as any)?.type,
        sender_id: req.sender_id,
        recipient_id: req.recipient_id,
        aptId: req.apartment_id,
      });
      // Load apartment details (for notification text)
      const { data: apt, error: aptErr } = await supabase
        .from('apartments')
        .select('id, owner_id, title, city, partner_ids')
        .eq('id', req.apartment_id)
        .maybeSingle();
      if (aptErr) throw aptErr;
      if (!apt) throw new Error('דירה לא נמצאה');
      // eslint-disable-next-line no-console
      console.log('[requests/approveIncoming] loaded apartment', {
        aptId: (apt as any)?.id,
        owner_id: (apt as any)?.owner_id,
        partner_ids: (apt as any)?.partner_ids,
      });

      // Determine which user should be added as partner based on request type
      const requestType = (req as any)?.type || 'JOIN_APT';
      const userToAddId = requestType === 'INVITE_APT' ? req.recipient_id : req.sender_id;
      // eslint-disable-next-line no-console
      console.log('[requests/approveIncoming] request type & userToAdd', {
        requestType,
        userToAddId,
      });

      // 1) update request status
      await supabase
        .from('apartments_request')
        .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
        .eq('id', req.id);
      // eslint-disable-next-line no-console
      console.log('[requests/approveIncoming] apartments_request updated -> APPROVED', { reqId: req.id });

      // 2) add the approved user to the apartment's partner_ids (idempotent)
      //    Only for INVITE_APT. For JOIN_APT (owner approves a requester) we do NOT add as partner automatically.
      const currentPartnerIds: string[] = Array.isArray((apt as any).partner_ids)
        ? ((apt as any).partner_ids as string[])
        : [];
      let finalPartnerIds: string[] = currentPartnerIds;
      if (requestType === 'INVITE_APT' && userToAddId && !currentPartnerIds.includes(userToAddId)) {
        const newPartnerIds = Array.from(new Set([...(currentPartnerIds || []), userToAddId]));
        const { error: updateErr } = await supabase
          .from('apartments')
          .update({ partner_ids: newPartnerIds })
          .eq('id', req.apartment_id);
        if (updateErr) throw updateErr;
        finalPartnerIds = newPartnerIds;
      }
      // eslint-disable-next-line no-console
      console.log('[requests/approveIncoming] partner_ids after approval', {
        finalPartnerIds,
      });

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
        await insertNotificationOnce({
          sender_id: user.id,
          recipient_id: req.sender_id,
          title: 'הוזמנה אושרה',
          description: `${approverName} אישר/ה והתווסף/ה כשותף/ה לדירה${aptTitle ? `: ${aptTitle}` : ''}${aptCity ? ` (${aptCity})` : ''}.`,
          is_read: false,
          event_key: `apt_invite:${req.id}:approved`,
        });
        // If invite was sent to a merged profile, approve all parallel requests for group members
        try {
          const { data: mem } = await supabase
            .from('profile_group_members')
            .select('group_id')
            .eq('user_id', user.id)
            .eq('status', 'ACTIVE')
            .maybeSingle();
          const gId = (mem as any)?.group_id as string | undefined;
          if (gId) {
            const { data: groupMems } = await supabase
              .from('profile_group_members')
              .select('user_id')
              .eq('group_id', gId)
              .eq('status', 'ACTIVE');
            let memberIds = (groupMems || []).map((r: any) => r.user_id).filter(Boolean);
            // Also collect any request rows that were created for this same group to ensure full coverage
            try {
              const { data: related } = await supabase
                .from('apartments_request')
                .select('recipient_id')
                .eq('sender_id', req.sender_id)
                .eq('apartment_id', req.apartment_id as any)
                .eq('type', 'INVITE_APT')
                .contains('metadata', { group_id: gId } as any);
              const viaReqIds = ((related || []) as any[]).map((r) => r.recipient_id).filter(Boolean);
              memberIds = Array.from(new Set<string>([...memberIds, ...viaReqIds]));
            } catch {}
            if (memberIds.length) {
              await supabase
                .from('apartments_request')
                .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
                .eq('sender_id', req.sender_id)
                .eq('apartment_id', req.apartment_id as any)
                .eq('type', 'INVITE_APT')
                .in('recipient_id', memberIds as any);
              // Add all group members as partners to the apartment (idempotent)
              const existing: string[] = Array.isArray((apt as any).partner_ids)
                ? ((apt as any).partner_ids as string[])
                : [];
              const ownerId = (apt as any)?.owner_id as string | undefined;
              const toAdd = memberIds.filter(
                (id) => id && id !== ownerId && !existing.includes(id)
              );
              if (toAdd.length) {
                const newPartnerIds = Array.from(new Set([...(existing || []), ...toAdd]));
                const { error: updPartnersErr } = await supabase
                  .from('apartments')
                  .update({ partner_ids: newPartnerIds })
                  .eq('id', req.apartment_id as any);
                if (!updPartnersErr) {
                  finalPartnerIds = newPartnerIds; // reflect for downstream logic
                }
              }
              // Ensure inviter joins the invitee's group (best-effort)
              try {
                const inviterId = req.sender_id;
                if (inviterId) {
                  // First try to insert inviter directly to approver's group
                  const insRes = await supabase
                    .from('profile_group_members')
                    .insert([{ group_id: gId, user_id: inviterId, status: 'ACTIVE' } as any], {
                      onConflict: 'group_id,user_id',
                      ignoreDuplicates: true,
                    } as any);
                  if ((insRes as any)?.error || (insRes as any)?.status === 409) {
                    await supabase
                      .from('profile_group_members')
                      .update({ status: 'ACTIVE' })
                      .eq('group_id', gId)
                      .eq('user_id', inviterId);
                  }
                }
              } catch {
                // If direct add fails due to RLS, fall back to sending an invite to inviter
                try {
                  await supabase.from('profile_group_invites').insert({
                    inviter_id: user.id,
                    invitee_id: req.sender_id,
                    group_id: gId,
                    status: 'PENDING',
                  } as any, { ignoreDuplicates: true } as any);
                } catch {}
              }
            }
          }
        } catch {}
      } else {
        // JOIN_APT: requester approved by recipient — notify requester (sender)
        const approverName = await computeGroupAwareLabel(user.id);
        await insertNotificationOnce({
          sender_id: user.id,
          recipient_id: req.sender_id,
          title: 'בקשתך אושרה',
          description: `מנהל הנכס מעוניין בך כשותף בדירה${aptTitle ? `: ${aptTitle}` : ''}${aptCity ? ` (${aptCity})` : ''}. אנא העבירו את השיחה לוואטסאפ כדי להשלים את התהליך.`,
          is_read: false,
          event_key: `apt_join:${req.id}:approved`,
        });
      }

      // 4) Merge profiles only for apartment invitations initiated by the owner (INVITE_APT).
      // For JOIN_APT (owner receives a join request) we intentionally do NOT merge profiles.
      if (requestType === 'INVITE_APT') {
        try {
          const inviterId = req.sender_id;
          const ownerId = (apt as any)?.owner_id as string | undefined;
          // כל המשתמשים שקשורים לדירה: בעלים, שותפים (partner_ids), מי שאישר עכשיו, והמזמין עצמו
          const apartmentUserIds = Array.from(
            new Set<string>(
              [...(finalPartnerIds || []), ownerId, userToAddId, inviterId].filter(Boolean) as string[]
            )
          );
          if (apartmentUserIds.length) {
            // Prefer the invitee's existing group if available
            let inviteeGroupId: string | undefined;
            try {
              const { data: mem2 } = await supabase
                .from('profile_group_members')
                .select('group_id')
                .eq('user_id', user.id)
                .eq('status', 'ACTIVE')
                .maybeSingle();
              inviteeGroupId = (mem2 as any)?.group_id as string | undefined;
            } catch {}
            const { data: activeMems } = await supabase
              .from('profile_group_members')
              .select('user_id, group_id')
              .eq('status', 'ACTIVE')
              .in('user_id', apartmentUserIds);
            const inviterGroupId =
              (activeMems || []).find((m: any) => m.user_id === inviterId)?.group_id as string | undefined;
            const anyExistingGroupId = (activeMems || [])[0]?.group_id as string | undefined;
            let targetGroupId = inviteeGroupId || inviterGroupId || anyExistingGroupId || null;
            if (!targetGroupId) {
              const { data: created, error: createErr } = await supabase
                .from('profile_groups')
                .insert({ created_by: user.id, name: 'שותפים', status: 'ACTIVE' } as any)
                .select('id')
                .single();
              if (createErr) throw createErr;
              targetGroupId = (created as any)?.id as string;
            } else {
              // אם הקבוצה קיימת אבל לא ACTIVE, נהפוך אותה ל-ACTIVE כדי שתחשוב כמיזוג פעיל
              try {
                await supabase
                  .from('profile_groups')
                  .update({ status: 'ACTIVE' })
                  .eq('id', targetGroupId)
                  .neq('status', 'ACTIVE');
              } catch {
                // best-effort בלבד
              }
            }
            try {
              await supabase.rpc('add_self_to_group', { p_group_id: targetGroupId });
            } catch {}
            // Fallback: ensure approver is ACTIVE member of the group (needed for RLS to allow adding others)
            try {
              const insSelf = await supabase
                .from('profile_group_members')
                .insert([{ group_id: targetGroupId, user_id: user.id, status: 'ACTIVE' } as any], {
                  onConflict: 'group_id,user_id',
                  ignoreDuplicates: true,
                } as any);
              if ((insSelf as any)?.error || (insSelf as any)?.status === 409) {
                await supabase
                  .from('profile_group_members')
                  .update({ status: 'ACTIVE' })
                  .eq('group_id', targetGroupId)
                  .eq('user_id', user.id);
              }
            } catch {}

            // הוספה מפורשת של המזמין (sender) לקבוצה, כדי לוודא שתמיד נכנס כחבר ACTIVE
            // eslint-disable-next-line no-console
            console.log('=== ADDING INVITER ===', { inviterId, targetGroupId, currentUserId: user.id });
            if (inviterId && targetGroupId && inviterId !== user.id) {
              try {
                // eslint-disable-next-line no-console
                console.log('INSERTING inviter:', { group_id: targetGroupId, user_id: inviterId, status: 'ACTIVE' });
                const { data: insertResult, error: inviterErr } = await supabase
                  .from('profile_group_members')
                  .insert([{ group_id: targetGroupId, user_id: inviterId, status: 'ACTIVE' } as any])
                  .select();
                // eslint-disable-next-line no-console
                console.log('INSERT RESULT:', { insertResult, inviterErr });
                if (inviterErr) {
                  // eslint-disable-next-line no-console
                  console.log('INSERT FAILED, trying UPDATE instead');
                  // אם יש conflict, נעדכן את הסטטוס ל-ACTIVE
                  const { data: updateResult, error: updateErr } = await supabase
                    .from('profile_group_members')
                    .update({ status: 'ACTIVE' })
                    .eq('group_id', targetGroupId)
                    .eq('user_id', inviterId)
                    .select();
                  // eslint-disable-next-line no-console
                  console.log('UPDATE RESULT:', { updateResult, updateErr });
                }
                // eslint-disable-next-line no-console
                console.log('=== INVITER ADDED SUCCESSFULLY ===');
              } catch (err) {
                // eslint-disable-next-line no-console
                console.error('!!! FAILED to add inviter to group !!!', err);
              }
            } else {
              // eslint-disable-next-line no-console
              console.log('SKIPPED inviter addition - condition failed:', {
                hasInviterId: !!inviterId,
                hasTargetGroupId: !!targetGroupId,
                isDifferentFromCurrentUser: inviterId !== user.id,
              });
            }

            const others = apartmentUserIds.filter((uid) => uid !== user.id);
            if (others.length) {
              const { data: targetMembersRows } = await supabase
                .from('profile_group_members')
                .select('user_id')
                .eq('group_id', targetGroupId)
                .eq('status', 'ACTIVE');
              const targetMemberIds = new Set<string>((targetMembersRows || []).map((row: any) => row.user_id));
              for (const otherId of others) {
                if (!otherId || targetMemberIds.has(otherId)) continue;
                let added = false;
                try {
                  // ניסיון ישיר להכניס כחבר ACTIVE בקבוצה (אידמפוטנטי)
                  const { error: insErr } = await supabase
                    .from('profile_group_members')
                    .insert(
                      [{ group_id: targetGroupId, user_id: otherId, status: 'ACTIVE' } as any],
                      {
                        onConflict: 'group_id,user_id',
                        ignoreDuplicates: true,
                        returning: 'minimal',
                      } as any
                    );
                  if (!insErr) {
                    added = true;
                  }
                } catch {}
                if (!added) {
                  try {
                    // אם ההכנסה נחסמת (RLS וכו'), לפחות נשלח הזמנה לקבוצה
                    await supabase
                      .from('profile_group_invites')
                      .insert(
                        { inviter_id: user.id, invitee_id: otherId, group_id: targetGroupId, status: 'PENDING' } as any,
                        { ignoreDuplicates: true } as any
                      );
                    added = true;
                  } catch {}
                }
                if (added) {
                  targetMemberIds.add(otherId);
                }
              }
            }
            // If inviter already belongs to another ACTIVE group, merge that group's members into targetGroupId
            if (inviterId) {
              const { data: invGroupMem, error: invGroupErr } = await supabase
                .from('profile_group_members')
                .select('group_id')
                .eq('user_id', inviterId)
                .eq('status', 'ACTIVE')
                .maybeSingle();
              if (!invGroupErr) {
                const inviterOwnGroupId = (invGroupMem as any)?.group_id as string | undefined;
                if (inviterOwnGroupId && inviterOwnGroupId !== targetGroupId) {
                  const [{ data: invGroupMembers }, { data: targetMembers }] = await Promise.all([
                    supabase
                      .from('profile_group_members')
                      .select('user_id')
                      .eq('group_id', inviterOwnGroupId)
                      .eq('status', 'ACTIVE'),
                    supabase
                      .from('profile_group_members')
                      .select('user_id')
                      .eq('group_id', targetGroupId)
                      .eq('status', 'ACTIVE'),
                  ]);
                  const targetMemberSet = new Set<string>((targetMembers || []).map((m: any) => m.user_id));
                  const membersToMerge = (invGroupMembers || [])
                    .map((m: any) => m.user_id as string)
                    .filter((uid) => uid && !targetMemberSet.has(uid));
                  for (const uid of membersToMerge) {
                    try {
                      const insertMerge = await supabase
                        .from('profile_group_members')
                        .insert([{ group_id: targetGroupId, user_id: uid, status: 'ACTIVE' } as any], {
                          onConflict: 'group_id,user_id',
                          ignoreDuplicates: true,
                        } as any);
                      if ((insertMerge as any)?.error) {
                        throw (insertMerge as any).error;
                      }
                    } catch {
                      try {
                        await supabase
                          .from('profile_group_invites')
                          .insert(
                            { inviter_id: user.id, invitee_id: uid, group_id: targetGroupId, status: 'PENDING' } as any,
                            { ignoreDuplicates: true } as any
                          );
                      } catch {}
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('ensure shared group for apartment failed', e);
        }
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

      // 2) Accept the invite
      await supabase
        .from('profile_group_invites')
        .update({ status: 'ACCEPTED', responded_at: new Date().toISOString() })
        .eq('id', item.id);
      
      // 3) Determine ACTIVE group ids
      // Prefer the approver's (me) actual membership; for inviter, fall back to invite.group_id if RLS hides membership
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

      // Detect "temporary" groups that hold only the inviter (created automatically on request send)
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
        try {
          await supabase.from('profile_group_members').delete().eq('group_id', inviterSoloGroupId);
        } catch {}
        try {
          await supabase.from('profile_group_invites').delete().eq('group_id', inviterSoloGroupId);
        } catch {}
        try {
          await supabase.from('profile_groups').delete().eq('id', inviterSoloGroupId);
        } catch {}
        inviterGroupId = undefined;
      }

      // 4) Execute the correct scenario (early return per case)
      let finalGroupId: string | undefined;
      if (approverGroupId && !inviterGroupId) {
        // Case 1: invitee has group, inviter doesn't → add inviter to invitee's group
        const insertRes = await supabase
          .from('profile_group_members')
          .insert([{ group_id: approverGroupId, user_id: inviterId, status: 'ACTIVE' } as any], {
            onConflict: 'group_id,user_id',
            ignoreDuplicates: true,
          } as any);
        if ((insertRes as any)?.error) {
          // Fallback: if cannot add directly (RLS), send an invite to join my group
          try {
            await supabase.from('profile_group_invites').insert({
              inviter_id: user.id,
              invitee_id: inviterId,
              group_id: approverGroupId,
              status: 'PENDING',
            } as any, { ignoreDuplicates: true } as any);
          } catch {}
        }
        // Optimistic UI
        setReceived((prev) => prev.map((r) => (r.id === item.id ? { ...r, status: 'APPROVED' } as any : r)));
        finalGroupId = approverGroupId;
      } else if (!approverGroupId && inviterGroupId) {
        // Case 2: inviter has group, invitee doesn't → add invitee to inviter's group
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
        // Case 3: neither has a group → create new group and add both
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
        // Case 4: both have groups → merge into a brand-new group with all members
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
        if (inviterId) memberSet.add(inviterId);
        if (inviteeId) memberSet.add(inviteeId);
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

      if (!finalGroupId) {
        finalGroupId = approverGroupId || inviterGroupId;
      }

      let finalGroupMemberIds: string[] = [];
      if (finalGroupId) {
        try {
          const { data: finalMembers } = await supabase
            .from('profile_group_members')
            .select('user_id')
            .eq('group_id', finalGroupId)
            .eq('status', 'ACTIVE');
          finalGroupMemberIds = (finalMembers || []).map((row: any) => row.user_id).filter(Boolean);
        } catch {}
      }

      const syncApartmentsForUser = async (targetUserId?: string) => {
        if (!targetUserId || !finalGroupMemberIds.length) return;
        try {
          const [{ data: ownerApts }, { data: partnerApts }] = await Promise.all([
            supabase.from('apartments').select('id, owner_id, partner_ids').eq('owner_id', targetUserId),
            supabase.from('apartments').select('id, owner_id, partner_ids').contains('partner_ids', [targetUserId] as any),
          ]);
          const mapById: Record<string, any> = {};
          (ownerApts || []).forEach((apt: any) => {
            mapById[apt.id] = apt;
          });
          (partnerApts || []).forEach((apt: any) => {
            mapById[apt.id] = apt;
          });
          const targets = Object.values(mapById);
          if (!targets.length) return;
          await Promise.all(
            targets.map(async (apt: any) => {
              const ownerId = apt?.owner_id as string | undefined;
              const currentPartnerIds: string[] = Array.isArray(apt?.partner_ids)
                ? (apt.partner_ids as string[]).filter(Boolean)
                : [];
              const currentSet = new Set<string>(currentPartnerIds);
              finalGroupMemberIds.forEach((uid) => {
                if (!uid || uid === ownerId) return;
                currentSet.add(uid);
              });
              const newPartnerIds = Array.from(currentSet);
              const originalSorted = [...new Set(currentPartnerIds)].sort();
              const newSorted = [...new Set(newPartnerIds)].sort();
              if (originalSorted.join(',') !== newSorted.join(',')) {
                await supabase.from('apartments').update({ partner_ids: newPartnerIds }).eq('id', apt.id);
              }
            })
          );
        } catch (err) {
          console.warn('sync apartment partners failed', { targetUserId, err });
        }
      };

      await Promise.all([syncApartmentsForUser(inviterId), syncApartmentsForUser(inviteeId)]);

      // 5) Notify inviter
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
      await insertNotificationOnce({
        sender_id: user.id,
        recipient_id: match.sender_id,
        title: 'בקשת ההתאמה אושרה',
        description: `${approverLabel} אישר/ה את בקשת ההתאמה שלך. ניתן להמשיך לשיחה ולתאם היכרות.`,
        is_read: false,
        event_key: `match:${match.id}:approved`,
      });

      await fetchAll();
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
      await insertNotificationOnce({
        sender_id: user.id,
        recipient_id: match.sender_id,
        title: 'בקשת ההתאמה נדחתה',
        description: `${rejecterLabel} דחה/תה את בקשת ההתאמה שלך. אפשר להמשיך ולחפש התאמות נוספות.`,
        is_read: false,
        event_key: `match:${match.id}:rejected`,
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
    <View style={{ marginTop: 12, flex: 1 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {data.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Inbox size={40} color="#5e3f2d" />
          </View>
          <Text style={styles.emptyTitle}>אין כרגע בקשות</Text>
          <Text style={styles.emptySubtitle}>כשתתקבל בקשה חדשה נציג אותה כאן</Text>
        </View>
      ) : (
        <Animated.FlatList
          data={data}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5e3f2d" />}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
            useNativeDriver: true,
          })}
          scrollEventThrottle={16}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item, index }) => {
            /**
             * Scroll-based fade/scale (match notifications screen behavior):
             * Start fading only כשהכרטיס מתקרב לחלק העליון, not mid-screen.
             */
            const ITEM_SIZE = 156; // approx height incl. spacing; tuned in notifications
            const FADE_DISTANCE = 72; // px fade window
            const FADE_START_OFFSET = 8; // start fading only once the card passes the top edge a bit

            const fadeStart = ITEM_SIZE * index + FADE_START_OFFSET;
            const fadeEnd = fadeStart + FADE_DISTANCE;

            const scale = scrollY.interpolate({
              inputRange: [fadeStart, fadeEnd],
              outputRange: [1, 0.96],
              extrapolate: 'clamp',
            });
            const opacity = scrollY.interpolate({
              inputRange: [fadeStart, fadeEnd],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            });

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
            const groupMembersWithId = groupMemberIds
              .map((id) => ({ id, ...(usersById[id] || {}) }))
              .filter((m) => !!m?.id) as Array<Partial<User> & { id: string }>;
            // For merge-profile requests (GROUP), show the people I'm choosing to merge with (exclude myself when possible)
            const mergeAvatarMembers =
              item.kind === 'GROUP'
                ? groupMembers
                    .filter((m: any) => {
                      const mid = m?.id as string | undefined;
                      return !mid || mid !== user?.id;
                    })
                    .slice(0, 3)
                : [];
            const mergeProposerMembers =
              item.kind === 'GROUP'
                ? groupMembersWithId.filter((m: any) => {
                    const mid = m?.id as string | undefined;
                    return !mid || mid !== user?.id;
                  })
                : [];
            const apt = (item.kind === 'APT' || item.kind === 'APT_INVITE') && item.apartment_id ? aptsById[item.apartment_id] : undefined;
            const aptImage = apt ? (Array.isArray(apt.image_urls) && (apt.image_urls as any[]).length ? (apt.image_urls as any[])[0] : APT_PLACEHOLDER) : null;
            const ownerUser = apt && (apt as any).owner_id ? ownersById[(apt as any).owner_id as string] : undefined;
            const ownerPhone = ownerUser?.phone as string | undefined;
            const showApprovedBadge =
              item.status === 'APPROVED' &&
              // Avoid duplicating the existing sender-view approved tags row for JOIN_APT
              !(!incoming && item.kind === 'APT' && (item.type === 'JOIN_APT' || !item.type));
            return (
              <Animated.View style={{ opacity, transform: [{ scale }] }}>
                <View style={styles.cardShadow}>
                  <View style={styles.card}>
                    <View style={styles.cardInner}>
                  {item.kind === 'MATCH' && !isGroupMatch ? (
                    <View style={styles.thumbWrap}>
                      <Image
                        source={{ uri: (otherUser?.avatar_url as string | undefined) || DEFAULT_AVATAR }}
                        style={styles.thumbImg}
                      />
                    </View>
                  ) : !!aptImage ? (
                    <View style={styles.thumbWrap}>
                      <Image source={{ uri: aptImage }} style={styles.thumbImg} />
                    </View>
                  ) : (isGroupMatch || isGroupInvite) && groupMembers.length ? (
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
                  ) : null}
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    {/* Allow long titles/subtitles to wrap instead of truncating with "..." */}
                    <Text style={styles.cardTitle}>
                      {item.kind === 'APT'
                        ? 'בקשת הצטרפות לדירה'
                        : item.kind === 'APT_INVITE'
                        ? 'הזמנה להצטרף לדירה'
                        : item.kind === 'MATCH'
                        ? 'בקשת התאמה'
                        : 'בקשת מיזוג פרופילים'}
                    </Text>
                    {item.kind === 'MATCH' && !isGroupMatch && !!otherUser?.full_name ? (
                      <>
                        <Text style={styles.matchSubtitle}>{otherUser.full_name} אהב את הפרופיל שלך</Text>
                        <TouchableOpacity
                          style={styles.matchUserRow}
                          activeOpacity={0.85}
                          onPress={() => {
                            const id = incoming ? item.sender_id : item.recipient_id;
                            if (id) router.push({ pathname: '/user/[id]', params: { id } });
                          }}
                        >
                          <View style={styles.matchMiniAvatarWrap}>
                            <Image
                              source={{ uri: (otherUser.avatar_url as string | undefined) || DEFAULT_AVATAR }}
                              style={styles.matchMiniAvatarImg}
                              resizeMode="cover"
                            />
                          </View>
                          <Text style={styles.matchMiniName}>{otherUser.full_name}</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                    {incoming && item.kind === 'GROUP' && mergeProposerMembers.length ? (
                      <View style={styles.mergeProposersList}>
                        {mergeProposerMembers.map((m: any, idx: number) => (
                          <TouchableOpacity
                            key={(m?.id as string | undefined) || `m-${idx}`}
                            style={styles.mergeProposerRow}
                            activeOpacity={0.85}
                            onPress={() => {
                              const id = m?.id as string | undefined;
                              if (id) router.push({ pathname: '/user/[id]', params: { id } });
                            }}
                          >
                            <View style={styles.mergeProposerAvatarWrap}>
                              <Image
                                source={{ uri: m?.avatar_url || DEFAULT_AVATAR }}
                                style={styles.mergeProposerAvatarImg}
                                resizeMode="cover"
                              />
                            </View>
                            <Text style={styles.mergeProposerName}>{m?.full_name || 'משתמש'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                    {!!apt && (
                      <View style={{ alignSelf: 'stretch', marginTop: 4 }}>
                        <Text style={styles.cardSub}>{apt.title}</Text>
                        <Text style={styles.aptCity}>{apt.city}</Text>
                      </View>
                    )}
                    {showApprovedBadge ? (
                      <View style={styles.approvedRow}>
                        {incoming &&
                        item.kind === 'APT' &&
                        item.status === 'APPROVED' &&
                        (item.type === 'JOIN_APT' || !item.type) &&
                        groupMembers.length === 0 &&
                        !!otherUser?.phone ? (
                          <TouchableOpacity
                            style={styles.whatsappBtnPill}
                            activeOpacity={0.85}
                            accessibilityLabel="וואטסאפ"
                            onPress={() =>
                              openWhatsApp(
                                otherUser.phone as string,
                                `היי${otherUser?.full_name ? ` ${otherUser.full_name.split(' ')[0]}` : ''}, ראיתי שהתעניינת לאחרונה בדירה שלי${apt?.title ? `: ${apt.title}` : ''}${apt?.city ? ` (${apt.city})` : ''} ב-Homie. הבקשה אושרה, אשמח לתאם שיחה או צפייה.`
                              )
                            }
                          >
                            <View style={styles.whatsappIconCircle}>
                              <WhatsAppSvg size={14} color="#25D366" />
                            </View>
                            <Text style={styles.whatsappBtnText}>וואטסאפ</Text>
                          </TouchableOpacity>
                        ) : null}
                        <View style={styles.approvedInlinePill}>
                          <Text style={styles.approvedInlinePillText}>מאושרת</Text>
                        </View>
                      </View>
                    ) : null}
                    {/* Unified user display: avatar + name under the title (no side avatar). */}
                    {item.kind === 'MATCH' && !isGroupMatch ? null : item.kind !== 'GROUP' && groupMembersWithId.length ? (
                      <View style={styles.mergeProposersList}>
                        {groupMembersWithId.slice(0, 3).map((m: any, idx: number) => (
                          <TouchableOpacity
                            key={(m?.id as string | undefined) || `gm-${idx}`}
                            style={styles.mergeProposerRow}
                            activeOpacity={0.85}
                            onPress={() => {
                              const id = m?.id as string | undefined;
                              if (id) router.push({ pathname: '/user/[id]', params: { id } });
                            }}
                          >
                            <View style={styles.mergeProposerAvatarWrap}>
                              <Image
                                source={{ uri: m?.avatar_url || DEFAULT_AVATAR }}
                                style={styles.mergeProposerAvatarImg}
                                resizeMode="cover"
                              />
                            </View>
                            <Text style={styles.mergeProposerName}>{m?.full_name || 'משתמש'}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : item.kind === 'MATCH' && !isGroupMatch ? null : !!otherUser?.full_name ? (
                      <TouchableOpacity
                        style={styles.inviterRow}
                        activeOpacity={0.85}
                        onPress={() => {
                          const id = incoming ? item.sender_id : item.recipient_id;
                          if (id) router.push({ pathname: '/user/[id]', params: { id } });
                        }}
                      >
                        <View style={styles.inviterAvatarWrap}>
                          <Image
                            source={{ uri: otherUser.avatar_url || DEFAULT_AVATAR }}
                            style={styles.inviterAvatarImg}
                            resizeMode="cover"
                          />
                        </View>
                        <Text style={styles.inviterName}>{otherUser.full_name}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {/* Sender view (sent): approved JOIN_APT shows tags + modal details instead of inline phone/WhatsApp */}
                    {!incoming && item.kind === 'APT' && item.status === 'APPROVED' && (item.type === 'JOIN_APT' || !item.type) ? (
                      <View style={styles.tagsRow}>
                        <View style={styles.tagApproved}>
                          <Text style={styles.tagApprovedText}>אושרה</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.tagDetails}
                          activeOpacity={0.85}
                          onPress={() => {
                            const full_name = (ownerUser?.full_name as string | undefined) || (otherUser?.full_name as string | undefined);
                            const avatar_url = (ownerUser?.avatar_url as string | undefined) || (otherUser?.avatar_url as string | undefined);
                            const phone = (ownerUser?.phone as string | undefined) || ownerPhone || (otherUser?.phone as string | undefined);
                            setOwnerDetails({ full_name, avatar_url, phone });
                          }}
                        >
                          <Text style={styles.tagDetailsText}>פרטים נוספים</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    <View style={{ marginTop: 10, flexDirection: 'row-reverse', gap: 8 as any }}>
                      {incoming && (item.kind === 'APT' || item.kind === 'APT_INVITE') && item.status === 'PENDING' && (
                        <View style={{ flexDirection: 'row-reverse', gap: 8 as any }}>
                          <TouchableOpacity
                            style={[styles.approveBtnLight, actionId === item.id && { opacity: 0.7 }]}
                            onPress={() => approveIncoming(item)}
                            disabled={actionId === item.id}
                            activeOpacity={0.85}
                          >
                            {actionId === item.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.approveBtnTextLight}>אשר בקשה</Text>}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.rejectBtnLight, actionId === item.id && { opacity: 0.7 }]}
                            onPress={() => rejectIncoming(item)}
                            disabled={actionId === item.id}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.rejectBtnTextLight}>דחייה</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {incoming && item.kind === 'GROUP' && item.status === 'PENDING' && (
                        <View style={{ alignSelf: 'stretch' }}>
                          <View style={{ flexDirection: 'row-reverse', gap: 8 as any }}>
                            <TouchableOpacity
                              style={[styles.approveBtnLight, actionId === item.id && { opacity: 0.7 }]}
                              onPress={() => approveIncomingGroup(item)}
                              disabled={actionId === item.id}
                              activeOpacity={0.85}
                            >
                              {actionId === item.id ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.approveBtnTextLight}>אישור</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.rejectBtnLight, actionId === item.id && { opacity: 0.7 }]}
                              onPress={() => rejectIncomingGroup(item)}
                              disabled={actionId === item.id}
                              activeOpacity={0.85}
                            >
                              <Text style={styles.rejectBtnTextLight}>דחייה</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                      {/* Recipient view (incoming): after approval expose phones.
                         If sender is a merged profile, show all members' phones; otherwise show a single phone. */}
                      {incoming && item.kind === 'APT' && item.status === 'APPROVED' && (item.type === 'JOIN_APT' || !item.type) && (
                        groupMembers.length > 0 ? (
                          <View style={{ marginTop: 12, alignItems: 'flex-end', gap: 10 as any }}>
                            {groupMembers.map((m, idx) => {
                              const firstName = (m.full_name || '').split(' ')[0] || '';
                              if (!m.phone) return null;
                              return (
                                <TouchableOpacity
                                  key={idx}
                                  style={styles.whatsappBtnPill}
                                  activeOpacity={0.85}
                                  accessibilityLabel={`וואטסאפ${firstName ? ` ל-${firstName}` : ''}`}
                                  onPress={() =>
                                    openWhatsApp(
                                      m.phone as string,
                                      `היי${firstName ? ` ${firstName}` : ''}, בקשתך להצטרף לדירה${apt?.title ? `: ${apt.title}` : ''}${apt?.city ? ` (${apt.city})` : ''} אושרה ב-Homie. אנא העבירו את השיחה לוואטסאפ כדי להשלים את התהליך.`
                                    )
                                  }
                                >
                                  <View style={styles.whatsappIconCircle}>
                                    <WhatsAppSvg size={14} color="#25D366" />
                                  </View>
                                  <Text style={styles.whatsappBtnText}>וואטסאפ</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ) : (
                          (otherUser as any)?.phone ? (
                            <TouchableOpacity
                              style={styles.whatsappBtnPill}
                              activeOpacity={0.85}
                              accessibilityLabel="וואטסאפ"
                              onPress={() => {
                                const fullName = String((otherUser as any)?.full_name || '').trim();
                                const firstName = fullName ? fullName.split(' ')[0] : '';
                                openWhatsApp(
                                  String((otherUser as any).phone),
                                  `היי${firstName ? ` ${firstName}` : ''}, בקשתך להצטרף לדירה${apt?.title ? `: ${apt.title}` : ''}${apt?.city ? ` (${apt.city})` : ''} אושרה ב-Homie. אנא העבירו את השיחה לוואטסאפ כדי להשלים את התהליך.`
                                );
                              }}
                            >
                              <View style={styles.whatsappIconCircle}>
                                <WhatsAppSvg size={14} color="#25D366" />
                              </View>
                              <Text style={styles.whatsappBtnText}>וואטסאפ</Text>
                            </TouchableOpacity>
                          ) : null
                        )
                      )}
                      {/* Sender view: approved JOIN_APT owner details moved to modal ("פרטים נוספים") */}
                      {/* Sender view (sent): expose recipient phone and WhatsApp action once a MATCH is approved */}
                      {!incoming && item.kind === 'MATCH' && item.status === 'APPROVED' && (
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
                                      backgroundColor: 'rgba(94,63,45,0.08)',
                                      borderRadius: 12,
                                      borderWidth: 1,
                                      borderColor: 'rgba(94,63,45,0.2)',
                                      padding: 12,
                                      gap: 10 as any,
                                    }}
                                  >
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 as any }}>
                                      <Image
                                        source={{ uri: m.avatar_url || DEFAULT_AVATAR }}
                                        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1F1F29', borderWidth: 2, borderColor: 'rgba(94,63,45,0.3)' }}
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
                                            `היי${firstName ? ` ${firstName}` : ''}, בקשת ההתאמה שלנו ב-Homie אושרה. בוא/י נדבר ונראה אם יש התאמה!`
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
                                backgroundColor: 'rgba(94,63,45,0.08)',
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: 'rgba(94,63,45,0.2)',
                                padding: 12,
                                gap: 10 as any,
                              }}
                            >
                              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 as any }}>
                                <Image
                                  source={{ uri: otherUser?.avatar_url || DEFAULT_AVATAR }}
                                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1F1F29', borderWidth: 2, borderColor: 'rgba(94,63,45,0.3)' }}
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
                                      `היי${otherUser?.full_name ? ` ${otherUser.full_name.split(' ')[0]}` : ''}, בקשת ההתאמה שלנו ב-Homie אושרה. בוא/י נדבר ונראה אם יש התאמה!`
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
                      {incoming && item.kind === 'MATCH' && item.status === 'PENDING' && (
                        <View style={{ flexDirection: 'row-reverse', gap: 8 as any }}>
                          <TouchableOpacity
                            style={[styles.approveBtnLight, actionId === item.id && { opacity: 0.7 }]}
                            onPress={() => approveIncomingMatch(item)}
                            disabled={actionId === item.id}
                            activeOpacity={0.85}
                          >
                            {actionId === item.id ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <Text style={styles.approveBtnTextLight}>אישור</Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.rejectBtnLight, actionId === item.id && { opacity: 0.7 }]}
                            onPress={() => rejectIncomingMatch(item)}
                            disabled={actionId === item.id}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.rejectBtnTextLight}>דחייה</Text>
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
                                      backgroundColor: 'rgba(94,63,45,0.08)',
                                      borderRadius: 12,
                                      borderWidth: 1,
                                      borderColor: 'rgba(94,63,45,0.2)',
                                      padding: 12,
                                      gap: 10 as any,
                                    }}
                                  >
                                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 as any }}>
                                      <Image
                                        source={{ uri: m.avatar_url || DEFAULT_AVATAR }}
                                        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1F1F29', borderWidth: 2, borderColor: 'rgba(94,63,45,0.3)' }}
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
                                backgroundColor: 'rgba(94,63,45,0.08)',
                                borderRadius: 12,
                                borderWidth: 1,
                                borderColor: 'rgba(94,63,45,0.2)',
                                padding: 12,
                                gap: 10 as any,
                              }}
                            >
                              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 as any }}>
                                <Image
                                  source={{ uri: otherUser?.avatar_url || DEFAULT_AVATAR }}
                                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1F1F29', borderWidth: 2, borderColor: 'rgba(94,63,45,0.3)' }}
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
                    {!!item.created_at ? (
                      <Text
                        style={[
                          styles.cardMeta,
                          styles.cardTime,
                          item.status === 'APPROVED' && { marginTop: 6 },
                        ]}
                      >
                        {formatTimeAgoHe(item.created_at)}
                      </Text>
                    ) : null}
                  </View>
                  {/* Side avatar removed: unified avatar+name row(s) render under the title */}
                    </View>
                  </View>
                </View>
              </Animated.View>
            );
          }}
        />
      )}
    </View>
  );

  type InboxRow =
    | { kind: 'NOTIFICATION'; id: string; created_at: string; notification: Notification }
    | { kind: 'REQUEST'; id: string; created_at: string; request: UnifiedItem };

  const inboxDomainForRow = (row: InboxRow): InboxFilterId | 'OTHER' => {
    if (row.kind === 'REQUEST') {
      const k = row.request.kind;
      if (k === 'MATCH') return 'MATCHES';
      if (k === 'GROUP') return 'MERGE';
      if (k === 'APT' || k === 'APT_INVITE') return 'APARTMENTS';
      return 'OTHER';
    }
    const n = row.notification;
    if (isMergeProfileNotification(n)) return 'MERGE';
    if (isMatchNotification(n)) return 'MATCHES';
    if (isApartmentNotification(n)) return 'APARTMENTS';
    return 'OTHER';
  };

  const bucketLabelHe = (iso: string): string => {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return 'מוקדם יותר';
    const now = Date.now();
    const diffDays = Math.floor((now - t) / (24 * 60 * 60 * 1000));
    if (diffDays <= 0) return 'היום';
    if (diffDays === 1) return 'אתמול';
    if (diffDays <= 7) return '7 הימים האחרונים';
    if (diffDays <= 30) return '30 הימים האחרונים';
    return 'מוקדם יותר';
  };

  const timeAgoHe = (iso: string): string => {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return 'לפני רגע';
    const diffMs = Math.max(0, Date.now() - t);
    const totalMinutes = Math.floor(diffMs / (60 * 1000));
    if (totalMinutes < 1) return 'לפני רגע';
    if (totalMinutes < 60) return `לפני ${totalMinutes} דקות`;
    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) return `לפני ${totalHours} שעות`;
    const totalDays = Math.floor(totalHours / 24);
    if (totalDays < 7) return `לפני ${totalDays} ימים`;
    const totalWeeks = Math.floor(totalDays / 7);
    if (totalWeeks < 5) return totalWeeks === 1 ? 'לפני שבוע' : `לפני ${totalWeeks} שבועות`;
    const totalMonths = Math.floor(totalDays / 30);
    return totalMonths <= 1 ? 'לפני חודש' : `לפני ${totalMonths} חודשים`;
  };

  const inboxRowsAll = useMemo<InboxRow[]>(() => {
    const skipTitles = new Set<string>([
      'בקשת שותפות חדשה',
      'בקשת שותפות מפרופיל משותף',
      'בקשת מיזוג פרופילים חדשה',
    ]);
    const notifs = (notifItems || [])
      .filter((n) => !skipTitles.has(String(n?.title || '').trim()))
      .map((n) => ({ kind: 'NOTIFICATION' as const, id: n.id, created_at: n.created_at, notification: n }));
    const reqs = (received || []).map((r) => ({ kind: 'REQUEST' as const, id: r.id, created_at: r.created_at, request: r }));
    return [...notifs, ...reqs].sort((a, b) => {
      const ta = Date.parse(a.created_at || '') || 0;
      const tb = Date.parse(b.created_at || '') || 0;
      return tb - ta;
    });
  }, [notifItems, received]);

  const inboxRows = useMemo<InboxRow[]>(() => {
    if (inboxFilter === 'ALL') return inboxRowsAll;
    return (inboxRowsAll || []).filter((row) => inboxDomainForRow(row) === inboxFilter);
  }, [inboxRowsAll, inboxFilter]);

  const inboxSections = useMemo(() => {
    const map: Record<string, InboxRow[]> = {};
    (inboxRows || []).forEach((row) => {
      const key = bucketLabelHe(row.created_at);
      if (!map[key]) map[key] = [];
      map[key].push(row);
    });
    const order = ['היום', 'אתמול', '7 הימים האחרונים', '30 הימים האחרונים', 'מוקדם יותר'];
    return order
      .filter((k) => (map[k] || []).length > 0)
      .map((k) => ({ title: k, data: map[k] }));
  }, [inboxRows]);

  return (
    <View style={styles.container}>
      <View style={{ paddingTop: insets.top + 60, flex: 1 }}>
        <View style={styles.pageBody}>
          {(loading || notifLoading) ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#5e3f2d" />
            </View>
          ) : (
            <SectionList
              sections={inboxSections as any}
              keyExtractor={(row) => `${row.kind}:${row.id}`}
              stickySectionHeadersEnabled={false}
              showsVerticalScrollIndicator={false}
              // Allow pull-to-refresh even when content doesn't fill the screen
              bounces
              alwaysBounceVertical
              overScrollMode="always"
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5e3f2d" />}
              contentContainerStyle={[
                styles.igListContent,
                { flexGrow: 1 },
                inboxRows.length === 0 ? { paddingTop: 8 } : null,
              ]}
              ListHeaderComponent={
                <View style={styles.filtersWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ direction: 'rtl' as any }}
                    contentContainerStyle={styles.segmentScrollContent}
                  >
                    {/* Keep "הכל" right-most in RTL */}
                    {[
                      { id: 'APARTMENTS' as const, label: 'דירות', Icon: Home },
                      { id: 'MERGE' as const, label: 'מיזוג פרופילים', Icon: Users },
                      { id: 'MATCHES' as const, label: 'מאצ׳ים', Icon: Sparkles },
                      { id: 'ALL' as const, label: 'הכל', Icon: Bell },
                    ].map(({ id, label, Icon }) => {
                      const active = inboxFilter === id;
                      return (
                        <TouchableOpacity
                          key={id}
                          activeOpacity={0.85}
                          onPress={() => setInboxFilter(id)}
                          style={[styles.segmentBtn, active ? styles.segmentBtnActive : null]}
                        >
                          <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{label}</Text>
                          <Icon size={14} color={active ? '#5e3f2d' : '#6B7280'} />
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconWrap}>
                    <Bell size={40} color="#5e3f2d" />
                  </View>
                  <Text style={styles.emptyTitle}>אין התראות או בקשות</Text>
                  <Text style={styles.emptySubtitle}>כשתתקבל התראה או בקשה חדשה נציג אותה כאן</Text>
                </View>
              }
              renderSectionHeader={({ section }) => (
                <Text style={styles.igSectionHeader}>{(section as any).title}</Text>
              )}
              ItemSeparatorComponent={() => <View style={styles.igSeparator} />}
              renderItem={({ item: row }: any) => {
                const createdAt = row.created_at as string;
                const timeLabel = timeAgoHe(createdAt);

                if (row.kind === 'NOTIFICATION') {
                  const n = row.notification as Notification;
                  const sender = notifSendersById[n.sender_id];
                  const aptId = extractInviteApartmentId(n.description);
                  const descText = displayDescription(n.description);
                  const canApproveInvite = !!aptId && !isInviteApproved(n.description);
                  const isApproved = isApprovedNotification(n);
                  const canOpenApartmentPanel = !!aptId;

                  return (
                    <Pressable
                      style={styles.igRow}
                      onPress={() => {
                        if (!canOpenApartmentPanel) return;
                        openApartmentPanel(aptId as string);
                      }}
                    >
                      <TouchableOpacity
                        activeOpacity={0.85}
                        style={styles.igAvatarWrap}
                        onPress={() => {
                          if (sender?.id) router.push({ pathname: '/user/[id]', params: { id: sender.id } } as any);
                        }}
                      >
                        <Image source={{ uri: sender?.avatar_url || DEFAULT_AVATAR }} style={styles.igAvatarImg} />
                      </TouchableOpacity>

                      <View style={styles.igBody}>
                        <Text style={styles.igMessage} numberOfLines={2}>
                          <Text style={styles.igTitleStrong}>{n.title}</Text>
                          {!!descText ? <Text>{` ${descText}`}</Text> : null}
                        </Text>
                        <Text style={styles.igTimeBelow}>{timeLabel}</Text>
                      </View>

                      {canApproveInvite ? (
                        <View style={styles.igActions}>
                          <TouchableOpacity
                            style={[styles.igBtnPrimary, notifActionLoadingId === n.id ? { opacity: 0.7 } : null]}
                            disabled={notifActionLoadingId === n.id}
                            activeOpacity={0.85}
                            onPress={() => handleApproveInviteFromNotification(n, aptId as string)}
                          >
                            <Text style={styles.igBtnPrimaryText}>{notifActionLoadingId === n.id ? '...' : 'אישור'}</Text>
                          </TouchableOpacity>
                        </View>
                      ) : isApproved && sender?.phone ? (
                        <View style={styles.igActions}>
                          <TouchableOpacity
                            style={styles.igWhatsappBtn}
                            activeOpacity={0.85}
                            accessibilityLabel="וואטסאפ"
                            onPress={() => {
                              const firstName = (sender?.full_name || '').split(' ')[0] || '';
                              openWhatsApp(
                                sender.phone as string,
                                `היי${firstName ? ` ${firstName}` : ''}, תודה שאישרת את הבקשה שלי ב-Homie! אשמח לדבר ולתאם פגישה 🙂`
                              );
                            }}
                          >
                            <View style={styles.igWhatsappIconCircle}>
                              <WhatsAppSvg size={14} color="#25D366" />
                            </View>
                            <Text style={styles.igWhatsappBtnText}>וואטסאפ</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                }

                // REQUEST
                const r = row.request as UnifiedItem;
                const otherUser = usersById[r.sender_id];
                const senderGroupId = (r as any)?._sender_group_id as string | undefined;
                const groupMemberIds = senderGroupId ? (groupMembersByGroupId[senderGroupId] || []) : [];
                const groupMembers = groupMemberIds.map((id) => usersById[id]).filter(Boolean) as Partial<User>[];
                const apt = r.apartment_id ? aptsById[r.apartment_id] : undefined;
                const canOpenApartmentPanel = (r.kind === 'APT' || r.kind === 'APT_INVITE') && !!r.apartment_id;

                const title =
                  r.kind === 'APT_INVITE'
                    ? 'הוזמנת להצטרף לדירה'
                    : r.kind === 'APT'
                    ? 'בקשת הצטרפות לדירה'
                    : r.kind === 'MATCH'
                    ? 'בקשת שותפות'
                    : 'בקשת מיזוג פרופילים';
                const subtitle =
                  r.kind === 'APT' || r.kind === 'APT_INVITE'
                    ? `${(apt as any)?.title || 'דירה'}${(apt as any)?.city ? ` • ${(apt as any).city}` : ''}`
                    : groupMembers.length
                    ? groupMembers.map((m) => (m as any)?.full_name).filter(Boolean).join(' • ')
                    : ((otherUser as any)?.full_name || '');

                return (
                  <Pressable
                    style={styles.igRow}
                    onPress={() => {
                      if (!canOpenApartmentPanel) return;
                      openApartmentPanel(r.apartment_id as string);
                    }}
                  >
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.igAvatarWrap}
                      onPress={() => {
                        const id = r.sender_id;
                        if (id) router.push({ pathname: '/user/[id]', params: { id } } as any);
                      }}
                    >
                      <Image source={{ uri: (otherUser as any)?.avatar_url || DEFAULT_AVATAR }} style={styles.igAvatarImg} />
                    </TouchableOpacity>

                    <View style={styles.igBody}>
                      <Text style={styles.igMessage} numberOfLines={2}>
                        <Text style={styles.igTitleStrong}>{title}</Text>
                        {!!subtitle ? <Text>{` ${subtitle}`}</Text> : null}
                      </Text>
                      <Text style={styles.igTimeBelow}>{timeLabel}</Text>
                    </View>

                    <View style={styles.igActions}>
                      {r.status === 'PENDING' ? (
                        <View style={styles.igActionsRow}>
                          <TouchableOpacity
                            style={[styles.igBtnPrimary, actionId === r.id ? { opacity: 0.7 } : null]}
                            disabled={actionId === r.id}
                            activeOpacity={0.85}
                            onPress={() => {
                              if (r.kind === 'APT' || r.kind === 'APT_INVITE') return approveIncoming(r);
                              if (r.kind === 'MATCH') return approveIncomingMatch(r);
                              if (r.kind === 'GROUP') return approveIncomingGroup(r);
                            }}
                          >
                            <Text style={styles.igBtnPrimaryText}>אישור</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.igBtnSecondary, actionId === r.id ? { opacity: 0.7 } : null]}
                            disabled={actionId === r.id}
                            activeOpacity={0.85}
                            onPress={() => {
                              if (r.kind === 'APT' || r.kind === 'APT_INVITE') return rejectIncoming(r);
                              if (r.kind === 'MATCH') return rejectIncomingMatch(r);
                              if (r.kind === 'GROUP') return rejectIncomingGroup(r);
                            }}
                          >
                            <Text style={styles.igBtnSecondaryText}>דחייה</Text>
                          </TouchableOpacity>
                        </View>
                      ) : r.status === 'APPROVED' ? (
                        <View style={styles.igActionsRow}>
                          {((r.kind === 'MATCH' || r.kind === 'APT' || r.kind === 'APT_INVITE') && !!(otherUser as any)?.phone) ? (
                            <TouchableOpacity
                              style={styles.igWhatsappBtn}
                              activeOpacity={0.85}
                              accessibilityLabel="וואטסאפ"
                              onPress={() => {
                                const fullName = String((otherUser as any)?.full_name || '').trim();
                                const firstName = fullName ? fullName.split(' ')[0] : '';
                                const aptTitle = (apt as any)?.title || '';
                                const aptCity = (apt as any)?.city || '';
                                const message =
                                  r.kind === 'MATCH'
                                    ? `היי${firstName ? ` ${firstName}` : ''}, בקשת השותפות שלנו ב-Homie אושרה. אשמח לקבוע שיחה ולהכיר 🙂`
                                    : `היי${firstName ? ` ${firstName}` : ''}, בקשתך להצטרף לדירה${aptTitle ? `: ${aptTitle}` : ''}${aptCity ? ` (${aptCity})` : ''} אושרה ב-Homie. אשמח לתאם שיחה או צפייה.`;
                                openWhatsApp(String((otherUser as any).phone), message);
                              }}
                            >
                              <View style={styles.igWhatsappIconCircle}>
                                <WhatsAppSvg size={14} color="#25D366" />
                              </View>
                              <Text style={styles.igWhatsappBtnText}>וואטסאפ</Text>
                            </TouchableOpacity>
                          ) : null}
                          <Text style={styles.igStatusText}>אושר</Text>
                        </View>
                      ) : (
                        <Text style={styles.igStatusText}>
                          {r.status === 'REJECTED' ? 'נדחה' : 'עודכן'}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
      <Modal
        visible={!!ownerDetails}
        transparent
        animationType="fade"
        onRequestClose={() => setOwnerDetails(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOwnerDetails(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>פרטי התקשרות</Text>
            <View style={styles.modalContent}>
              <View style={styles.modalHeaderRow}>
                <Image
                  source={{ uri: ownerDetails?.avatar_url || DEFAULT_AVATAR }}
                  style={styles.modalAvatar}
                  resizeMode="cover"
                />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.modalName}>{ownerDetails?.full_name || 'בעל הדירה'}</Text>
                  <Text style={styles.modalPhone}>
                    {ownerDetails?.phone ? ownerDetails.phone : 'מספר לא זמין'}
                  </Text>
                </View>
              </View>
              {ownerDetails?.phone ? (
                <TouchableOpacity
                  style={styles.modalWhatsappBtn}
                  activeOpacity={0.85}
                  onPress={() =>
                    openWhatsApp(
                      ownerDetails.phone as string,
                      `היי, בקשתי להצטרף לדירה אושרה באפליקציית Homie. אשמח לתאם שיחה/צפייה.`
                    )
                  }
                >
                  <Text style={styles.modalWhatsappText}>שלח הודעה בוואטסאפ</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Apartment details animated panel (opens when tapping apartment-related notifications/requests) */}
      <Modal
        visible={!!aptPanelAptId}
        transparent
        animationType="fade"
        onRequestClose={closeApartmentPanel}
      >
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={styles.aptPanelBackdrop}
            onPress={closeApartmentPanel}
            pointerEvents={aptPanelOpen ? 'auto' : 'none'}
          />
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <FabButton
              isOpen={aptPanelOpen}
              onPress={closeApartmentPanel}
              duration={480}
              title="פרטי הדירה"
              showToggleButton={false}
              openedSize={Math.min(screenW - 32, screenW * 0.92)}
              closedSize={0}
              panelStyle={{
                right: undefined,
                bottom: undefined,
                left: (screenW - Math.min(screenW - 32, screenW * 0.92)) / 2,
                top: Math.max(insets.top + 110, screenH * 0.22),
                backgroundColor: '#FFFFFF',
              }}
            >
              {(() => {
                const a = aptPanelAptId
                  ? ((notifApartmentsById as any)?.[aptPanelAptId] || (aptsById as any)?.[aptPanelAptId])
                  : undefined;
                const image = a
                  ? (Array.isArray(a.image_urls) && (a.image_urls as any[]).length ? (a.image_urls as any[])[0] : APT_PLACEHOLDER)
                  : APT_PLACEHOLDER;
                const title = (a?.title as string) || 'דירה';
                const city = (a?.city as string) || '';
                return (
                  <View style={styles.aptPanelCard}>
                    {/* Close button */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.aptPanelCloseBtn}
                      onPress={closeApartmentPanel}
                    >
                      <X size={20} color="#6B7280" strokeWidth={2.5} />
                    </TouchableOpacity>

                    <Image source={{ uri: image }} style={styles.aptPanelImage} />
                    <View style={styles.aptPanelInfo}>
                      <Text style={styles.aptPanelTitle} numberOfLines={1}>
                        {title}
                      </Text>
                      {!!city ? (
                        <Text style={styles.aptPanelCity} numberOfLines={1}>
                          {city}
                        </Text>
                      ) : null}
                      <View style={styles.aptPanelActions}>
                        <TouchableOpacity
                          activeOpacity={0.9}
                          style={styles.aptPanelPrimaryBtn}
                          onPress={() => {
                            const id = aptPanelAptId;
                            if (!id) return;
                            closeApartmentPanel();
                            router.push({ pathname: '/apartment/[id]', params: { id } } as any);
                          }}
                        >
                          <Text style={styles.aptPanelPrimaryBtnText}>מעבר לדירה</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </FabButton>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Keep the entire screen (including the area behind the global top bar) in the same gray.
    backgroundColor: '#FAFAFA',
  },
  pageBody: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'visible',
    paddingTop: 0,
    paddingHorizontal: 0,
  },
  filtersWrap: {
    paddingHorizontal: 0,
    paddingBottom: 4,
    alignItems: 'flex-end',
  },
  segmentScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8 as any,
  },
  segmentWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 18,
    gap: 8 as any,
  },
  segmentBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8 as any,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  segmentBtnActive: {
    borderColor: 'rgba(94,63,45,0.45)',
    backgroundColor: 'rgba(94,63,45,0.10)',
  },
  segmentText: {
    color: '#6B7280',
    fontWeight: '800',
    fontSize: 12,
  },
  segmentTextActive: {
    color: '#5e3f2d',
  },
  statusChipsRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8 as any,
  },
  dropdownRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8 as any,
  },
  selectWrap: {
    flex: 1,
    position: 'relative',
  },
  selectButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  selectCaret: {
    color: '#9CA3AF',
    fontSize: 12,
    marginLeft: 8,
  },
  menu: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    zIndex: 30,
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  menuItemActive: {
    backgroundColor: '#F3F4F6',
  },
  menuItemText: {
    color: '#374151',
    fontSize: 14,
    textAlign: 'right',
    fontWeight: '700',
  },
  menuItemTextActive: {
    color: '#5e3f2d',
  },
  switchWrap: {
    flexDirection: 'row-reverse',
    backgroundColor: '#E9EEF3',
    borderRadius: 28,
    padding: 4,
    borderWidth: 0,
    borderColor: '#E5E7EB',
    marginTop: 20,
    marginBottom: 6,
  },
  switchItem: {
    flex: 1,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  switchItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  switchItemContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8 as any,
  },
  switchText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '800',
  },
  switchTextActive: {
    color: '#5e3f2d',
  },
  switchDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusChipActive: {
    borderColor: 'rgba(94,63,45,0.45)',
    backgroundColor: 'rgba(94,63,45,0.10)',
  },
  statusChipText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '800',
  },
  statusChipTextActive: {
    color: '#5e3f2d',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
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
    color: '#0F0F14',
    fontSize: 18,
    fontWeight: '800',
  },
  listContent: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12 as any,
  },
  notifListContent: {
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12 as any,
  },
  notifActionsRow: {
    marginTop: 10,
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  // Instagram-like list styling (flat rows + section headers)
  igListContent: {
    paddingTop: 8,
    paddingBottom: 18,
    backgroundColor: '#FAFAFA',
  },
  igSectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    color: '#111827',
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  igSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 16,
  },
  igRow: {
    // Always: avatar on RIGHT, actions on LEFT (Instagram-like in Hebrew UI)
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FAFAFA',
  },
  igAvatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  igAvatarImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  igAvatarGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  igAvatarGridCell: {
    width: '50%',
    height: '50%',
    padding: 1,
  },
  igAvatarGridImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  igBody: {
    flex: 1,
    marginLeft: 12,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  igMessage: {
    color: '#111827',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
  },
  igTitleStrong: {
    fontWeight: '900',
    color: '#111827',
  },
  igTimeInline: {
    color: '#9CA3AF',
    fontWeight: '700',
  },
  igTimeBelow: {
    marginTop: 4,
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  igActions: {
    // This column sits on the LEFT (because row-reverse), so keep buttons aligned left.
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  igActionsRow: {
    flexDirection: 'row',
    gap: 8 as any,
    alignItems: 'center',
  },
  igWhatsappBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 6 as any,
    borderWidth: 1,
    borderColor: 'rgba(37, 211, 102, 0.25)',
    shadowColor: '#25D366',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  igWhatsappIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(37, 211, 102, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37, 211, 102, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  igWhatsappBtnText: {
    color: '#25D366',
    fontSize: 12,
    fontWeight: '900',
  },
  igBtnPrimary: {
    backgroundColor: '#5e3f2d',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  igBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  igBtnSecondary: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  igBtnSecondaryText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
  },
  igStatusText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 10,
    textAlign: 'right',
  },
  emptyText: {
    color: '#9DA4AE',
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 28,
    paddingBottom: 36,
    gap: 12 as any,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.20)',
  },
  emptyTitle: {
    color: '#5e3f2d',
    fontSize: 16,
    fontWeight: '900',
  },
  emptySubtitle: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  cardShadow: {
    borderRadius: 16,
    // Keep the wrapper transparent so it won't look like a "frame" around the card.
    backgroundColor: 'transparent',
    // Softer, more natural shadow
    shadowColor: '#111827',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    // Android shadow (via elevation) – keep it subtle to avoid a harsh outline
    elevation: 6,
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 6,
    height: '100%',
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  statusBadge: {
    position: 'absolute',
    top: 10,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  cardInner: {
    flexDirection: 'row-reverse',
    alignItems: 'stretch',
    padding: 14,
    gap: 12 as any,
  },
  cardTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
    flexShrink: 1,
    alignSelf: 'stretch',
  },
  approvedInlinePill: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(34,197,94,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    minHeight: 28,
    justifyContent: 'center',
  },
  approvedInlinePillText: {
    color: '#16A34A',
    fontSize: 11,
    fontWeight: '900',
    writingDirection: 'rtl',
    lineHeight: 14,
  },
  cardSub: {
    color: '#4B5563',
    fontSize: 14,
    textAlign: 'right',
    marginTop: 4,
    flexShrink: 1,
    alignSelf: 'stretch',
  },
  aptCity: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'right',
    marginTop: 2,
    fontWeight: '700',
    alignSelf: 'stretch',
  },
  matchSubtitle: {
    color: '#4B5563',
    fontSize: 13,
    textAlign: 'right',
    marginTop: 6,
    fontWeight: '700',
    alignSelf: 'stretch',
  },
  matchUserRow: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10 as any,
    alignSelf: 'stretch',
  },
  matchMiniAvatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.10)',
  },
  matchMiniAvatarImg: {
    width: '100%',
    height: '100%',
  },
  matchMiniName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
    flexShrink: 1,
  },
  cardMeta: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'right',
  },
  cardTime: {
    marginTop: 12,
  },
  tagsRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8 as any,
    alignSelf: 'stretch',
  },
  tagApproved: {
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagApprovedText: {
    color: '#16A34A',
    fontSize: 12,
    fontWeight: '900',
  },
  tagDetails: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagDetailsText: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
    justifyContent: 'center',
  },
  aptPanelBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
    marginBottom: 16,
  },
  modalContent: {
    gap: 14 as any,
  },
  modalHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12 as any,
    backgroundColor: '#F9FAFB',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1F1F29',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  modalName: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  modalPhone: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 4,
  },
  modalWhatsappBtn: {
    backgroundColor: '#25D366',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 8 as any,
  },
  modalWhatsappText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  aptPanelCard: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#111827',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  aptPanelCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  aptPanelImage: {
    width: '100%',
    height: 140,
    resizeMode: 'cover',
  },
  aptPanelInfo: {
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
    gap: 6 as any,
  },
  aptPanelTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  aptPanelCity: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  aptPanelActions: {
    width: '100%',
    marginTop: 8,
    alignItems: 'flex-end',
  },
  aptPanelPrimaryBtn: {
    backgroundColor: '#5e3f2d',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  aptPanelPrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  inviterRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8 as any,
    alignSelf: 'stretch',
  },
  inviterAvatarWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  inviterAvatarImg: {
    width: '100%',
    height: '100%',
  },
  inviterName: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    flexShrink: 1,
  },
  mergeProposersList: {
    marginTop: 8,
    alignSelf: 'stretch',
    gap: 8 as any,
  },
  mergeProposerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8 as any,
    alignSelf: 'stretch',
  },
  mergeProposerAvatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  mergeProposerAvatarImg: {
    width: '100%',
    height: '100%',
  },
  mergeProposerName: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    flexShrink: 1,
  },
  avatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  thumbWrap: {
    width: 96,
    alignSelf: 'stretch',
    minHeight: 96,
    maxHeight: 150,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  matchThumbWrap: {
    width: 96,
    height: 96,
    borderRadius: 14,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnLight: {
    backgroundColor: 'rgba(94,63,45,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.30)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  approveBtnTextLight: {
    color: '#5e3f2d',
    fontSize: 13,
    fontWeight: '800',
  },
  whatsappBtnPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6 as any,
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignSelf: 'flex-start',
    minHeight: 32,
    borderWidth: 1,
    borderColor: 'rgba(37, 211, 102, 0.25)',
    shadowColor: '#25D366',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  whatsappIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(37, 211, 102, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(37, 211, 102, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  whatsappBtnText: {
    color: '#25D366',
    fontSize: 12,
    fontWeight: '900',
    writingDirection: 'rtl',
    lineHeight: 14,
  },
  approvedRow: {
    marginTop: 8,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8 as any,
  },
  rejectBtnLight: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  rejectBtnTextLight: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '800',
  },
});


