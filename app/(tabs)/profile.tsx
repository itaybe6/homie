import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  Platform,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut, Edit, Save, X, Plus, MapPin, Inbox, Trash2, Settings } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import { User, Apartment } from '@/types/database';


export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const apartments = useApartmentStore((state) => state.apartments);
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<User | null>(null);
  const [userApartments, setUserApartments] = useState<Apartment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [aptMembers, setAptMembers] = useState<Record<string, User[]>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const [isAddingImage, setIsAddingImage] = useState(false);
  const [sharedGroups, setSharedGroups] = useState<
    { id: string; name?: string | null; members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }[]
  >([]);

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  // Removed deprecated interests field

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const getApartmentPrimaryImage = (apartment: Apartment): string => {
    const PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';
    const anyValue: any = (apartment as any).image_urls;
    if (Array.isArray(anyValue) && anyValue[0]) return anyValue[0] as string;
    if (typeof anyValue === 'string') {
      try {
        const parsed = JSON.parse(anyValue);
        if (Array.isArray(parsed) && parsed[0]) return parsed[0] as string;
      } catch {
        try {
          const asArray = anyValue
            .replace(/^{|}$/g, '')
            .split(',')
            .map((s: string) => s.replace(/^"+|"+$/g, '').trim())
            .filter(Boolean);
          if (asArray[0]) return asArray[0] as string;
        } catch {}
      }
    }
    if (apartment.image_url) return apartment.image_url;
    return PLACEHOLDER;
  };

  const getObjectPathFromPublicUrl = (publicUrl: string): string | null => {
    if (!publicUrl) return null;
    const marker = '/object/public/user-images/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return publicUrl.substring(idx + marker.length);
  };

  const removeImageAt = async (idx: number) => {
    try {
      if (!user?.id || !profile?.image_urls) return;
      const url = profile.image_urls[idx];
      if (!url) return;

      const shouldProceed = await new Promise<boolean>((resolve) => {
        Alert.alert('מחיקת תמונה', 'למחוק את התמונה הזו?', [
          { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
          { text: 'מחק', style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
      if (!shouldProceed) return;

      setIsDeletingImage(true);
      const next = profile.image_urls.filter((_, i) => i !== idx);
      const { error: updateErr } = await supabase
        .from('users')
        .update({ image_urls: next, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateErr) throw updateErr;

      setProfile((prev) => (prev ? { ...prev, image_urls: next } as any : prev));
      setViewerIndex(null);

      try {
        const objectPath = getObjectPathFromPublicUrl(url);
        if (objectPath) {
          await supabase.storage.from('user-images').remove([objectPath]);
        }
      } catch {}
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן למחוק את התמונה');
    } finally {
      setIsDeletingImage(false);
    }
  };

  const fetchProfile = async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (profileData) {
        setProfile(profileData);
        setFullName(profileData.full_name);
        setAge(profileData.age?.toString() || '');
        setBio(profileData.bio || '');
      }

      const [{ data: ownedApts, error: ownedError }, { data: partnerApts, error: partnerError }] =
        await Promise.all([
          supabase.from('apartments').select('*').eq('owner_id', user.id),
          supabase.from('apartments').select('*').contains('partner_ids', [user.id]),
        ]);

      if (ownedError) throw ownedError;
      if (partnerError) throw partnerError;

      const mergedById: Record<string, Apartment> = {};
      (ownedApts || []).forEach((apt: any) => {
        mergedById[apt.id] = apt;
      });
      (partnerApts || []).forEach((apt: any) => {
        mergedById[apt.id] = apt;
      });

      const mergedApts = Object.values(mergedById) as Apartment[];
      setUserApartments(mergedApts);

      // Load roommates (partners) avatars per apartment
      const membersMap: Record<string, User[]> = {};
      await Promise.all(
        mergedApts.map(async (apt: any) => {
          const ids = apt.partner_ids as string[] | undefined;
          if (ids && ids.length > 0) {
            const { data: usersData, error: usersError } = await supabase
              .from('users')
              .select('id, full_name, avatar_url')
              .in('id', ids);
            if (!usersError && usersData) {
              membersMap[apt.id] = usersData as any;
            }
          }
        })
      );
      setAptMembers(membersMap);

      // Load shared profile groups (compact view)
      try {
        const { data: membershipRows, error: membershipError } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE');
        if (membershipError) throw membershipError;
        const groupIds = (membershipRows || []).map((r: any) => r.group_id).filter(Boolean);
        if (!groupIds.length) {
          setSharedGroups([]);
        } else {
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
            const { data: usersRows } = await supabase
              .from('users')
              .select('id, full_name, avatar_url')
              .in('id', memberIds);
            results.push({
              id: gid,
              name: (groupRow as any)?.name,
              members: ((usersRows || []) as any[]).filter(Boolean) as any,
            });
          }
          setSharedGroups(results);
        }
      } catch {
        setSharedGroups([]);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      Alert.alert('שגיאה', 'שם מלא הוא שדה חובה');
      return;
    }

    setIsSaving(true);

    try {
      const ageNum = age ? parseInt(age) : null;

      if (age && (isNaN(ageNum!) || ageNum! <= 0)) {
        Alert.alert('שגיאה', 'גיל לא תקין');
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from('users')
        .update({
          full_name: fullName,
          age: ageNum,
          bio: bio || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user!.id);

      if (error) throw error;

      Alert.alert('הצלחה', 'הפרופיל עודכן בהצלחה');
      setIsEditing(false);
      fetchProfile();
    } catch (error: any) {
      Alert.alert('שגיאה', error.message || 'לא ניתן לעדכן את הפרופיל');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      setFullName(profile.full_name);
      setAge(profile.age?.toString() || '');
      setBio(profile.bio || '');
    }
    setIsEditing(false);
  };

  const handleSignOut = async () => {
    try {
      if (Platform.OS === 'web') {
        const confirmed = typeof confirm === 'function' ? confirm('האם אתה בטוח שברצונך להתנתק?') : true;
        if (!confirmed) return;
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
              await authService.signOut();
              setUser(null);
              router.replace('/auth/login');
            } catch (error) {
              Alert.alert('שגיאה', 'לא ניתן להתנתק');
            }
          },
        },
      ]);
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן להתנתק');
    }
  };

  const handleDeleteProfile = async () => {
    if (!user) return;
    try {
      if (Platform.OS === 'web') {
        const confirmed = typeof confirm === 'function' ? confirm('האם אתה בטוח/ה שברצונך למחוק את הפרופיל? פעולה זו אינה ניתנת לשחזור.') : true;
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
      } catch {
        // ignore sign out failure after deletion; we'll still clear local state
      }
      setUser(null);
      router.replace('/auth/login');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן למחוק את הפרופיל כעת');
    } finally {
      setIsDeleting(false);
    }
  };

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

      setIsSaving(true);
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileExt = (asset.fileName || 'avatar.jpg').split('.').pop() || 'jpg';
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `users/${user.id}/${fileName}`;
      // Use arrayBuffer on native (Blob/File may not exist)
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
      Alert.alert('הצלחה', 'התמונה עודכנה');
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'לא ניתן להעלות תמונה');
    } finally {
      setIsSaving(false);
    }
  };

  // moved extra-photos upload to edit profile screen
  const addGalleryImage = async () => {
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

      if (result.canceled || !result.assets?.length || !user || !profile) return;

      setIsAddingImage(true);
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileExt = (asset.fileName || 'photo.jpg').split('.').pop() || 'jpg';
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `users/${user.id}/gallery/${fileName}`;
      const filePayload: any = arrayBuffer as any;

      const { error: uploadError } = await supabase.storage
        .from('user-images')
        .upload(filePath, filePayload, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('user-images').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      const next = [...(profile.image_urls || []), publicUrl];
      const { error: updateError } = await supabase
        .from('users')
        .update({ image_urls: next, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;

      setProfile((prev) => (prev ? { ...prev, image_urls: next } as any : prev));
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן להוסיף תמונה');
    } finally {
      setIsAddingImage(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#7C5CFF" />
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ padding: 16, alignItems: 'center', gap: 12 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>לא מחובר/ת</Text>
          <Text style={{ color: '#9DA4AE', textAlign: 'center' }}>
            כדי לראות את הפרופיל שלך, יש להתחבר או להירשם.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/auth/login')}
            style={{ backgroundColor: '#7C5CFF', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 }}>
            <Text style={{ color: '#0F0F14', fontWeight: '800' }}>כניסה / הרשמה</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={[
          styles.scrollContent,
          {
            // add top spacer so the global top bar won't overlap the photo
            paddingTop: 60,
            paddingBottom: Math.max(220, 120 + insets.bottom),
          },
        ]}>

        {!isEditing ? (
          <View style={styles.profileCard}>
            <View style={styles.photoWrap}>
              <Image
                source={{
                  uri:
                    profile?.avatar_url ||
                    'https://cdn-icons-png.flaticon.com/512/847/847969.png',
                }}
                style={styles.photo}
              />
              <LinearGradient
                colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.6)"]}
                style={styles.photoBottomGradient}
              />

              <TouchableOpacity
                style={styles.settingsBtn}
                onPress={() => router.push('/profile/settings')}
                activeOpacity={0.9}
              >
                <Settings size={18} color="#FFFFFF" />
              </TouchableOpacity>

              {!profile?.avatar_url ? (
                <TouchableOpacity style={styles.addPhotoBtn} onPress={pickAndUploadAvatar} activeOpacity={0.9} disabled={isSaving}>
                  <Plus size={20} color="#0F0F14" />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.infoPanel}>
              <Text style={styles.nameText}>
                {(profile?.full_name || 'משתמש/ת')} {profile?.age ? `, ${profile.age}` : ''}{profile?.city ? ` • ${profile.city}` : ''}
              </Text>
              
            
              {profile?.bio ? (
                <Text style={styles.bioText}>{profile.bio}</Text>
              ) : null}

              {/* per design, action buttons moved to settings screen */}

              {/* gallery grid moved to its own section below */}
            </View>
          </View>
        ) : (
          <View style={styles.editCard}>
            <View style={styles.editHeaderRow}>
              <Text style={styles.editTitle}>עריכת פרופיל</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancelEdit} disabled={isSaving}>
                  <X size={20} color="#9DA4AE" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Save size={20} color="#FFF" />}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>שם מלא</Text>
                <TextInput style={styles.input} value={fullName} onChangeText={setFullName} editable={!isSaving} />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>גיל</Text>
                <TextInput
                  style={styles.input}
                  value={age}
                  onChangeText={setAge}
                  keyboardType="numeric"
                  placeholder="לא חובה"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>אודות</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={4}
                  placeholder="ספר/י קצת על עצמך..."
                  editable={!isSaving}
                />
              </View>
            </View>
          </View>
        )}

        {/* Shared profile (if any) */}
        {sharedGroups.length > 0 && (
          <View style={styles.sectionDark}>
            <Text style={styles.sectionTitleDark}>
              {sharedGroups.length > 1 ? 'פרופילים משותפים' : 'פרופיל משותף'}
            </Text>
            {sharedGroups.map((g) => (
              <View key={g.id} style={styles.sharedCard}>
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
          </View>
        )}

        {/* Gallery section */}
        <View style={styles.sectionDark}>
          <View style={styles.galleryHeaderRow}>
            <Text style={styles.galleryHeaderTitle}>הגלריה שלי</Text>
            <TouchableOpacity
              style={[styles.galleryAddBtn, isAddingImage ? styles.galleryAddBtnDisabled : null]}
              onPress={isAddingImage ? undefined : addGalleryImage}
              activeOpacity={0.9}
            >
              {isAddingImage ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Plus size={16} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.galleryCard}>
            {profile?.image_urls?.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryRow}
              >
                {profile.image_urls.map((url, idx) => {
                  return (
                    <TouchableOpacity
                      key={url + idx}
                      style={styles.galleryItem}
                      activeOpacity={0.9}
                      onPress={() => setViewerIndex(idx)}
                    >
                      <Image source={{ uri: url }} style={styles.galleryImg} />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.galleryEmptyText}>אין תמונות בגלריה</Text>
            )}
          </View>
        </View>

        {userApartments.length > 0 && (
          <View style={styles.sectionDark}>
            <Text style={styles.sectionTitleDark}>הדירות שלי</Text>
            {userApartments.map((apt) => {
              const thumb = getApartmentPrimaryImage(apt);
              return (
                <TouchableOpacity
                  key={apt.id}
                  style={styles.apartmentRow}
                  onPress={() => router.push({ pathname: '/apartment/[id]', params: { id: apt.id } })}
                >
                  <Image source={{ uri: thumb }} style={styles.aptThumb} />
                  <View style={styles.aptTextWrap}>
                    <Text style={styles.aptTitle} numberOfLines={1}>{apt.title}</Text>
                    <Text style={styles.aptSub} numberOfLines={1}>{apt.city}</Text>
                    {!!aptMembers[apt.id]?.length && (
                      <View style={styles.aptAvatarsRow}>
                        {aptMembers[apt.id].slice(0, 4).map((u) => (
                          <Image
                            key={u.id}
                            source={{ uri: u.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                            style={styles.aptAvatar}
                          />
                        ))}
                      </View>
                    )}
                    <View style={styles.aptPricePill}>
                      <Text style={styles.aptPriceText}>₪{apt.price}/חודש</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* moved logout and delete actions to /profile/settings */}
      </ScrollView>
      {viewerIndex !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setViewerIndex(null)}
        >
          <View style={styles.viewerOverlay}>
            <TouchableOpacity
              style={[styles.viewerCloseBtn, { top: 36 + insets.top }]}
              onPress={() => setViewerIndex(null)}
              activeOpacity={0.9}
            >
              <X size={18} color="#E5E7EB" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewerDeleteBtn, { top: 36 + insets.top }]}
              onPress={() => {
                if (viewerIndex !== null) removeImageAt(viewerIndex);
              }}
              disabled={isDeletingImage}
              activeOpacity={0.9}
            >
              {isDeletingImage ? (
                <ActivityIndicator size="small" color="#F87171" />
              ) : (
                <Trash2 size={18} color="#F87171" />
              )}
            </TouchableOpacity>
            {viewerIndex !== null && (
              <Image
                source={{ uri: profile?.image_urls?.[viewerIndex] || '' }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>
      )}
      {(isSaving || isAddingImage) && (
        <View style={styles.fullScreenLoader}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F0F14',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  headerGradient: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  profileCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#15151C',
  },
  photoWrap: {
    position: 'relative',
    backgroundColor: '#22232E',
  },
  photo: {
    width: '100%',
    height: 360,
  },
  photoBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  fullScreenLoader: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  addPhotoBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#A78BFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtn: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '92%',
    height: '70%',
    borderRadius: 12,
    backgroundColor: '#0F0F14',
  },
  viewerDeleteBtn: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(248,113,113,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  viewerCloseBtn: {
    position: 'absolute',
    left: 16,
    top: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  matchBadgeWrap: {
    // removed (badge no longer displayed)
  },
  matchBadgeCircle: {
    // removed
  },
  matchBadgeText: {
    // removed
  },
  whyMatchWrap: {
    // removed (moved below image)
  },
  whyMatchTitle: {
    // removed
  },
  whyChip: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  whyChipText: {
    color: '#1F2937',
    fontWeight: '700',
    fontSize: 13,
  },
  infoPanel: {
    padding: 16,
    backgroundColor: '#15151C',
  },
  nameText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    marginBottom: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationText: {
    color: '#C7CBD1',
    fontSize: 16,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  tagChip: {
    backgroundColor: '#1E1F2A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  tagText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  whyInlineWrap: {
    marginBottom: 8,
  },
  whyInlineTitle: {
    color: '#FFFFFF',
    fontWeight: '800',
    marginBottom: 6,
  },
  bioText: {
    color: '#C7CBD1',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 8,
  },
  seeMoreText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // actions for gallery moved to edit screen
  galleryGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  galleryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  galleryHeaderRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryCard: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
  },
  galleryHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  galleryAddBtn: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  galleryAddBtnDisabled: {
    opacity: 0.75,
  },
  galleryEmptyText: {
    color: '#9DA4AE',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  galleryItem: {
    width: 130,
    height: 160,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1B1C27',
  },
  galleryItemTall: {
    aspectRatio: 0.8,
    borderRadius: 22,
  },
  galleryImg: {
    width: '100%',
    height: '100%',
  },

  editCard: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#15151C',
    borderRadius: 16,
  },
  editHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  editTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    padding: 8,
  },
  saveButton: {
    backgroundColor: '#7C5CFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  input: {
    backgroundColor: '#1B1C27',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    color: '#FFFFFF',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  sectionDark: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitleDark: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  sharedCard: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 12,
    marginTop: 4,
    alignItems: 'center',
  },
  sharedAvatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
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
  apartmentRow: {
    backgroundColor: '#15151C',
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    minHeight: 120,
  },
  aptThumb: {
    width: 120,
    height: 90,
    borderRadius: 14,
    backgroundColor: '#1B1C27',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  aptTextWrap: {
    flex: 1,
    gap: 6,
  },
  aptTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'right',
  },
  aptSub: {
    color: '#9DA4AE',
    fontSize: 14,
    textAlign: 'right',
  },
  aptAvatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  aptAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1B1C27',
    borderWidth: 2,
    borderColor: '#0F0F14',
  },
  aptPricePill: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  aptPriceText: {
    color: '#22C55E',
    fontWeight: '900',
    fontSize: 13,
  },
  actionButtonsRow: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  editProfileBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editProfileBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  // removed sign out & delete button styles (moved to settings)

  bottomActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  actionCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionNo: {
    shadowColor: '#EF4444',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  actionStar: {
    shadowColor: '#7C3AED',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  actionYes: {
    shadowColor: '#10B981',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
});
