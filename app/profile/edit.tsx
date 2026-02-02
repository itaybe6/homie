import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Save, X, Trash2, Plus } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isUpdatingImages, setIsUpdatingImages] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!user?.id) { setLoading(false); return; }
        const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
        if (error) throw error;
        if (data) {
          setFullName(data.full_name || '');
          setAge(data.age ? String(data.age) : '');
          setBio(data.bio || '');
          setPhone(data.phone || '');
          setEmail(data.email || '');
          setCity(data.city || '');
          const arr = Array.isArray((data as any).image_urls) ? (data as any).image_urls.filter(Boolean) : [];
          setImages(arr);
        }
      } catch (e) {
        Alert.alert('שגיאה', 'לא ניתן לטעון את פרטי המשתמש');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    if (!fullName.trim()) {
      Alert.alert('שגיאה', 'שם מלא הוא שדה חובה');
      return;
    }
    const ageNum = age ? parseInt(age) : null;
    if (age && (isNaN(ageNum!) || ageNum! <= 0)) {
      Alert.alert('שגיאה', 'גיל לא תקין');
      return;
    }
    try {
      setSaving(true);
      const { error } = await supabase
        .from('users')
        .update({
          full_name: fullName,
          age: ageNum,
          bio: bio || null,
          phone: phone || null,
          email: email || null,
          city: city || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      Alert.alert('הצלחה', 'הפרטים נשמרו');
      router.back();
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'לא ניתן לשמור');
    } finally {
      setSaving(false);
    }
  };

  const pickAndUploadExtraPhotos = async () => {
    try {
      if (!user?.id) return;

      const current = images.filter(Boolean);
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

      setIsUpdatingImages(true);
      const newUrls: string[] = [];
      for (const asset of (result as any).assets) {
        // Check image dimensions and only resize if larger than 1200px
        const imageInfo = await ImageManipulator.manipulateAsync(asset.uri, []);
        const actions: ImageManipulator.Action[] = [];
        if (imageInfo.width > 1200) {
          actions.push({ resize: { width: 1200 } });
        }
        // Compress the image
        const compressed = await ImageManipulator.manipulateAsync(
          asset.uri,
          actions,
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        const response = await fetch(compressed.uri);
        const arrayBuffer = await response.arrayBuffer();
        const fileName = `${user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
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

      setImages(merged);
      Alert.alert('הצלחה', 'התמונות נוספו');
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'לא ניתן להעלות תמונות');
    } finally {
      setIsUpdatingImages(false);
    }
  };

  const getObjectPathFromPublicUrl = (publicUrl: string): string | null => {
    // Supabase public URL pattern: .../storage/v1/object/public/user-images/<objectPath>
    const marker = '/storage/v1/object/public/user-images/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return publicUrl.substring(idx + marker.length);
  };

  const removeImageAt = async (idx: number) => {
    try {
      if (!user?.id) return;
      const url = images[idx];
      if (!url) return;

      const confirmDelete = Platform.OS === 'web'
        ? typeof confirm === 'function'
          ? confirm('למחוק את התמונה הזו?')
          : true
        : await new Promise<boolean>((resolve) => {
            Alert.alert('מחיקת תמונה', 'למחוק את התמונה הזו?', [
              { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
              { text: 'מחק', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
      if (!confirmDelete) return;

      setIsUpdatingImages(true);
      const next = images.filter((_, i) => i !== idx);
      const { error: updateErr } = await supabase
        .from('users')
        .update({ image_urls: next, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateErr) throw updateErr;

      setImages(next);

      // Try to delete from storage (best-effort)
      try {
        const objectPath = getObjectPathFromPublicUrl(url);
        if (objectPath) {
          await supabase.storage.from('user-images').remove([objectPath]);
        }
      } catch {}
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'לא ניתן למחוק את התמונה');
    } finally {
      setIsUpdatingImages(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#5e3f2d" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ height: 30 }} />

      <ScrollView contentContainerStyle={[styles.form, { paddingBottom: 40 }]}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>שם מלא</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} editable={!saving} />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>גיל</Text>
          <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" editable={!saving} placeholder="לא חובה" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>אימייל</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>טלפון</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="05X-XXXXXXX"
            editable={!saving}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>עיר</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            editable={!saving}
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
            editable={!saving}
          />
        </View>

        <View style={{ gap: 8 }}>
          <View style={styles.galleryActionsRow}>
            <TouchableOpacity
              style={[styles.galleryAddBtn, (isUpdatingImages || saving) && { opacity: 0.6 }]}
              onPress={pickAndUploadExtraPhotos}
              disabled={isUpdatingImages || saving}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={styles.galleryAddBtnText}>הוסף תמונות</Text>
            </TouchableOpacity>
            {!!images.length && (
              <Text style={styles.galleryCountText}>{images.length}/6</Text>
            )}
          </View>

          {!!images.length && (
            <View style={styles.galleryGrid}>
              {images.map((url, idx) => (
                <View key={url + idx} style={[styles.galleryItem, (idx % 7 === 0) && styles.galleryItemTall]}>
                  <Image source={{ uri: url }} style={styles.galleryImg} />
                  <TouchableOpacity
                    onPress={() => removeImageAt(idx)}
                    style={styles.removeBtn}
                    disabled={isUpdatingImages}
                    activeOpacity={0.85}
                  >
                    <Trash2 size={16} color="#F87171" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.cancelBtn, saving && { opacity: 0.6 }]} onPress={() => router.back()} disabled={saving}>
            <X size={18} color="#9DA4AE" />
            <Text style={styles.cancelText}>ביטול</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#0F0F14" /> : <Save size={18} color="#0F0F14" />}
            <Text style={styles.saveText}>שמור</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F0F14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    marginTop: 8,
    paddingHorizontal: 16,
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
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cancelText: {
    color: '#9DA4AE',
    fontWeight: '800',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4C1D95',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  saveText: {
    color: '#0F0F14',
    fontWeight: '900',
  },
  galleryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  galleryAddBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  galleryAddBtnText: {
    color: '#FFFFFF',
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
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  galleryItemTall: {
    aspectRatio: 0.8,
    borderRadius: 22,
  },
  galleryImg: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248,113,113,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.28)',
  },
});

