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
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import * as ImagePicker from 'expo-image-picker';
import { autocompleteCities, autocompleteAddresses, autocompleteNeighborhoods, createSessionToken, PlacePrediction, getPlaceLocation } from '@/lib/googlePlaces';
import { fetchNeighborhoodsForCity } from '@/lib/neighborhoods';


export default function AddApartmentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams() as { from?: string };
  const { user } = useAuthStore();
  const addApartment = useApartmentStore((state) => state.addApartment);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [price, setPrice] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [images, setImages] = useState<string[]>([]); // local URIs before upload
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<PlacePrediction[]>([]);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [cityPlaceId, setCityPlaceId] = useState<string | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [neighborhoodSuggestions, setNeighborhoodSuggestions] = useState<string[]>([]);
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>([]);
  const [isNeighborhoodOpen, setIsNeighborhoodOpen] = useState(false);
  const [neighborhoodSearchQuery, setNeighborhoodSearchQuery] = useState('');
  const [isLoadingNeighborhoods, setIsLoadingNeighborhoods] = useState(false);
  const [includeAsPartner, setIncludeAsPartner] = useState(false);

  useEffect(() => {
    setSessionToken(createSessionToken());
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const q = city.trim();
      if (!q || q.length < 2) { setCitySuggestions([]); return; }
      const preds = await autocompleteCities(q, sessionToken);
      if (active) setCitySuggestions(preds.slice(0, 8));
    };
    run();
    return () => { active = false; };
  }, [city, sessionToken]);

  // Load full neighborhoods list for selected city (dropdown)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!cityPlaceId) { 
        setNeighborhoodOptions([]);
        setIsLoadingNeighborhoods(false);
        return; 
      }
      setIsLoadingNeighborhoods(true);
      try {
        const loc = await getPlaceLocation(cityPlaceId);
        if (!loc) { 
          if (!cancelled) {
            setNeighborhoodOptions([]);
            setIsLoadingNeighborhoods(false);
          }
          return; 
        }
        const list = await fetchNeighborhoodsForCity({ lat: loc.lat, lng: loc.lng, radiusMeters: 25000 });
        if (!cancelled) {
          setNeighborhoodOptions(list);
          setIsLoadingNeighborhoods(false);
        }
      } catch (err) {
        console.warn('Failed to load neighborhoods', err);
        if (!cancelled) {
          setNeighborhoodOptions([]);
          setIsLoadingNeighborhoods(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [cityPlaceId]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const q = neighborhood.trim();
      if (!q || q.length < 1) { setNeighborhoodSuggestions([]); return; }
      const list = await autocompleteNeighborhoods(q, cityPlaceId, sessionToken, city);
      if (active) setNeighborhoodSuggestions(list.slice(0, 10));
    };
    run();
    return () => { active = false; };
  }, [neighborhood, cityPlaceId, sessionToken, city]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const q = address.trim();
      if (!q || q.length < 2) { setAddressSuggestions([]); return; }
      const preds = await autocompleteAddresses(q, cityPlaceId, sessionToken, city);
      if (active) setAddressSuggestions(preds.slice(0, 8));
    };
    run();
    return () => { active = false; };
  }, [address, cityPlaceId, sessionToken, city]);

  const handleBack = () => {
    try {
      if (params?.from === 'register-owner') {
        router.replace('/auth/register');
        return;
      }
      // Go back if possible; otherwise fall back to home
      // @ts-ignore - canGoBack exists on Expo Router
      if (typeof (router as any).canGoBack === 'function' && (router as any).canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/home');
      }
    } catch {
      router.replace('/(tabs)/home');
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
    // On native, Response.blob/File may not exist; use arrayBuffer instead
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
          partner_ids: includeAsPartner ? [authUser.id] : [],
          title,
          description: description || null,
          address,
          city,
          neighborhood: neighborhood || null,
          price: priceNum,
          bedrooms: bedroomsNum,
          bathrooms: bathroomsNum,
          image_urls: uploadedUrls.length ? uploadedUrls : null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Ensure partner_ids contains the creator if user chose to be a partner (fallback if DB ignored the field)
      let apartmentRow = data;
      if (includeAsPartner && (!apartmentRow.partner_ids || apartmentRow.partner_ids.length === 0)) {
        const { data: fixed, error: fixErr } = await supabase
          .from('apartments')
          .update({ partner_ids: [authUser.id] })
          .eq('id', apartmentRow.id)
          .select()
          .single();
        if (!fixErr && fixed) {
          apartmentRow = fixed;
        }
      }

      addApartment(apartmentRow);
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
    setNeighborhood('');
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
              <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
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

            <View style={[styles.inputGroup, citySuggestions.length > 0 ? styles.inputGroupRaised : null]}>
              <Text style={styles.label}>
                עיר <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="לדוגמה: תל אביב"
                value={city}
                onChangeText={(t) => { setCity(t); setCityPlaceId(null); }}
                editable={!isLoading}
                placeholderTextColor="#9AA0A6"
              />
              {citySuggestions.length > 0 ? (
                <View style={styles.suggestionsBox}>
                  {citySuggestions.map((p) => (
                    <TouchableOpacity
                      key={p.placeId}
                      style={styles.suggestionItem}
                      onPress={() => { setCity(p.description); setCityPlaceId(p.placeId); setCitySuggestions([]); }}
                    >
                      <Text style={styles.suggestionText}>{p.description}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            

            <View style={[styles.inputGroup, isNeighborhoodOpen ? styles.inputGroupRaised : null]}>
              <Text style={styles.label}>שכונה</Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  styles.selectButton,
                  !city ? { opacity: 0.6 } : null,
                ]}
                onPress={() => {
                  if (city && !isLoadingNeighborhoods) {
                    setIsNeighborhoodOpen(!isNeighborhoodOpen);
                  }
                }}
                disabled={!city || isLoading}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    !neighborhood && styles.selectButtonPlaceholder,
                  ]}
                >
                  {neighborhood ||
                    (isLoadingNeighborhoods
                      ? 'טוען שכונות...'
                      : neighborhoodOptions.length > 0
                      ? 'בחר שכונה'
                      : city
                      ? 'אין שכונות זמינות'
                      : 'בחר עיר קודם')}
                </Text>
                <Text style={styles.selectButtonArrow}>▼</Text>
              </TouchableOpacity>
              {isNeighborhoodOpen && neighborhoodOptions.length > 0 ? (
                <View style={styles.suggestionsBox}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="חפש שכונה..."
                    placeholderTextColor="#9AA0A6"
                    value={neighborhoodSearchQuery}
                    onChangeText={setNeighborhoodSearchQuery}
                    autoFocus
                  />
                  <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                    {(neighborhoodSearchQuery
                      ? neighborhoodOptions.filter((n) =>
                          n.toLowerCase().includes(neighborhoodSearchQuery.toLowerCase())
                        )
                      : neighborhoodOptions
                    )
                      .slice(0, 100)
                      .map((name) => (
                        <TouchableOpacity
                          key={name}
                          style={styles.suggestionItem}
                          onPress={() => {
                            setNeighborhood(name);
                            setIsNeighborhoodOpen(false);
                            setNeighborhoodSearchQuery('');
                          }}
                        >
                          <Text style={styles.suggestionText}>{name}</Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>

            <View style={[styles.inputGroup, addressSuggestions.length > 0 ? styles.inputGroupRaised : null]}>
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
              {addressSuggestions.length > 0 ? (
                <View style={styles.suggestionsBox}>
                  {addressSuggestions.map((desc) => (
                    <TouchableOpacity
                      key={desc}
                      style={styles.suggestionItem}
                      onPress={() => { setAddress(desc); setAddressSuggestions([]); }}
                    >
                      <Text style={styles.suggestionText}>{desc}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
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

            <View style={[styles.inputGroup, styles.switchRow]}>
              <Text style={styles.label}>האם אתה שותף בדירה?</Text>
              <Switch
                value={includeAsPartner}
                onValueChange={setIncludeAsPartner}
                disabled={isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>תמונות הדירה</Text>
              <View style={styles.galleryHeader}>
              <Text style={styles.galleryHint}>עד 12 תמונות</Text>
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
    backgroundColor: '#0F0F14',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    // Give room for the floating notifications button so it won't overlap the title
    paddingTop: 52,
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
  inputGroupRaised: {
    zIndex: 1000,
    elevation: 16,
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
  suggestionsBox: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 1000,
    marginTop: 6,
    backgroundColor: '#17171F',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A37',
    overflow: 'hidden',
    maxHeight: 220,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A37',
  },
  suggestionText: {
    color: '#E5E7EB',
    fontSize: 14,
    textAlign: 'right',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectButtonText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  selectButtonPlaceholder: {
    color: '#9AA0A6',
  },
  selectButtonArrow: {
    color: '#9AA0A6',
    fontSize: 12,
    marginLeft: 8,
  },
  searchInput: {
    backgroundColor: '#1B1B28',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2A2A37',
    color: '#FFFFFF',
    textAlign: 'right',
    marginBottom: 8,
    marginHorizontal: 8,
    marginTop: 8,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
});
