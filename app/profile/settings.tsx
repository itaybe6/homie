import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Edit, FileText, LogOut, Trash2, ChevronLeft, Pencil, Inbox, MapPin, UserPlus2, X, Home } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Apartment, User } from '@/types/database';
import { fetchUserSurvey } from '@/lib/survey';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [profile, setProfile] = useState<User | null>(null);
  const [surveyCompleted, setSurveyCompleted] = useState<boolean>(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [hasSharedProfiles, setHasSharedProfiles] = useState(false);
  const [showSharedModal, setShowSharedModal] = useState(false);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [leavingGroupId, setLeavingGroupId] = useState<string | null>(null);
  const [sharedGroups, setSharedGroups] = useState<
    { id: string; name?: string | null; members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }[]
  >([]);
  // My apartment modal state
  const [showAptModal, setShowAptModal] = useState(false);
  const [aptLoading, setAptLoading] = useState(false);
  const [myApartment, setMyApartment] = useState<Apartment | null>(null);
  const [aptOwner, setAptOwner] = useState<User | null>(null);
  const [aptMembers, setAptMembers] = useState<User[]>([]);
  const [isLeavingApartment, setIsLeavingApartment] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!user?.id) return;
        const { data } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
        setProfile((data as any) || null);
      } catch {
        // ignore
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      try {
        if (!user?.id) return;
        const survey = await fetchUserSurvey(user.id);
        const completed = !!(survey as any)?.is_completed || !!survey;
        setSurveyCompleted(completed);
      } catch {
        setSurveyCompleted(false);
      }
    })();
  }, [user?.id]);

  // Load user's apartment when opening the modal
  useEffect(() => {
    (async () => {
      try {
        if (!showAptModal || !user?.id) return;
        console.log('[MyApartment] Opening modal for user:', user.id);
        setAptLoading(true);
        // Try to find an apartment the user is a partner of, otherwise one they own
        const [{ data: partnerRows }, { data: ownerRows }] = await Promise.all([
          supabase.from('apartments').select('*').contains('partner_ids', [user.id]).limit(1),
          supabase.from('apartments').select('*').eq('owner_id', user.id).limit(1),
        ]);
        console.log('[MyApartment] Query results:', { partnerRows, ownerRows });
        const apt = (partnerRows && partnerRows[0]) || (ownerRows && ownerRows[0]) || null;
        setMyApartment((apt as any) || null);
        if (!apt) {
          console.log('[MyApartment] No apartment found for user:', user.id);
          setAptOwner(null);
          setAptMembers([]);
          return;
        }
        console.log('[MyApartment] Found apartment:', (apt as any)?.id);
        // Load owner
        const [{ data: ownerRow }, partnersResp] = await Promise.all([
          supabase.from('users').select('id, full_name, avatar_url').eq('id', (apt as any).owner_id).maybeSingle(),
          (Array.isArray((apt as any).partner_ids) && (apt as any).partner_ids.length > 0)
            ? supabase
                .from('users')
                .select('id, full_name, avatar_url')
                .in('id', (apt as any).partner_ids as string[])
            : Promise.resolve({ data: [] as any[] } as any),
        ]);
        console.log('[MyApartment] Loaded owner and partners:', {
          ownerRow,
          partnersCount: (partnersResp as any)?.data?.length || 0,
        });
        setAptOwner((ownerRow as any) || null);
        const ownerId = (apt as any).owner_id as string;
        const partnersRaw: any[] = ((partnersResp as any)?.data || []) as any[];
        // de-duplicate by id and exclude the owner if mistakenly included
        const seen = new Set<string>();
        const partnersUnique = partnersRaw.filter((u: any) => {
          const uid = u?.id;
          if (!uid || uid === ownerId) return false;
          if (seen.has(uid)) return false;
          seen.add(uid);
          return true;
        });
        console.log('[MyApartment] Partners after dedupe:', partnersUnique.map((p: any) => p.id));
        setAptMembers(partnersUnique as any);
      } catch (e: any) {
        console.error('[MyApartment] Failed loading apartment modal:', e);
        Alert.alert('שגיאה', e?.message || 'לא ניתן לטעון את הדירה שלך');
      } finally {
        setAptLoading(false);
      }
    })();
  }, [showAptModal, user?.id]);

  const leaveApartment = async () => {
    if (!user?.id || !myApartment) return;
    console.log('[LeaveApartment] Clicked. Apartment:', (myApartment as any)?.id, 'User:', user.id);
    // Only partners (not owner) can leave
    const currentPartners: string[] = Array.isArray((myApartment as any).partner_ids)
      ? ((myApartment as any).partner_ids as string[])
      : [];
    const isOwner = user.id === (myApartment as any).owner_id;
    const isPartner = currentPartners.includes(user.id);
    console.log('[LeaveApartment] State:', { isOwner, isPartner, currentPartners });
    if (!isPartner || isOwner) {
      Alert.alert('שגיאה', isOwner ? 'בעל/ת הדירה לא יכול/ה לצאת מהדירה' : 'אינך משויך/ה כדייר/ת בדירה זו');
      return;
    }
    try {
      const shouldProceed =
        Platform.OS === 'web'
          ? (typeof confirm === 'function'
              ? confirm('האם לצאת מהדירה? ניתן להצטרף שוב בהזמנה.')
              : true)
          : await new Promise<boolean>((resolve) => {
              Alert.alert('יציאה מהדירה', 'האם לצאת מהדירה? ניתן להצטרף שוב בהזמנה.', [
                { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
                { text: 'צא/י מהדירה', style: 'destructive', onPress: () => resolve(true) },
              ]);
            });
      if (!shouldProceed) return;
      setIsLeavingApartment(true);
      const newPartnerIds = currentPartners.filter((pid) => pid !== user.id);
      console.log('[LeaveApartment] Updating apartments.partner_ids ->', newPartnerIds);
      const { error: updErr } = await supabase
        .from('apartments')
        .update({ partner_ids: newPartnerIds })
        .eq('id', (myApartment as any).id);
      if (updErr) {
        console.error('[LeaveApartment] Supabase update error (apartments):', updErr);
        throw updErr;
      }
      // Mark any active group memberships as LEFT
      const { error: grpErr } = await supabase
        .from('profile_group_members')
        .update({ status: 'LEFT' })
        .eq('user_id', user.id)
        .eq('status', 'ACTIVE');
      if (grpErr) {
        console.error('[LeaveApartment] Supabase update error (profile_group_members):', grpErr);
        // not throwing intentionally, leaving apt should succeed even if group update failed
      }
      // Update local state
      setMyApartment((prev) => (prev ? ({ ...(prev as any), partner_ids: newPartnerIds } as Apartment) : prev));
      setAptMembers((prev) => prev.filter((m) => m.id !== user.id));
      Alert.alert('הצלחה', 'יצאת מהדירה בהצלחה');
      setShowAptModal(false);
    } catch (e: any) {
      console.error('[LeaveApartment] Failed:', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לצאת מהדירה כעת');
    } finally {
      setIsLeavingApartment(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (!showSharedModal || !user?.id) return;
        setSharedLoading(true);
        const { data: membershipRows, error: membershipError } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE');
        if (membershipError) throw membershipError;
        const groupIds = (membershipRows || []).map((r: any) => r.group_id).filter(Boolean);
        if (!groupIds.length) {
          setSharedGroups([]);
          return;
        }

        const results: { id: string; name?: string | null; members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }[] = [];
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
        setSharedGroups(results);
      } catch (e: any) {
        Alert.alert('שגיאה', e?.message || 'לא ניתן לטעון פרופילים משותפים');
      } finally {
        setSharedLoading(false);
      }
    })();
  }, [showSharedModal, user?.id]);

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
      // refresh modal data
      setShowSharedModal(true);
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לעזוב את הקבוצה כעת');
    } finally {
      setLeavingGroupId(null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (!user?.id) return;
        const { data, error } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE');
        if (error) throw error;
        setHasSharedProfiles(!!data && (data as any[]).length > 0);
      } catch {
        setHasSharedProfiles(false);
      }
    })();
  }, [user?.id]);

  const pickAndUploadAvatar = async () => {
    try {
      const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perms.granted) {
        Alert.alert('הרשאה נדרשת', 'יש לאפשר גישה לגלריה כדי להעלות תמונה');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length || !user) return;

      setIsUploadingAvatar(true);
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileExt = (asset.fileName || 'avatar.jpg').split('.').pop() || 'jpg';
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `users/${user.id}/${fileName}`;
      const filePayload: any = arrayBuffer as any;

      const { error: uploadError } = await supabase.storage
        .from('user-images')
        .upload(filePath, filePayload, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('user-images').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;

      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      Alert.alert('הצלחה', 'תמונת הפרופיל עודכנה');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לעדכן את תמונת הפרופיל');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (Platform.OS === 'web') {
        const confirmed = typeof confirm === 'function' ? confirm('האם אתה בטוח שברצונך להתנתק?') : true;
        if (!confirmed) return;
        setIsSigningOut(true);
        await authService.signOut();
        setUser(null);
        router.replace('/auth/login');
        return;
      }

      Alert.alert('התנתקות', 'האם אתה בטוח שברצונך להתנתק?', [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'התנתק',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSigningOut(true);
              await authService.signOut();
              setUser(null);
              router.replace('/auth/login');
            } catch {
              Alert.alert('שגיאה', 'לא ניתן להתנתק');
            } finally {
              setIsSigningOut(false);
            }
          },
        },
      ]);
    } catch {
      setIsSigningOut(false);
      Alert.alert('שגיאה', 'לא ניתן להתנתק');
    }
  };

  const handleDeleteProfile = async () => {
    if (!user) return;
    try {
      if (Platform.OS === 'web') {
        const confirmed = typeof confirm === 'function'
          ? confirm('האם אתה בטוח/ה שברצונך למחוק את הפרופיל? פעולה זו אינה ניתנת לשחזור.')
          : true;
        if (!confirmed) return;
      } else {
        const shouldProceed = await new Promise<boolean>((resolve) => {
          Alert.alert('מחיקת פרופיל', 'האם אתה בטוח/ה שברצונך למחוק את הפרופיל? פעולה זו אינה ניתנת לשחזור.', [
            { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
            { text: 'מחק', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
        if (!shouldProceed) return;
      }

      setIsDeleting(true);
      const { error: deleteError } = await supabase.from('users').delete().eq('id', user.id);
      if (deleteError) throw deleteError;

      try {
        await authService.signOut();
      } catch {}
      setUser(null);
      router.replace('/auth/login');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן למחוק את הפרופיל כעת');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topSpacer} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Image
              source={{
                uri:
                  profile?.avatar_url ||
                  'https://cdn-icons-png.flaticon.com/512/847/847969.png',
              }}
              style={styles.avatar}
            />
            <TouchableOpacity
              onPress={isUploadingAvatar ? undefined : pickAndUploadAvatar}
              style={styles.avatarEditBtn}
              activeOpacity={0.9}
            >
              {isUploadingAvatar ? (
                <ActivityIndicator size="small" color="#0F0F14" />
              ) : (
                <Pencil size={14} color="#0F0F14" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.profileName} numberOfLines={1}>
            {profile?.full_name || 'משתמש/ת'}
          </Text>
          {!!profile?.phone && (
            <Text style={styles.profileSub} numberOfLines={1}>
              {profile.phone}
            </Text>
          )}
          {!!profile?.email && (
            <Text style={styles.profileSub} numberOfLines={1}>
              {profile.email}
            </Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>הגדרות חשבון</Text>
        <View style={styles.groupCard}>
          <TouchableOpacity
            style={styles.groupItem}
            onPress={() => router.push('/profile/edit')}
            activeOpacity={0.9}
          >
            <View style={styles.itemIcon}>
              <Edit size={18} color="#E5E7EB" />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={styles.groupItemTitle}>עריכת פרופיל</Text>
              <Text style={styles.groupItemSub}>עדכון פרטים ותמונות</Text>
            </View>
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.groupItem}
            onPress={() => setShowAptModal(true)}
            activeOpacity={0.9}
          >
            <View style={styles.itemIcon}>
              <Home size={18} color="#E5E7EB" />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={styles.groupItemTitle}>הדירה שלי</Text>
              <Text style={styles.groupItemSub}>צפייה ויציאה מהדירה</Text>
            </View>
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {hasSharedProfiles ? (
            <>
              <TouchableOpacity
                style={styles.groupItem}
                onPress={() => setShowSharedModal(true)}
                activeOpacity={0.9}
              >
                <View style={styles.itemIcon}>
                  <UserPlus2 size={18} color="#E5E7EB" />
                </View>
                <View style={styles.itemTextWrap}>
                  <Text style={styles.groupItemTitle}>פרופילים משותפים</Text>
                  <Text style={styles.groupItemSub}>צפייה בפרופילים המשותפים שלך</Text>
                </View>
                <ChevronLeft size={18} color="#9DA4AE" />
              </TouchableOpacity>

              <View style={styles.divider} />
            </>
          ) : null}

          <TouchableOpacity
            style={styles.groupItem}
            onPress={() => router.push('/terms')}
            activeOpacity={0.9}
          >
            <View style={styles.itemIcon}>
              <FileText size={18} color="#E5E7EB" />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={styles.groupItemTitle}>תנאי שימוש</Text>
              <Text style={styles.groupItemSub}>קריאת התקנון והמדיניות</Text>
            </View>
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.groupItem}
            onPress={() => router.push('/(tabs)/onboarding/survey')}
            activeOpacity={0.9}
          >
            <View style={styles.itemIcon}>
              <MapPin size={18} color="#E5E7EB" />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={styles.groupItemTitle}>
                {surveyCompleted ? 'עריכת שאלון העדפות' : 'מילוי שאלון העדפות'}
              </Text>
              <Text style={styles.groupItemSub}>
                {surveyCompleted ? 'עדכון העדפות התאמה' : 'כמה שאלות קצרות להיכרות'}
              </Text>
            </View>
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.groupItem}
            onPress={() => router.push('/(tabs)/requests')}
            activeOpacity={0.9}
          >
            <View style={styles.itemIcon}>
              <Inbox size={18} color="#E5E7EB" />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={styles.groupItemTitle}>בקשות</Text>
              <Text style={styles.groupItemSub}>צפייה וניהול בקשות</Text>
            </View>
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>אבטחה וחשבון</Text>
        <View style={styles.groupCard}>
          <TouchableOpacity
            style={styles.groupItem}
            onPress={isSigningOut ? undefined : handleSignOut}
            activeOpacity={0.9}
          >
            <View style={[styles.itemIcon, styles.dangerIcon]}>
              {isSigningOut ? (
                <ActivityIndicator size="small" color="#FCA5A5" />
              ) : (
                <LogOut size={18} color="#FCA5A5" />
              )}
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={[styles.groupItemTitle, styles.dangerText]}>
                {isSigningOut ? 'מתנתק...' : 'התנתק'}
              </Text>
              <Text style={styles.groupItemSub}>יציאה מהחשבון</Text>
            </View>
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.groupItem}
            onPress={isDeleting ? undefined : handleDeleteProfile}
            activeOpacity={0.9}
          >
            <View style={[styles.itemIcon, styles.dangerIcon]}>
              {isDeleting ? (
                <ActivityIndicator size="small" color="#F87171" />
              ) : (
                <Trash2 size={18} color="#F87171" />
              )}
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={[styles.groupItemTitle, styles.dangerText]}>
                {isDeleting ? 'מוחק...' : 'מחיקת חשבון'}
              </Text>
              <Text style={styles.groupItemSub}>פעולה בלתי ניתנת לשחזור</Text>
            </View>
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>
        </View>
      </View>
      {/* My apartment modal */}
      {showAptModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowAptModal(false)}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>הדירה שלי</Text>
                <TouchableOpacity style={styles.sheetClose} onPress={() => setShowAptModal(false)}>
                  <X size={18} color="#E5E7EB" />
                </TouchableOpacity>
              </View>
              {aptLoading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#7C5CFF" />
                </View>
              ) : !myApartment ? (
                <Text style={styles.sharedEmptyText}>לא נמצאה דירה משויכת.</Text>
              ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                  <View style={styles.aptCard}>
                    {!!(myApartment as any).image_url && (
                      <Image source={{ uri: (myApartment as any).image_url as any }} style={styles.aptCover} />
                    )}
                    <Text style={styles.aptTitle} numberOfLines={1}>
                      {(myApartment as any).title}
                    </Text>
                    <Text style={styles.aptSub} numberOfLines={1}>
                      {(myApartment as any).city} • {(myApartment as any).price?.toLocaleString?.() || (myApartment as any).price}₪
                    </Text>
                    <View style={styles.sharedAvatarsRow}>
                      {aptOwner ? (
                        <View style={styles.sharedAvatarWrap}>
                          <Image
                            source={{ uri: aptOwner.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                            style={styles.sharedAvatar}
                          />
                        </View>
                      ) : null}
                      {aptMembers.map((m) => (
                        <View key={m.id} style={styles.sharedAvatarWrap}>
                          <Image
                            source={{ uri: m.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                            style={styles.sharedAvatar}
                          />
                        </View>
                      ))}
                    </View>
                    {user?.id &&
                    Array.isArray((myApartment as any).partner_ids) &&
                    (myApartment as any).partner_ids.includes(user.id) &&
                    user.id !== (myApartment as any).owner_id ? (
                      <TouchableOpacity
                        style={[styles.sharedLeaveBtn, { alignSelf: 'center', marginTop: 6 }]}
                        onPress={isLeavingApartment ? undefined : leaveApartment}
                        activeOpacity={0.9}
                      >
                        {isLeavingApartment ? (
                          <ActivityIndicator size="small" color="#F87171" />
                        ) : (
                          <>
                            <LogOut size={16} color="#F87171" />
                            <Text style={styles.sharedLeaveBtnText}>צא/י מהדירה</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      )}
      {/* Shared profiles modal */}
      {showSharedModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowSharedModal(false)}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>פרופילים משותפים</Text>
                <TouchableOpacity style={styles.sheetClose} onPress={() => setShowSharedModal(false)}>
                  <X size={18} color="#E5E7EB" />
                </TouchableOpacity>
              </View>

              {sharedLoading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#7C5CFF" />
                </View>
              ) : sharedGroups.length === 0 ? (
                <Text style={styles.sharedEmptyText}>אין לך פרופילים משותפים פעילים.</Text>
              ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                  {sharedGroups.map((g) => (
                    <View key={g.id} style={styles.sharedGroupCard}>
                      <View style={styles.sharedCardTopRow}>
                        <Text style={styles.sharedGroupTitle} numberOfLines={1}>
                          {(g.name || 'שותפים').toString()}
                        </Text>
                        <TouchableOpacity
                          style={[styles.sharedLeaveBtn, leavingGroupId === g.id ? { opacity: 0.7 } : null]}
                          onPress={leavingGroupId ? undefined : () => leaveGroup(g.id)}
                          activeOpacity={0.9}
                        >
                          {leavingGroupId === g.id ? (
                            <ActivityIndicator size="small" color="#F87171" />
                          ) : (
                            <>
                              <LogOut size={16} color="#F87171" />
                              <Text style={styles.sharedLeaveBtnText}>עזוב/י קבוצה</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                      <View style={styles.sharedAvatarsRow}>
                        {g.members.map((m) => (
                          <View key={m.id} style={styles.sharedAvatarWrap}>
                            <Image
                              source={{ uri: m.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                              style={styles.sharedAvatar}
                            />
                          </View>
                        ))}
                      </View>
                      <Text style={styles.sharedMembersLine} numberOfLines={2}>
                        {g.members.map((m) => m.full_name || 'חבר').join(' • ')}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
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
  topSpacer: {
    height: 48,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  profileCard: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#1F1F29',
  },
  avatarEditBtn: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#A78BFA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0F0F14',
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 2,
  },
  profileSub: {
    color: '#9DA4AE',
    fontSize: 13,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 8,
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    padding: 12,
  },
  sheetHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  sheetClose: {
    position: 'absolute',
    left: 6,
    top: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  sharedGroupCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#17171F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  sharedCardTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  sharedGroupTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  sharedAvatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sharedAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#0F0F14',
    overflow: 'hidden',
    backgroundColor: '#1F1F29',
  },
  sharedAvatar: {
    width: '100%',
    height: '100%',
  },
  sharedMembersLine: {
    color: '#C7CBD1',
    fontSize: 13,
    textAlign: 'center',
  },
  sharedEmptyText: {
    color: '#9DA4AE',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  sharedLeaveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  sharedLeaveBtnText: {
    color: '#F87171',
    fontWeight: '800',
    fontSize: 12,
  },
  aptCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#17171F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  aptCover: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    backgroundColor: '#1F1F29',
    marginBottom: 10,
  },
  aptTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  aptSub: {
    color: '#C7CBD1',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  groupCard: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
  },
  groupItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerIcon: {
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  itemTextWrap: {
    flex: 1,
    gap: 2,
  },
  groupItemTitle: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  groupItemSub: {
    color: '#9DA4AE',
    fontSize: 12,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 14,
  },
  dangerText: {
    color: '#F87171',
  },
});


