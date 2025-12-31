import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Image,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BarChart2, Users, Home as HomeIcon, CheckCircle2, XCircle, Gauge, Phone, MapPin } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';

type AdminTab = 'overview' | 'users' | 'owners' | 'apartments' | 'matches';

export default function AdminDashboard() {
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const setStoreUser = useAuthStore((s) => s.setUser);
  const [active, setActive] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<any[]>([]);
  const [apartments, setApartments] = useState<any[]>([]);
  const [matchesApproved, setMatchesApproved] = useState<number>(0);
  const [matchesPending, setMatchesPending] = useState<number>(0);
  const [assignedCount, setAssignedCount] = useState<number>(0);
  const [unassignedCount, setUnassignedCount] = useState<number>(0);
  const [userQuery, setUserQuery] = useState<string>('');
  const [matches, setMatches] = useState<any[]>([]);
  const [userMap, setUserMap] = useState<Record<string, any>>({});
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [apartmentPartners, setApartmentPartners] = useState<Record<string, any[]>>({});
  // Apartments filters
  const [aptCityQuery, setAptCityQuery] = useState<string>('');
  const [priceMin, setPriceMin] = useState<string>('');
  const [priceMax, setPriceMax] = useState<string>('');
  const [minBedrooms, setMinBedrooms] = useState<string>('');
  const [minBathrooms, setMinBathrooms] = useState<string>('');
  const [withImages, setWithImages] = useState<boolean>(false);
  const [withPartners, setWithPartners] = useState<boolean>(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState<boolean>(false);

  // Guard: only admins
  useEffect(() => {
    if (!authUser) return;
    if ((authUser as any)?.role !== 'admin') {
      router.replace('/(tabs)/home' as any);
    }
  }, [authUser]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        // Users
        const { data: usersData } = await supabase
          .from('users')
          .select('id, email, full_name, role, city, avatar_url, created_at, gender, age, phone')
          .order('created_at', { ascending: false });
        // Apartments
        const { data: aptsData } = await supabase.from('apartments').select('*').order('created_at', { ascending: false });
        // Matches counts
        const [{ count: apprCount }, { count: pendCount }] = await Promise.all([
          supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'APPROVED'),
          supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
        ]);
        // Full matches list for UI
        const { data: matchesData } = await supabase.from('matches').select('*').order('created_at', { ascending: false });
        const ids = new Set<string>();
        (matchesData || []).forEach((m: any) => {
          if (m.sender_id) ids.add(m.sender_id);
          if (m.receiver_id) ids.add(m.receiver_id);
        });
        let usersForMatches: any[] = [];
        if (ids.size > 0) {
          const { data: umap } = await supabase.from('users').select('id, full_name, avatar_url').in('id', Array.from(ids));
          usersForMatches = umap || [];
        }
        // Assigned vs unassigned (for role 'user')
        const partnerIdSet = new Set<string>();
        (aptsData || []).forEach((apt: any) => {
          const ids: string[] = Array.isArray(apt?.partner_ids) ? apt.partner_ids : [];
          ids.forEach((id) => partnerIdSet.add(id));
        });
        const regularUsers = (usersData || []).filter((u: any) => (u?.role || 'user') === 'user');
        const assigned = regularUsers.filter((u: any) => partnerIdSet.has(u.id)).length;
        const unassigned = Math.max(regularUsers.length - assigned, 0);

        // Fetch partners for all apartments
        const allPartnerIds = new Set<string>();
        (aptsData || []).forEach((apt: any) => {
          const ids: string[] = Array.isArray(apt?.partner_ids) ? apt.partner_ids : [];
          ids.forEach((id) => allPartnerIds.add(id));
        });
        let partnersData: any[] = [];
        if (allPartnerIds.size > 0) {
          const { data: pdata } = await supabase.from('users').select('id, full_name, avatar_url').in('id', Array.from(allPartnerIds));
          partnersData = pdata || [];
        }
        const partnersMap = Object.fromEntries(partnersData.map((p: any) => [p.id, p]));
        const aptPartnersMap: Record<string, any[]> = {};
        (aptsData || []).forEach((apt: any) => {
          const ids: string[] = Array.isArray(apt?.partner_ids) ? apt.partner_ids : [];
          aptPartnersMap[apt.id] = ids.map((id) => partnersMap[id]).filter(Boolean);
        });

        if (!mounted) return;
        setUsers(usersData || []);
        setApartments(aptsData || []);
        setMatchesApproved(apprCount || 0);
        setMatchesPending(pendCount || 0);
        setAssignedCount(assigned);
        setUnassignedCount(unassigned);
        setMatches(matchesData || []);
        setUserMap(Object.fromEntries((usersForMatches || []).map((u: any) => [u.id, u])));
        setApartmentPartners(aptPartnersMap);
      } catch {
        // no-op
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const totalUsers = users.length;
  const totalApartments = apartments.length;

  const maleUsers = users.filter((u: any) => (u?.role || 'user') === 'user' && u?.gender === 'male').length;
  const femaleUsers = users.filter((u: any) => (u?.role || 'user') === 'user' && u?.gender === 'female').length;
  const regularUsersCount = users.filter((u: any) => (u?.role || 'user') === 'user').length;
  const ownersCount = users.filter((u: any) => u?.role === 'owner').length;

  function ageBucket(age?: number | null): string {
    if (!age && age !== 0) return 'לא ידוע';
    if (age < 18) return 'מתחת ל־18';
    if (age <= 24) return '18–24';
    if (age <= 34) return '25–34';
    if (age <= 44) return '35–44';
    if (age <= 54) return '45–54';
    return '55+';
  }
  const ageCounts = users
    .filter((u: any) => (u?.role || 'user') === 'user')
    .reduce<Record<string, number>>((acc, u) => {
      const b = ageBucket(u?.age);
      acc[b] = (acc[b] || 0) + 1;
      return acc;
    }, {});
  const ageStats = Object.entries(ageCounts)
    .sort((a, b) => {
      const order = ['מתחת ל־18', '18–24', '25–34', '35–44', '45–54', '55+', 'לא ידוע'];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    })
    .map(([label, value]) => ({ label, value }));

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users
      .filter((u) => {
        if (genderFilter === 'all') return true;
        return (u?.gender || '').toLowerCase() === genderFilter;
      })
      .filter((u) => (u.full_name || '').toLowerCase().includes(q));
  }, [users, userQuery, genderFilter]);

  const ownerIdToAptCount = useMemo(() => {
    const map: Record<string, number> = {};
    (apartments || []).forEach((apt: any) => {
      const ownerId = apt?.owner_id;
      if (!ownerId) return;
      map[ownerId] = (map[ownerId] || 0) + 1;
    });
    return map;
  }, [apartments]);

  const filteredOwners = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users
      .filter((u) => (u?.role || '') === 'owner')
      .filter((u) => (u.full_name || '').toLowerCase().includes(q));
  }, [users, userQuery]);

  const filteredApartments = useMemo(() => {
    const q = aptCityQuery.trim().toLowerCase();
    const pmin = priceMin.trim() ? parseInt(priceMin.trim(), 10) : undefined;
    const pmax = priceMax.trim() ? parseInt(priceMax.trim(), 10) : undefined;
    const bmin = minBedrooms.trim() ? parseInt(minBedrooms.trim(), 10) : undefined;
    const bathmin = minBathrooms.trim() ? parseInt(minBathrooms.trim(), 10) : undefined;

    return apartments.filter((apt: any) => {
      if (q && !(apt.city || '').toLowerCase().includes(q) && !(apt.neighborhood || '').toLowerCase().includes(q)) {
        return false;
      }
      if (typeof pmin === 'number' && Number(apt.price) < pmin) return false;
      if (typeof pmax === 'number' && Number(apt.price) > pmax) return false;
      if (typeof bmin === 'number' && Number(apt.bedrooms || 0) < bmin) return false;
      if (typeof bathmin === 'number' && Number(apt.bathrooms || 0) < bathmin) return false;
      if (withImages) {
        const imgs = Array.isArray(apt.image_urls) ? apt.image_urls : apt.image_url ? [apt.image_url] : [];
        if (imgs.length === 0) return false;
      }
      if (withPartners) {
        const partners = Array.isArray(apt.partner_ids) ? apt.partner_ids : [];
        if (partners.length === 0) return false;
      }
      return true;
    });
  }, [apartments, aptCityQuery, priceMin, priceMax, minBedrooms, minBathrooms, withImages, withPartners]);

  const statCards = useMemo(
    () => [
      { key: 'users', title: 'משתמשים', value: totalUsers, icon: Users, color: '#4C1D95' },
      { key: 'apartments', title: 'דירות', value: totalApartments, icon: HomeIcon, color: '#00BCD4' },
      { key: 'regularUsers', title: 'משתמשים רגילים', value: regularUsersCount, icon: Users, color: '#60A5FA' },
      { key: 'owners', title: 'בעלי דירות', value: ownersCount, icon: HomeIcon, color: '#34D399' },
      { key: 'approved', title: 'מאץ׳ים מאושרים', value: matchesApproved, icon: CheckCircle2, color: '#22C55E' },
      { key: 'pending', title: 'מאץ׳ים ממתינים', value: matchesPending, icon: XCircle, color: '#F59E0B' },
      { key: 'assigned', title: 'שותפים משויכים', value: assignedCount, icon: Gauge, color: '#38BDF8' },
      { key: 'unassigned', title: 'שותפים לא משויכים', value: unassignedCount, icon: Gauge, color: '#EF4444' },
    ],
    [totalUsers, totalApartments, regularUsersCount, ownersCount, matchesApproved, matchesPending, assignedCount, unassignedCount],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ממשק מנהל</Text>
        <Text style={styles.subtitle}>סקירה וסטטיסטיקות מערכת</Text>
        <TouchableOpacity
          style={styles.logoutBtn}
          activeOpacity={0.9}
          onPress={async () => {
            try {
              await authService.signOut();
              setStoreUser(null);
              router.replace('/auth/login');
            } catch {
              // ignore
            }
          }}>
          <Text style={styles.logoutText}>התנתק</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        <Segment label="סקירה" active={active === 'overview'} onPress={() => setActive('overview')} />
        <Segment label="משתמשים" active={active === 'users'} onPress={() => setActive('users')} />
        <Segment label="בעלי דירות" active={active === 'owners'} onPress={() => setActive('owners')} />
        <Segment label="דירות" active={active === 'apartments'} onPress={() => setActive('apartments')} />
        <Segment label="התאמות" active={active === 'matches'} onPress={() => setActive('matches')} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#5e3f2d" />
        </View>
      ) : active === 'overview' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
            {statCards.map((c) => (
              <StatCard key={c.key} title={c.title} value={c.value} Icon={c.icon} color={c.color} />
            ))}
          </ScrollView>

          <View style={[styles.section, { marginTop: 12 }]}>
            <SectionHeader title="טווחי גילאים (role='user')" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {ageStats.map((a) => (
                <View key={a.label} style={[styles.smallStat, { borderColor: '#2A2A37', width: '48%' }]}>
                  <Text style={styles.smallStatTitle}>{a.label}</Text>
                  <Text style={[styles.smallStatValue, { color: '#FFFFFF' }]}>{a.value}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <SectionHeader title="משתמשים אחרונים" />
            <FlatList
              data={users.slice(0, 8)}
              keyExtractor={(item) => item.id}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => <UserRow user={item} />}
              scrollEnabled={false}
            />
          </View>

          <View style={styles.section}>
            <SectionHeader title="דירות אחרונות" />
            <FlatList
              data={apartments.slice(0, 8)}
              keyExtractor={(item) => item.id}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => <ApartmentRow apt={item} partners={apartmentPartners[item.id]} />}
              scrollEnabled={false}
            />
          </View>
        </ScrollView>
      ) : active === 'users' ? (
        <View style={{ flex: 1 }}>
          <View style={[styles.section, { paddingHorizontal: 16 }]}>
            <SectionHeader title="התפלגות מין" />
            <View style={styles.matchesWrap}>
              <SmallStat
                title="בנים"
                value={maleUsers}
                color="#60A5FA"
                Icon={Users}
                onPress={() => setGenderFilter((p) => (p === 'male' ? 'all' : 'male'))}
                active={genderFilter === 'male'}
              />
              <SmallStat
                title="בנות"
                value={femaleUsers}
                color="#F472B6"
                Icon={Users}
                onPress={() => setGenderFilter((p) => (p === 'female' ? 'all' : 'female'))}
                active={genderFilter === 'female'}
              />
            </View>
          </View>
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.searchInput}
              placeholder="חיפוש לפי שם..."
              placeholderTextColor="#9DA4AE"
              value={userQuery}
              onChangeText={setUserQuery}
              textAlign="right"
            />
          </View>
          <FlatList
            contentContainerStyle={styles.listContent}
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => <UserRow user={item} />}
          />
        </View>
      ) : active === 'owners' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.searchInput}
              placeholder="חיפוש בעל דירה לפי שם..."
              placeholderTextColor="#9DA4AE"
              value={userQuery}
              onChangeText={setUserQuery}
              textAlign="right"
            />
          </View>
          <FlatList
            contentContainerStyle={styles.listContent}
            data={filteredOwners}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => <UserRow user={item} aptCount={ownerIdToAptCount[item.id] || 0} />}
          />
        </View>
      ) : active === 'apartments' ? (
        <View style={{ flex: 1 }}>
          <View style={styles.filtersTopRow}>
            <TouchableOpacity style={styles.filterBtn} activeOpacity={0.9} onPress={() => setIsFiltersOpen(true)}>
              <Text style={styles.filterBtnText}>סינון</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            contentContainerStyle={styles.listContent}
            data={filteredApartments}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => <ApartmentRow apt={item} partners={apartmentPartners[item.id]} />}
          />

          <Modal visible={isFiltersOpen} animationType="fade" transparent onRequestClose={() => setIsFiltersOpen(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>סינון דירות</Text>
                  <TouchableOpacity onPress={() => setIsFiltersOpen(false)}>
                    <Text style={styles.modalClose}>סגור</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.filtersWrap}>
                  <TextInput
                    style={[styles.searchInput, { flex: 1 }]}
                    placeholder="חיפוש לפי עיר/שכונה..."
                    placeholderTextColor="#9DA4AE"
                    value={aptCityQuery}
                    onChangeText={setAptCityQuery}
                    textAlign="right"
                  />
                </View>
                <View style={styles.filtersGrid}>
                  <TextInput
                    style={[styles.smallInput]}
                    placeholder="מינ׳ מחיר"
                    placeholderTextColor="#9DA4AE"
                    keyboardType="number-pad"
                    value={priceMin}
                    onChangeText={setPriceMin}
                    textAlign="right"
                  />
                  <TextInput
                    style={[styles.smallInput]}
                    placeholder="מקס׳ מחיר"
                    placeholderTextColor="#9DA4AE"
                    keyboardType="number-pad"
                    value={priceMax}
                    onChangeText={setPriceMax}
                    textAlign="right"
                  />
                  <TextInput
                    style={[styles.smallInput]}
                    placeholder="מינ׳ חדרי שינה"
                    placeholderTextColor="#9DA4AE"
                    keyboardType="number-pad"
                    value={minBedrooms}
                    onChangeText={setMinBedrooms}
                    textAlign="right"
                  />
                  <TextInput
                    style={[styles.smallInput]}
                    placeholder="מינ׳ מקלחות"
                    placeholderTextColor="#9DA4AE"
                    keyboardType="number-pad"
                    value={minBathrooms}
                    onChangeText={setMinBathrooms}
                    textAlign="right"
                  />
                </View>
                <View style={styles.toggleRow}>
                  <TouchableOpacity
                    onPress={() => setWithImages((v) => !v)}
                    style={[styles.toggleBtn, withImages && styles.toggleBtnActive]}>
                    <Text style={[styles.toggleText, withImages && styles.toggleTextActive]}>עם תמונות</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setWithPartners((v) => !v)}
                    style={[styles.toggleBtn, withPartners && styles.toggleBtnActive]}>
                    <Text style={[styles.toggleText, withPartners && styles.toggleTextActive]}>עם שותפים</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setAptCityQuery('');
                      setPriceMin('');
                      setPriceMax('');
                      setMinBedrooms('');
                      setMinBathrooms('');
                      setWithImages(false);
                      setWithPartners(false);
                    }}
                    style={styles.clearBtn}>
                    <Text style={styles.clearText}>נקה</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsFiltersOpen(false)} style={styles.applyBtn}>
                    <Text style={styles.applyText}>אישור</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={[styles.section, { paddingHorizontal: 16 }]}>
            <View style={styles.matchesWrap}>
              <SmallStat title="מאושרים" value={matchesApproved} color="#22C55E" Icon={CheckCircle2} />
              <SmallStat title="ממתינים" value={matchesPending} color="#F59E0B" Icon={XCircle} />
            </View>
          </View>
          <FlatList
            contentContainerStyle={styles.listContent}
            data={matches}
            keyExtractor={(item) => item.id}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <MatchRow match={item} sender={userMap[item.sender_id]} receiver={userMap[item.receiver_id]} />
            )}
          />
        </View>
      )}
    </View>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.segment, active && styles.segmentActive]}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <BarChart2 size={18} color="#9DA4AE" />
    </View>
  );
}

