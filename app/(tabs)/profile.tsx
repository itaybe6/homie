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
import { LogOut, Edit, Save, X, MapPin, Plus } from 'lucide-react-native';
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

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  // Removed deprecated interests field

  useEffect(() => {
    fetchProfile();
  }, [user]);

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
      const blob = await response.blob();
      const fileExt = (asset.fileName || 'avatar.jpg').split('.').pop() || 'jpg';
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `users/${user.id}/${fileName}`;
      const filePayload: any = typeof File !== 'undefined'
        ? new File([blob], fileName, { type: blob.type || 'image/jpeg' })
        : blob;

      const { error: uploadError } = await supabase.storage
        .from('user-images')
        .upload(filePath, filePayload, { contentType: (blob as any).type || 'image/jpeg', upsert: true });
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
        const blob = await response.blob();
        const fileExt = (asset.fileName || 'image.jpg').split('.').pop() || 'jpg';
        const fileName = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        const filePath = `users/${user.id}/gallery/${fileName}`;
        const filePayload: any = typeof File !== 'undefined'
          ? new File([blob], fileName, { type: (blob as any).type || 'image/jpeg' })
          : blob;

        const { error: upErr } = await supabase.storage
          .from('user-images')
          .upload(filePath, filePayload, { contentType: (blob as any).type || 'image/jpeg', upsert: true });
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

              <TouchableOpacity style={styles.addPhotoBtn} onPress={pickAndUploadAvatar} activeOpacity={0.9}>
                <Plus size={20} color="#0F0F14" />
              </TouchableOpacity>
            </View>

            <View style={styles.infoPanel}>
              <Text style={styles.nameText}>
                {(profile?.full_name || 'משתמש/ת')} {profile?.age ? `, ${profile.age}` : ''}
              </Text>
              <View style={styles.locationRow}> 
                <MapPin size={16} color="#C7CBD1" />
                <Text style={styles.locationText}> Brooklyn • 2 מייל</Text>
              </View>

              <View style={styles.tagsRow}>
                {['מקצועי/ת', 'נקי/ה', 'נוהג/ת לילה'].map((tag) => (
                  <View key={tag} style={styles.tagChip}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.whyInlineWrap}>
                <Text style={styles.whyInlineTitle}>למה זה מתאים:</Text>
                <View style={styles.tagsRow}>
                  {['תחביב משותף: טיולים', 'שניכם ערים בלילה', 'תקציב דומה'].map((t) => (
                    <View key={t} style={styles.whyChip}>
                      <Text style={styles.whyChipText}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {profile?.bio ? (
                <Text style={styles.bioText}>{profile.bio}</Text>
              ) : (
                <Text style={styles.bioText}>
                  אוהב/ת מוזיקה וקפה טוב. מחפש/ת שותף/פה נוח/ה ונקי/ה לשיתוף דירה חמימה.
                </Text>
              )}

              <Text style={styles.seeMoreText}>See more</Text>

              <View style={styles.galleryActionsRow}>
                <TouchableOpacity style={styles.galleryAddBtn} onPress={pickAndUploadExtraPhotos}>
                  <Text style={styles.galleryAddBtnText}>הוסף תמונות נוספות (עד 6)</Text>
                </TouchableOpacity>
                {!!profile?.image_urls?.length && (
                  <Text style={styles.galleryCountText}>{profile.image_urls.length}/6</Text>
                )}
              </View>
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

        <View style={styles.sectionDark}>
          <Text style={styles.sectionTitleDark}>הדירות שלי</Text>
          {userApartments.length > 0 ? (
            userApartments.map((apt) => (
              <TouchableOpacity key={apt.id} style={styles.apartmentCardDark} onPress={() => router.push(`/apartment/${apt.id}`)}>
                <Text style={styles.apartmentTitleDark}>{apt.title}</Text>
                <Text style={styles.apartmentLocationDark}>{apt.city} • ₪{apt.price}/חודש</Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={styles.emptyTextDark}>אין לך דירות</Text>
          )}
        </View>

        <TouchableOpacity style={styles.signOutButtonDark} onPress={handleSignOut}>
          <LogOut size={20} color="#FCA5A5" />
          <Text style={styles.signOutTextDark}>התנתק</Text>
        </TouchableOpacity>
      </ScrollView>
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
  apartmentCardDark: {
    backgroundColor: '#15151C',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  apartmentTitleDark: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  apartmentLocationDark: {
    color: '#9DA4AE',
    fontSize: 14,
  },
  emptyTextDark: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 20,
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
