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
import { ArrowLeft, Inbox, Send, Filter, Home, Users } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Apartment, User } from '@/types/database';

export default function RequestsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string | string[]; kind?: string | string[]; status?: string | string[] }>();
  const user = useAuthStore((s) => s.user);
  const toSingle = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;
  type KindFilterValue = 'APT' | 'MATCH' | 'ALL';
  type StatusFilterValue = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'NOT_RELEVANT';
  const parseTabParam = (value?: string): 'incoming' | 'sent' =>
    value === 'sent' ? 'sent' : 'incoming';
  const parseKindParam = (value?: string): KindFilterValue => {
    if (value === 'MATCH' || value === 'ALL') return value;
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
    kind: 'APT' | 'MATCH';
    sender_id: string;
    recipient_id: string;
    created_at: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'NOT_RELEVANT';
    apartment_id?: string | null;
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

  const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';
  const APT_PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';

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
      const [
        { data: sData, error: sErr },
        { data: rData, error: rErr },
        { data: mSent, error: mSErr },
        { data: mRecv, error: mRErr },
      ] = await Promise.all([
        supabase.from('apartments_request').select('*').eq('sender_id', user.id).order('created_at', { ascending: false }),
        supabase.from('apartments_request').select('*').eq('recipient_id', user.id).order('created_at', { ascending: false }),
        supabase.from('matches').select('*').eq('sender_id', user.id).order('created_at', { ascending: false }),
        supabase.from('matches').select('*').eq('receiver_id', user.id).order('created_at', { ascending: false }),
      ]);
      if (sErr) throw sErr;
      if (rErr) throw rErr;
      if (mSErr) throw mSErr;
      if (mRErr) throw mRErr;

      const aptSent: UnifiedItem[] = (sData || [])
        .filter((row: any) => (row.status || 'PENDING') !== 'NOT_RELEVANT')
        .map((row: any) => ({
          id: row.id,
          kind: 'APT',
          sender_id: row.sender_id,
          recipient_id: row.recipient_id,
          apartment_id: row.apartment_id,
          status: row.status || 'PENDING',
          created_at: row.created_at,
        }));
      const aptRecv: UnifiedItem[] = (rData || [])
        .filter((row: any) => (row.status || 'PENDING') !== 'NOT_RELEVANT')
        .map((row: any) => ({
          id: row.id,
          kind: 'APT',
          sender_id: row.sender_id,
          recipient_id: row.recipient_id,
          apartment_id: row.apartment_id,
          status: row.status || 'PENDING',
          created_at: row.created_at,
        }));

      const matchSent: UnifiedItem[] = (mSent || [])
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
      const matchRecv: UnifiedItem[] = (mRecv || [])
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

      const sentUnified = [...aptSent, ...matchSent].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const recvUnified = [...aptRecv, ...matchRecv].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      setSent(sentUnified);
      setReceived(recvUnified);

      const userIds = Array.from(new Set([
        ...sentUnified.map((r) => r.recipient_id),
        ...recvUnified.map((r) => r.sender_id),
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
        ...sentUnified.filter((r) => r.kind === 'APT').map((r) => r.apartment_id).filter(Boolean) as string[],
        ...recvUnified.filter((r) => r.kind === 'APT').map((r) => r.apartment_id).filter(Boolean) as string[],
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
        .select('id, owner_id, title, city')
        .eq('id', req.apartment_id)
        .maybeSingle();
      if (aptErr) throw aptErr;
      if (!apt) throw new Error('דירה לא נמצאה');

      // 1) update request status (do NOT add user to apartment yet)
      await supabase.from('apartments_request').update({ status: 'APPROVED', updated_at: new Date().toISOString() }).eq('id', req.id);

      // 2) notify original sender with guidance to contact the owner via WhatsApp
      const aptTitle = (apt as any)?.title || '';
      const aptCity = (apt as any)?.city || '';
      const backTitle = 'בקשתך אושרה';
      const backDesc = `בקשתך להצטרף לדירה${aptTitle ? `: ${aptTitle}` : ''}${aptCity ? ` (${aptCity})` : ''} אושרה.\nכעת ניתן ליצור קשר עם בעל הדירה בוואטסאפ לתיאום המשך.\n---\nAPPROVED_APT:${req.apartment_id}\nSTATUS:APPROVED`;
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

  const approveIncomingMatch = async (match: UnifiedItem) => {
    if (!user?.id) return;
    try {
      setActionId(match.id);
      await supabase
        .from('matches')
        .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
        .eq('id', match.id);

      await supabase.from('notifications').insert({
        sender_id: user.id,
        recipient_id: match.sender_id,
        title: 'בקשת ההתאמה אושרה',
        description: 'בקשת ההתאמה שלך אושרה. ניתן להמשיך לשיחה ולתאם היכרות.',
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

      await supabase.from('notifications').insert({
        sender_id: user.id,
        recipient_id: match.sender_id,
        title: 'בקשת ההתאמה נדחתה',
        description: 'הבקשה אליך נדחתה. אפשר להמשיך ולחפש התאמות נוספות.',
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
            const apt = item.kind === 'APT' && item.apartment_id ? aptsById[item.apartment_id] : undefined;
            const aptImage = apt ? (Array.isArray(apt.image_urls) && (apt.image_urls as any[]).length ? (apt.image_urls as any[])[0] : APT_PLACEHOLDER) : null;
            const ownerUser = apt && (apt as any).owner_id ? ownersById[(apt as any).owner_id as string] : undefined;
            const ownerPhone = ownerUser?.phone as string | undefined;
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
                      {item.kind === 'APT' ? 'בקשת הצטרפות לדירה' : 'בקשת התאמה'}
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
                      {incoming && item.kind === 'APT' && item.status === 'PENDING' && (
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
                      {/* Recipient view (incoming): after approval allow WhatsApp to requester */}
                      {incoming && item.kind === 'APT' && item.status === 'APPROVED' && (
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
                      {/* Sender view: expose owner's phone and WhatsApp action once approved */}
                      {!incoming && item.kind === 'APT' && item.status === 'APPROVED' && (
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
                        <View style={{ marginTop: 10, alignItems: 'flex-end', gap: 6 as any }}>
                          <Text style={styles.cardMeta}>
                            מספר המשתמש: {otherUser?.phone ? otherUser.phone : 'לא זמין'}
                          </Text>
                          {otherUser?.phone ? (
                            <TouchableOpacity
                              style={[styles.approveBtn]}
                              activeOpacity={0.85}
                              onPress={() =>
                                openWhatsApp(
                                  otherUser.phone as string,
                                  `היי${otherUser?.full_name ? ` ${otherUser.full_name.split(' ')[0]}` : ''}, אישרתי את בקשת ההתאמה ב-Homie. בוא/י נדבר ונראה אם יש התאמה!`
                                )
                              }
                            >
                              <Text style={styles.approveBtnText}>פתיחת שיחה בוואטסאפ</Text>
                            </TouchableOpacity>
                          ) : null}
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
            style={[styles.segmentBtn, kindFilter === 'MATCH' && styles.segmentBtnActive]}
            onPress={() => setKindFilter('MATCH')}
            activeOpacity={0.9}
          >
            <Users size={16} color={kindFilter === 'MATCH' ? '#FFFFFF' : '#C9CDD6'} />
            <Text style={[styles.segmentText, kindFilter === 'MATCH' && styles.segmentTextActive]}>שותפים</Text>
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


