import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import * as ImagePicker from 'expo-image-picker';

export default function AddApartmentScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const addApartment = useApartmentStore((state) => state.addApartment);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [price, setPrice] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [images, setImages] = useState<string[]>([]); // local URIs before upload
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
        const picked = (result as any).assets?.map((a: any) => a.uri) ?? [];
        if (picked.length) setImages((prev) => [...prev, ...picked].slice(0, 12));
      }
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'בחירת תמונות נכשלה');
    }
  };

  const removeImageAt = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const uploadImage = async (userId: string, uri: string): Promise<string> => {
    // Try to infer extension safely (blob: URIs won't have one)
    const match = uri.match(/\.([a-zA-Z0-9]{1,5})(?:\?.*)?$/);
    const ext = match ? match[1].toLowerCase() : 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `apartments/${userId}/${fileName}`;
    const res = await fetch(uri);
    const blob = await res.blob();
    const filePayload: any = typeof File !== 'undefined'
      ? new File([blob], fileName, { type: blob.type || 'image/jpeg' })
      : blob;
    const { error: upErr } = await supabase
      .storage
      .from('apartment-images')
      .upload(path, filePayload, { upsert: true, contentType: blob.type || 'image/jpeg' });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('apartment-images').getPublicUrl(path);
    return data.publicUrl;
  };

  const ensureUserProfileRow = async (userId: string, email: string | null) => {
    // Verify profile row exists to satisfy FK: apartments.owner_id -> users.id
    const { data: existing, error: selectErr } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (selectErr) {
      // Non-blocking; try to proceed to upsert in case select blocked by RLS in some envs
    }

    if (!existing) {
      const fallbackName = email || 'משתמש';
      await supabase
        .from('users')
        .upsert(
          {
            id: userId,
            email: email,
            full_name: fallbackName,
          } as any,
          { onConflict: 'id' }
        );
    }
  };

  const handleSubmit = async () => {
    if (
      !title ||
      !address ||
      !city ||
      !price ||
      !bedrooms ||
      !bathrooms
    ) {
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

    setIsLoading(true);
    setError('');

    try {
      // Ensure user is authenticated
      const { data: userResp } = await supabase.auth.getUser();
      const authUser = user ?? userResp.user ?? null;
      if (!authUser) {
        setError('יש להתחבר כדי להוסיף דירה');
        setIsLoading(false);
        return;
      }

      // Make sure a users-row exists for FK
      await ensureUserProfileRow(authUser.id, authUser.email ?? null);

      // Upload images first (best-effort; stop if any upload fails)
      const uploadedUrls: string[] = [];
      for (const uri of images) {
        const url = await uploadImage(authUser.id, uri);
        uploadedUrls.push(url);
      }

      const { data, error: insertError } = await supabase
        .from('apartments')
        .insert({
          owner_id: authUser.id,
          title,
          description: description || null,
          address,
          city,
          price: priceNum,
          bedrooms: bedroomsNum,
          bathrooms: bathroomsNum,
          image_urls: uploadedUrls.length ? uploadedUrls : null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await supabase.from('apartment_members').insert({
        apartment_id: data.id,
        user_id: authUser.id,
        role: 'owner',
      });

      addApartment(data);
      Alert.alert('הצלחה', 'הדירה נוספה בהצלחה');
      router.replace('/(tabs)/home');
    } catch (err: any) {
      setError(err.message || 'שגיאה בהוספת דירה');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setAddress('');
    setCity('');
    setPrice('');
    // room type removed
    setBedrooms('');
    setBathrooms('');
    setImages([]);
    setError('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                <Text style={styles.backBtnText}>חזור</Text>
              </TouchableOpacity>
              <Text style={styles.title}>הוסף דירה חדשה</Text>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.card}> 
            <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                כותרת <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="לדוגמה: דירת 3 חדרים בתל אביב"
                value={title}
                onChangeText={setTitle}
                editable={!isLoading}
                placeholderTextColor="#9AA0A6"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>תיאור</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="תאר את הדירה בקצרה..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                editable={!isLoading}
                placeholderTextColor="#9AA0A6"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                כתובת <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="רחוב ומספר בית"
                value={address}
                onChangeText={setAddress}
                editable={!isLoading}
                placeholderTextColor="#9AA0A6"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                עיר <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="לדוגמה: תל אביב"
                value={city}
                onChangeText={setCity}
                editable={!isLoading}
                placeholderTextColor="#9AA0A6"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                מחיר לחודש (₪) <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="3000"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                editable={!isLoading}
                placeholderTextColor="#9AA0A6"
              />
            </View>

            {/* סוג חדר הוסר לפי בקשה */}

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>
                  חדרי שינה <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="3"
                  value={bedrooms}
                  onChangeText={setBedrooms}
                  keyboardType="numeric"
                  editable={!isLoading}
                  placeholderTextColor="#9AA0A6"
                />
              </View>

              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>
                  חדרי אמבטיה <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="2"
                  value={bathrooms}
                  onChangeText={setBathrooms}
                  keyboardType="numeric"
                  editable={!isLoading}
                  placeholderTextColor="#9AA0A6"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>תמונות הדירה</Text>
              <View style={styles.galleryHeader}>
                <Text style={styles.galleryHint}>עד 12 תמונות • גרור לשינוי סדר לאחר שמירה</Text>
                <TouchableOpacity style={styles.addImagesBtn} onPress={pickImages} disabled={isLoading}>
                  <Text style={styles.addImagesBtnText}>הוסף תמונות</Text>
                </TouchableOpacity>
              </View>
              {images.length ? (
                <View style={styles.galleryGrid}>
                  {images.map((uri, idx) => (
                    <View key={uri + idx} style={styles.thumbWrap}>
                      <Image source={{ uri }} style={styles.thumb} />
                      <TouchableOpacity style={styles.removeThumb} onPress={() => removeImageAt(idx)}>
                        <Text style={styles.removeThumbText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.galleryPlaceholder}>
                  <Text style={styles.galleryPlaceholderText}>לא נבחרו תמונות</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>הוסף דירה</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resetButton}
              onPress={resetForm}
              disabled={isLoading}>
              <Text style={styles.resetButtonText}>נקה טופס</Text>
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
    backgroundColor: '#F5F5F5',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
    textAlign: 'right',
  },
  backBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backBtnText: {
    color: '#424242',
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
    textAlign: 'right',
  },
  required: {
    color: '#F44336',
  },
  input: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
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
    backgroundColor: '#00BCD4',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: '#FFF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  resetButtonText: {
    color: '#757575',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    backgroundColor: '#FFEBEE',
    color: '#C62828',
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
    marginBottom: 16,
  },
  galleryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addImagesBtn: {
    backgroundColor: '#00BCD4',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  addImagesBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  galleryHint: {
    color: '#757575',
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
    backgroundColor: '#F3F4F6',
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
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    marginTop: 10,
  },
  galleryPlaceholderText: {
    color: '#9AA0A6',
    fontSize: 13,
  },
});
