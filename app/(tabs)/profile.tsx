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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut, Edit, Save, X, Plus, MapPin } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import { User, Apartment } from '@/types/database';
import NotificationsButton from '@/components/NotificationsButton';

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
  const [aptMembers, setAptMembers] = useState<Record<string, User[]>>({});

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

      const { data: aptData, error: aptError } = await supabase
        .from('apartments')
        .select('*')
        .eq('owner_id', user.id);

      if (aptError) throw aptError;
      setUserApartments(aptData || []);

      // Load roommates (partners) avatars per apartment
      const membersMap: Record<string, User[]> = {};
      await Promise.all(
        (aptData || []).map(async (apt) => {
          const ids = (apt as any).partner_ids as string[] | undefined;
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

  const pickAndUploadExtraPhotos = async () => {
    try {
      if (!user) return;

      const current = (profile?.image_urls ?? []).filter(Boolean);
      const remaining = Math.max(0, 6 - current.length);
      if (remaining <= 0) {
        Alert.alert('מגבלה', 'ניתן לשמור עד 6 תמונות נוספות');
        return;
      }

      const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perms.granted) {
        Alert.alert('הרשאה נדרשת', 'יש לאפשר גישה לגלריה כדי להעלות תמונות');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.9,
      } as any);

      if ((result as any).canceled || !(result as any).assets?.length) return;

      setIsSaving(true);
      const newUrls: string[] = [];
      for (const asset of (result as any).assets) {
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        const fileExt = (asset.fileName || 'image.jpg').split('.').pop() || 'jpg';
        const fileName = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        const filePath = `users/${user.id}/gallery/${fileName}`;
        const filePayload: any = arrayBuffer as any;

        const { error: upErr } = await supabase.storage
          .from('user-images')
          .upload(filePath, filePayload, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from('user-images').getPublicUrl(filePath);
        newUrls.push(data.publicUrl);
      }

      const merged = [...current, ...newUrls].slice(0, 6);
      const { error: updateErr } = await supabase
        .from('users')
        .update({ image_urls: merged, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateErr) throw updateErr;

      setProfile((prev) => (prev ? { ...prev, image_urls: merged } as any : prev));
      Alert.alert('הצלחה', 'התמונות נוספו');
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'לא ניתן להעלות תמונות');
    } finally {
      setIsSaving(false);
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
        <NotificationsButton style={{ left: 16 }} />
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
        <NotificationsButton style={{ left: 16 }} />
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(220, 120 + insets.bottom) }]}>

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

              <TouchableOpacity style={styles.addPhotoBtn} onPress={pickAndUploadAvatar} activeOpacity={0.9} disabled={isSaving}>
                <Plus size={20} color="#0F0F14" />
              </TouchableOpacity>
            </View>

            <View style={styles.infoPanel}>
              <Text style={styles.nameText}>
                {(profile?.full_name || 'משתמש/ת')} {profile?.age ? `, ${profile.age}` : ''}{profile?.city ? ` • ${profile.city}` : ''}
              </Text>
              
            
              {profile?.bio ? (
                <Text style={styles.bioText}>{profile.bio}</Text>
              ) : null}

              <TouchableOpacity
                style={styles.editProfileBtn}
                onPress={() => router.push('/profile/edit')}
                activeOpacity={0.9}
              >
                <Edit size={18} color="#0F0F14" />
                <Text style={styles.editProfileBtnText}>עריכת פרופיל</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.editProfileBtn, { backgroundColor: '#34D399', alignSelf: 'flex-end', marginTop: 10 }]}
                onPress={() => router.push('/(tabs)/onboarding/survey')}
                activeOpacity={0.9}
              >
                <MapPin size={18} color="#0F0F14" />
                <Text style={styles.editProfileBtnText}>מילוי שאלון העדפות</Text>
              </TouchableOpacity>

              <View style={styles.galleryActionsRow}>
                <TouchableOpacity style={[styles.galleryAddBtn, isSaving && { opacity: 0.6 }]} onPress={pickAndUploadExtraPhotos} disabled={isSaving}>
                  <Text style={styles.galleryAddBtnText}>הוסף תמונות נוספות (עד 6)</Text>
                </TouchableOpacity>
                {!!profile?.image_urls?.length && (
                  <Text style={styles.galleryCountText}>{profile.image_urls.length}/6</Text>
                )}
              </View>

              {profile?.image_urls?.length ? (
                <View style={styles.galleryGrid}>
                  {profile.image_urls.map((url, idx) => (
                    <View key={url + idx} style={[styles.galleryItem, (idx % 7 === 0) && styles.galleryItemTall]}>
                      <Image source={{ uri: url }} style={styles.galleryImg} />
                    </View>
                  ))}
                </View>
              ) : null}
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

        <TouchableOpacity style={styles.signOutButtonDark} onPress={handleSignOut}>
          <LogOut size={20} color="#FCA5A5" />
          <Text style={styles.signOutTextDark}>התנתק</Text>
        </TouchableOpacity>
      </ScrollView>
      {isSaving && (
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

  galleryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  galleryAddBtn: {
    backgroundColor: '#7C5CFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  galleryAddBtnText: {
    color: '#0F0F14',
    fontWeight: '800',
  },
  galleryCountText: {
    color: '#9DA4AE',
    fontWeight: '700',
  },
  galleryGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  galleryItem: {
    width: '31%',
    aspectRatio: 1,
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
  editProfileBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    backgroundColor: '#7C5CFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editProfileBtnText: {
    color: '#0F0F14',
    fontWeight: '900',
    fontSize: 14,
  },
  signOutButtonDark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#15151C',
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.3)',
    marginHorizontal: 16,
    marginTop: 12,
  },
  signOutTextDark: {
    color: '#FCA5A5',
    fontSize: 16,
    fontWeight: '700',
  },

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
