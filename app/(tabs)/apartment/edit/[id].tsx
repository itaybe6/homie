import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import { Apartment } from '@/types/database';

type ImageItem = { uri: string; isLocal: boolean };

export default function EditApartmentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const updateApartmentInStore = useApartmentStore((s) => s.updateApartment);

  const [apartment, setApartment] = useState<Apartment | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [price, setPrice] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, [id]);

  const normalizeImages = (value: any): string[] => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch {}
      return value
        .replace(/^{|}$/g, '')
        .split(',')
        .map((s: string) => s.replace(/^"+|"+$/g, '').trim())
        .filter(Boolean);
    }
    return [];
  };

  const load = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data: apt, error: aptErr } = await supabase
        .from('apartments')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (aptErr) throw aptErr;
      if (!apt) {
        Alert.alert('שגיאה', 'הדירה לא נמצאה');
        router.back();
        return;
      }
      if (user?.id !== apt.owner_id) {
        Alert.alert('שגיאה', 'אין לך הרשאה לערוך דירה זו');
        router.replace(`/apartment/${apt.id}`);
        return;
      }

      setApartment(apt as Apartment);
      setTitle(apt.title || '');
      setDescription(apt.description || '');
      setAddress(apt.address || '');
      setCity(apt.city || '');
      setNeighborhood(apt.neighborhood || '');
      setPrice(String(apt.price ?? ''));
      setBedrooms(String(apt.bedrooms ?? ''));
      setBathrooms(String(apt.bathrooms ?? ''));

      const existing = normalizeImages((apt as any).image_urls);
      setImages(existing.map((u) => ({ uri: u, isLocal: false })));
    } catch (e: any) {
      setError(e.message || 'טעינת הדירה נכשלה');
    } finally {
      setIsLoading(false);
    }
  };

  const pickImages = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('שגיאה', 'נדרש אישור לגישה לגלריה');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
        allowsMultipleSelection: true,
        selectionLimit: 6,
      } as any);

      if (!result.canceled) {
        const picked = (result as any).assets?.map((a: any) => ({ uri: a.uri, isLocal: true })) ?? [];
        if (picked.length) {
          setImages((prev) => {
            const next = [...prev, ...picked];
            return next.slice(0, 12);
          });
        }
      }
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'בחירת תמונות נכשלה');
    }
  };

  const removeImageAt = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadImage = async (userId: string, uri: string): Promise<string> => {
    const match = uri.match(/\.([a-zA-Z0-9]{1,5})(?:\?.*)?$/);
    const ext = match ? match[1].toLowerCase() : 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `apartments/${userId}/${fileName}`;
    const res = await fetch(uri);
    const arrayBuffer = await res.arrayBuffer();
    const { error: upErr } = await supabase
      .storage
      .from('apartment-images')
      .upload(path, arrayBuffer, { upsert: true, contentType: `image/${ext === 'png' ? 'png' : 'jpeg'}` });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('apartment-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSave = async () => {
    if (!apartment) return;
    if (!title || !address || !city || !price || !bedrooms || !bathrooms) {
      setError('אנא מלא את כל השדות החובה');
      return;
    }

    const priceNum = parseFloat(price);
    const bedroomsNum = parseInt(bedrooms);
    const bathroomsNum = parseInt(bathrooms);

    if (isNaN(priceNum) || priceNum <= 0) {
      setError('מחיר לא תקין');
      return;
    }
    if (isNaN(bedroomsNum) || bedroomsNum <= 0) {
      setError('מספר חדרי שינה לא תקין');
      return;
    }
    if (isNaN(bathroomsNum) || bathroomsNum <= 0) {
      setError('מספר חדרי אמבטיה לא תקין');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const authUserId = user?.id;
      if (!authUserId) throw new Error('יש להתחבר כדי לערוך דירה');
      if (authUserId !== apartment.owner_id) throw new Error('אין הרשאה לערוך דירה זו');

      const existingUrls = images.filter((i) => !i.isLocal).map((i) => i.uri);
      const localUris = images.filter((i) => i.isLocal).map((i) => i.uri);

      const uploadedUrls: string[] = [];
      for (const uri of localUris) {
        const url = await uploadImage(authUserId, uri);
        uploadedUrls.push(url);
      }

      const finalUrls = [...existingUrls, ...uploadedUrls];

      const { data: updated, error: updateErr } = await supabase
        .from('apartments')
        .update({
          title,
          description: description || null,
          address,
          city,
          neighborhood: neighborhood || null,
          price: priceNum,
          bedrooms: bedroomsNum,
          bathrooms: bathroomsNum,
          image_urls: finalUrls.length ? finalUrls : null,
        })
        .eq('id', apartment.id)
        .select()
        .maybeSingle();

      if (updateErr) throw updateErr;
      if (!updated) throw new Error('השמירה נכשלה');

      updateApartmentInStore(updated as Apartment);
      Alert.alert('הצלחה', 'השינויים נשמרו בהצלחה');
      router.replace(`/apartment/${apartment.id}`);
    } catch (e: any) {
      setError(e.message || 'שגיאה בשמירת השינויים');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (apartment) {
      router.replace(`/apartment/${apartment.id}`);
    } else {
      router.back();
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#7C5CFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>עריכת דירה</Text>
            <TouchableOpacity style={styles.backBtn} onPress={handleCancel} disabled={isSaving}>
              <Text style={styles.backBtnText}>חזור</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.card}>
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>כותרת <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="כותרת הדירה"
                  placeholderTextColor="#9AA0A6"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>תיאור</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="תיאור הדירה"
                  placeholderTextColor="#9AA0A6"
                  multiline
                  numberOfLines={4}
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>עיר <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={city}
                  onChangeText={setCity}
                  placeholder="עיר"
                  placeholderTextColor="#9AA0A6"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>שכונה</Text>
                <TextInput
                  style={styles.input}
                  value={neighborhood}
                  onChangeText={setNeighborhood}
                  placeholder="שכונה"
                  placeholderTextColor="#9AA0A6"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>כתובת <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="כתובת"
                  placeholderTextColor="#9AA0A6"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>מחיר לחודש (₪) <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={price}
                  onChangeText={setPrice}
                  placeholder="3000"
                  keyboardType="numeric"
                  placeholderTextColor="#9AA0A6"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, styles.halfWidth]}>
                  <Text style={styles.label}>חדרי שינה <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={bedrooms}
                    onChangeText={setBedrooms}
                    placeholder="3"
                    keyboardType="numeric"
                    placeholderTextColor="#9AA0A6"
                    editable={!isSaving}
                  />
                </View>
                <View style={[styles.inputGroup, styles.halfWidth]}>
                  <Text style={styles.label}>חדרי אמבטיה <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={styles.input}
                    value={bathrooms}
                    onChangeText={setBathrooms}
                    placeholder="2"
                    keyboardType="numeric"
                    placeholderTextColor="#9AA0A6"
                    editable={!isSaving}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>תמונות הדירה</Text>
                <View style={styles.galleryHeader}>
                  <Text style={styles.galleryHint}>עד 12 תמונות</Text>
                  <TouchableOpacity style={styles.addImagesBtn} onPress={pickImages} disabled={isSaving}>
                    <Text style={styles.addImagesBtnText}>הוסף תמונות</Text>
                  </TouchableOpacity>
                </View>
                {images.length ? (
                  <View style={styles.galleryGrid}>
                    {images.map((item, idx) => (
                      <View key={item.uri + idx} style={styles.thumbWrap}>
                        <Image source={{ uri: item.uri }} style={styles.thumb} />
                        <TouchableOpacity style={styles.removeThumb} onPress={() => removeImageAt(idx)}>
                          <Text style={styles.removeThumbText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.galleryPlaceholder}>
                    <Text style={styles.galleryPlaceholderText}>אין תמונות לדירה</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.button, isSaving && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>שמור שינויים</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resetButton}
                onPress={handleCancel}
                disabled={isSaving}
              >
                <Text style={styles.resetButtonText}>ביטול</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'right',
  },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#141420',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A37',
    padding: 16,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
    position: 'relative',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C9CDD6',
    textAlign: 'right',
  },
  required: {
    color: '#F87171',
  },
  input: {
    backgroundColor: '#17171F',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A2A37',
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  button: {
    backgroundColor: '#7C5CFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#0F0F14',
    fontSize: 16,
    fontWeight: '800',
  },
  resetButton: {
    backgroundColor: '#1B1B28',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A37',
  },
  resetButtonText: {
    color: '#C9CDD6',
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    backgroundColor: 'rgba(255,59,48,0.12)',
    color: '#FF9AA2',
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addImagesBtn: {
    backgroundColor: '#7C5CFF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  addImagesBtnText: {
    color: '#0F0F14',
    fontWeight: '800',
    fontSize: 14,
  },
  galleryHint: {
    color: '#9DA4AE',
    fontSize: 12,
    textAlign: 'right',
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  thumbWrap: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1F1F29',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  removeThumb: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeThumbText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 16,
    marginTop: -1,
  },
  galleryPlaceholder: {
    backgroundColor: '#17171F',
    borderWidth: 1,
    borderColor: '#2A2A37',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    marginTop: 10,
  },
  galleryPlaceholderText: {
    color: '#9DA4AE',
    fontSize: 13,
  },
});