function StatCard({
  title,
  value,
  Icon,
  color,
}: {
  title: string;
  value: number | string;
  Icon: any;
  color: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: color }]}>
      <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
        <Icon size={20} color={color} />
      </View>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function SmallStat({ title, value, color, Icon, onPress, active }: any) {
  const Comp = onPress ? TouchableOpacity : View;
  return (
    <Comp
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      style={[
        styles.smallStat,
        {
          borderColor: active ? color : '#2A2A37',
          backgroundColor: active ? '#1B1B29' : '#141420',
        },
      ]}>
      <View style={[styles.iconWrap, { backgroundColor: `${color}22` }]}>
        <Icon size={18} color={color} />
      </View>
      <Text style={styles.smallStatTitle}>{title}</Text>
      <Text style={[styles.smallStatValue, { color }]}>{value}</Text>
    </Comp>
  );
}

function UserRow({ user, aptCount }: { user: any; aptCount?: number }) {
  return (
    <View style={styles.rowCard}>
      <View style={styles.rowLeft}>
        {user?.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Users size={16} color="#9DA4AE" />
          </View>
        )}
      </View>
      <View style={styles.rowMiddle}>
        <Text style={styles.rowTitle}>{user.full_name || 'ללא שם'}</Text>
        <View style={styles.chipsRow}>
          <InfoChip label="עיר" value={user?.city || '—'} icon="map" />
          <InfoChip label="מין" value={user?.gender === 'male' ? 'זכר' : user?.gender === 'female' ? 'נקבה' : '—'} />
          <InfoChip label="גיל" value={typeof user?.age === 'number' ? String(user.age) : '—'} />
          <InfoChip label="טלפון" value={user?.phone || '—'} icon="phone" />
          {typeof aptCount === 'number' ? <InfoChip label="דירות" value={String(aptCount)} /> : null}
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowMeta}>{new Date(user.created_at).toLocaleDateString('he-IL')}</Text>
      </View>
    </View>
  );
}

function InfoChip({ label, value, icon }: { label: string; value: string; icon?: 'phone' | 'map' }) {
  return (
    <View style={styles.chip}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon === 'phone' ? <Phone size={14} color="#9DA4AE" /> : null}
        {icon === 'map' ? <MapPin size={14} color="#9DA4AE" /> : null}
        <Text style={styles.chipText}>{value}</Text>
        <Text style={styles.chipLabel}>{label}</Text>
      </View>
    </View>
  );
}

function ApartmentRow({ apt, partners }: { apt: any; partners?: any[] }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const images = apt.image_urls && apt.image_urls.length > 0 ? apt.image_urls : apt.image_url ? [apt.image_url] : [];
  const hasImages = images.length > 0;

  return (
    <View style={styles.aptCard}>
      {hasImages ? (
        <View style={styles.aptImageWrap}>
          <Image source={{ uri: images[currentImageIndex] }} style={styles.aptImage} />
          {images.length > 1 && (
            <View style={styles.imageIndicators}>
              {images.map((_: any, idx: number) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => setCurrentImageIndex(idx)}
                  style={[styles.indicator, currentImageIndex === idx && styles.indicatorActive]}
                />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.aptImageWrap, styles.aptImageFallback]}>
          <HomeIcon size={32} color="#9DA4AE" />
        </View>
      )}
      <View style={styles.aptContent}>
        <Text style={styles.aptTitle}>{apt.title || 'דירה'}</Text>
        <Text style={styles.aptCity}>{apt.city || 'ללא עיר'}</Text>
        <View style={styles.aptPriceRow}>
          <Text style={styles.aptPrice}>₪{apt.price?.toLocaleString() || '—'}</Text>
          <Text style={styles.aptPriceLabel}>לחודש</Text>
        </View>
        {partners && partners.length > 0 && (
          <View style={styles.partnersRow}>
            <Text style={styles.partnersLabel}>שותפים:</Text>
            <View style={styles.partnersAvatars}>
              {partners.map((p: any) =>
                p.avatar_url ? (
                  <Image key={p.id} source={{ uri: p.avatar_url }} style={styles.partnerAvatar} />
                ) : (
                  <View key={p.id} style={[styles.partnerAvatar, styles.partnerAvatarFallback]}>
                    <Users size={12} color="#9DA4AE" />
                  </View>
                )
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function MatchRow({ match, sender, receiver }: { match: any; sender: any; receiver: any }) {
  const status = (match?.status || 'PENDING').trim();
  const badgeConfig: Record<string, { bg: string; color: string; label: string }> = {
    APPROVED: { bg: '#16A34A22', color: '#22C55E', label: 'מאושר' },
    PENDING: { bg: '#F59E0B22', color: '#F59E0B', label: 'ממתין' },
    REJECTED: { bg: '#F8717122', color: '#F87171', label: 'נדחה' },
    NOT_RELEVANT: { bg: '#94A3B822', color: '#94A3B8', label: 'לא רלוונטי' },
    CANCELLED: { bg: '#94A3B822', color: '#94A3B8', label: 'בוטל' },
  };
  const { bg, color, label } = badgeConfig[status] || badgeConfig.PENDING;
  return (
    <View style={[styles.rowCard, { alignItems: 'center' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, justifyContent: 'flex-end' }}>
        <ProfilePreview user={receiver} align="right" />
        <Text style={{ color: '#9DA4AE' }}>↔</Text>
        <ProfilePreview user={sender} align="right" />
      </View>
      <View style={{ alignItems: 'flex-start', marginLeft: 8 }}>
        <View style={[styles.badge, { backgroundColor: bg }]}>
          <Text style={{ color, fontWeight: '700', fontSize: 12 }}>
            {label}
          </Text>
        </View>
        <Text style={styles.rowMeta}>{new Date(match.created_at).toLocaleDateString('he-IL')}</Text>
      </View>
    </View>
  );
}

function ProfilePreview({ user, align }: { user: any; align?: 'left' | 'right' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {user?.avatar_url ? (
        <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Users size={16} color="#9DA4AE" />
        </View>
      )}
      <View>
        <Text style={[styles.rowTitle, { textAlign: align === 'right' ? 'right' : 'left' }]}>
          {user?.full_name || 'ללא שם'}
        </Text>
        <Text style={[styles.rowSubtitle, { textAlign: align === 'right' ? 'right' : 'left' }]}>
          {user?.city || 'ללא עיר'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
    paddingTop: 54,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    color: '#9DA4AE',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  logoutBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    backgroundColor: '#1B1B29',
    borderWidth: 1,
    borderColor: '#2A2A37',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '800',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A37',
    alignItems: 'center',
    backgroundColor: '#141420',
  },
  segmentActive: {
    backgroundColor: '#1B1B29',
    borderColor: '#4C1D95',
  },
  segmentText: {
    color: '#9DA4AE',
    fontSize: 13,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 40,
  },
  statsRow: {
    gap: 12,
    paddingRight: 4,
  },
  statCard: {
    width: 180,
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#141420',
    borderWidth: 1,
    marginBottom: 16,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statTitle: {
    color: '#9DA4AE',
    fontSize: 12,
    marginBottom: 6,
    textAlign: 'right',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'right',
  },
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 40,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141420',
    borderWidth: 1,
    borderColor: '#2A2A37',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  rowLeft: {
    marginRight: 12,
  },
  rowMiddle: {
    flex: 1,
  },
  rowRight: {
    marginLeft: 12,
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  rowSubtitle: {
    color: '#9DA4AE',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
  },
  rowMeta: {
    color: '#9DA4AE',
    fontSize: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    justifyContent: 'flex-end',
  },
  chip: {
    backgroundColor: '#1B1B29',
    borderWidth: 1,
    borderColor: '#2A2A37',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  chipLabel: {
    color: '#9DA4AE',
    fontSize: 11,
    textAlign: 'right',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2A2A37',
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1B1B29',
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchesWrap: {
    flexDirection: 'row',
    gap: 10,
  },
  smallStat: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: '#141420',
    padding: 14,
  },
  smallStatTitle: {
    color: '#9DA4AE',
    fontSize: 12,
    marginBottom: 6,
    textAlign: 'right',
  },
  smallStatValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'right',
  },
  sectionHint: {
    color: '#9DA4AE',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'right',
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  subTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 6,
  },
  subTabBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2A2A37',
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: '#141420',
    alignItems: 'center',
  },
  subTabBtnActive: {
    borderColor: '#4C1D95',
    backgroundColor: '#1B1B29',
  },
  subTabText: {
    color: '#9DA4AE',
    fontSize: 13,
    fontWeight: '700',
  },
  subTabTextActive: {
    color: '#FFFFFF',
  },
  searchInput: {
    backgroundColor: '#141420',
    borderWidth: 1,
    borderColor: '#2A2A37',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: '#FFFFFF',
  },
  aptCard: {
    backgroundColor: '#141420',
    borderWidth: 1,
    borderColor: '#2A2A37',
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  aptImageWrap: {
    width: 140,
    height: 140,
    position: 'relative',
  },
  aptImage: {
    width: '100%',
    height: '100%',
  },
  aptImageFallback: {
    backgroundColor: '#1B1B29',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageIndicators: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  indicatorActive: {
    backgroundColor: '#FFFFFF',
  },
  aptContent: {
    flex: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  aptTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    marginBottom: 4,
  },
  aptCity: {
    color: '#9DA4AE',
    fontSize: 13,
    textAlign: 'right',
    marginBottom: 8,
  },
  aptPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  aptPrice: {
    color: '#22C55E',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'right',
  },
  aptPriceLabel: {
    color: '#9DA4AE',
    fontSize: 12,
    marginLeft: 6,
    textAlign: 'right',
  },
  partnersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  partnersLabel: {
    color: '#9DA4AE',
    fontSize: 12,
    textAlign: 'right',
  },
  partnersAvatars: {
    flexDirection: 'row',
    gap: 6,
  },
  partnerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#141420',
  },
  partnerAvatarFallback: {
    backgroundColor: '#1B1B29',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  filtersGrid: {
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  smallInput: {
    flexGrow: 1,
    minWidth: 120,
    backgroundColor: '#141420',
    borderWidth: 1,
    borderColor: '#2A2A37',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: '#FFFFFF',
  },
  toggleRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2A2A37',
    backgroundColor: '#141420',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  toggleBtnActive: {
    borderColor: '#4C1D95',
    backgroundColor: '#1B1B29',
  },
  toggleText: {
    color: '#9DA4AE',
    fontSize: 13,
    fontWeight: '700',
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  clearBtn: {
    borderWidth: 1,
    borderColor: '#2A2A37',
    backgroundColor: '#141420',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  clearText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '800',
  },
  filtersTopRow: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  filterBtn: {
    backgroundColor: '#4C1D95',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  filterBtnText: {
    color: '#0F0F14',
    fontSize: 14,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#0F0F14',
    borderWidth: 1,
    borderColor: '#2A2A37',
    borderRadius: 16,
    paddingVertical: 14,
  },
  modalHeader: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  modalClose: {
    color: '#9DA4AE',
    fontSize: 14,
    fontWeight: '700',
  },
  modalActions: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  applyBtn: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  applyText: {
    color: '#0F0F14',
    fontSize: 14,
    fontWeight: '800',
  },
});


