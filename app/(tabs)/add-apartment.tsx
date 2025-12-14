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
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { autocompleteAddresses, createSessionToken } from '@/lib/googlePlaces';
import { getNeighborhoodsForCityName, searchCitiesWithNeighborhoods } from '@/lib/neighborhoods';


export default function AddApartmentScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const addApartment = useApartmentStore((state) => state.addApartment);

  const TOTAL_STEPS = 4 as const;
  type Step = 1 | 2 | 3 | 4;
  const STEP_LABELS = ['מיקום', 'פרטים', 'חדרים', 'תמונות'] as const;
  const [step, setStep] = useState<Step>(1);

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
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [addressSuggestions, setAddressSuggestions] = useState<string[]>([]);
  const [neighborhoodOptions, setNeighborhoodOptions] = useState<string[]>([]);
  const [isNeighborhoodOpen, setIsNeighborhoodOpen] = useState(false);
  const [neighborhoodSearchQuery, setNeighborhoodSearchQuery] = useState('');
  const [isLoadingNeighborhoods, setIsLoadingNeighborhoods] = useState(false);
  const [includeAsPartner, setIncludeAsPartner] = useState(false);
  const [roommateCapacity, setRoommateCapacity] = useState<number | null>(null);
  const [isRoommateDropdownOpen, setIsRoommateDropdownOpen] = useState(false);
  const roommateCapacityOptions = [2, 3, 4, 5];

  useEffect(() => {
    setSessionToken(createSessionToken());
  }, []);

  useEffect(() => {
    let active = true;
    const run = () => {
      const q = city.trim();
      if (!q || q.length < 1) { setCitySuggestions([]); return; }
      const names = searchCitiesWithNeighborhoods(q, 8);
      if (active) setCitySuggestions(names);
    };
    run();
    return () => { active = false; };
  }, [city]);

  // Load neighborhoods list for selected city from static data (dropdown)
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const key = (city || '').trim();
      if (!key) {
        setNeighborhoodOptions([]);
        setIsLoadingNeighborhoods(false);
        return;
      }
      setIsLoadingNeighborhoods(true);
      try {
        const list = getNeighborhoodsForCityName(key);
        if (!cancelled) {
          setNeighborhoodOptions(list);
          setIsLoadingNeighborhoods(false);
        }
      } catch {
        if (!cancelled) {
          setNeighborhoodOptions([]);
          setIsLoadingNeighborhoods(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [city]);

  // Removed Google neighborhood autocomplete in favor of static dropdown search

  useEffect(() => {
    let active = true;
    const run = async () => {
      const q = address.trim();
      if (!q || q.length < 2) { setAddressSuggestions([]); return; }
      const preds = await autocompleteAddresses(q, null, sessionToken, city);
      if (active) setAddressSuggestions(preds.slice(0, 8));
    };
    run();
    return () => { active = false; };
  }, [address, sessionToken, city]);

  const closeOverlays = () => {
    setCitySuggestions([]);
    setAddressSuggestions([]);
    setIsNeighborhoodOpen(false);
    setNeighborhoodSearchQuery('');
    setIsRoommateDropdownOpen(false);
  };

  const goToStep = (next: Step) => {
    closeOverlays();
    setError('');
    setStep(next);
  };

  const validateCurrentStep = (): boolean => {
    // Close overlays so the UI doesn't get stuck with an open dropdown
    closeOverlays();

    if (step === 1) {
      if (!city.trim()) {
        setError('אנא בחר/י עיר');
        return false;
      }
      if (!address.trim()) {
        setError('אנא מלא/י כתובת');
        return false;
      }
      return true;
    }

    if (step === 2) {
      if (!title.trim()) {
        setError('אנא מלא/י כותרת');
        return false;
      }
      if (!price.trim()) {
        setError('אנא מלא/י מחיר');
        return false;
      }
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum <= 0) {
        setError('מחיר לא תקין');
        return false;
      }
      return true;
    }

    if (step === 3) {
      if (!bathrooms.trim()) {
        setError('אנא מלא/י מספר חדרי אמבטיה');
        return false;
      }
      if (!bedrooms.trim()) {
        setError('אנא מלא/י מספר חדרי שינה');
        return false;
      }
      const bedroomsNum = parseInt(bedrooms);
      const bathroomsNum = parseInt(bathrooms);
      if (isNaN(bedroomsNum) || bedroomsNum <= 0) {
        setError('מספר חדרי שינה לא תקין');
        return false;
      }
      if (isNaN(bathroomsNum) || bathroomsNum <= 0) {
        setError('מספר חדרי אמבטיה לא תקין');
        return false;
      }
      if (roommateCapacity === null) {
        setError('אנא בחר/י כמות שותפים מתאימה');
        return false;
      }
      if (!roommateCapacityOptions.includes(roommateCapacity)) {
        setError('בחירת כמות השותפים אינה תקפה');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (isLoading) return;
    if (!validateCurrentStep()) return;
    if (step < TOTAL_STEPS) {
      goToStep((step + 1) as Step);
    }
  };

  const handlePrev = () => {
    if (isLoading) return;
    if (step > 1) {
      goToStep((step - 1) as Step);
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

  const normalizeImageForUpload = async (
    sourceUri: string,
  ): Promise<{ uri: string; ext: string; mime: string }> => {
    const MAX_WIDTH = 1200; // Maximum width for uploaded images (height scales proportionally)
    const COMPRESSION_QUALITY = 0.8; // Compression quality (0-1)

    try {
      // First, get image info to check if resizing is needed
      const imageInfo = await ImageManipulator.manipulateAsync(sourceUri, []);
      
      // Only resize if image is larger than max width
      const actions: ImageManipulator.Action[] = [];
      if (imageInfo.width > MAX_WIDTH) {
        actions.push({ resize: { width: MAX_WIDTH } });
      }

      // Compress the image (with or without resize)
      const compressed = await ImageManipulator.manipulateAsync(
        sourceUri,
        actions,
        { compress: COMPRESSION_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
      );
      return { uri: compressed.uri, ext: 'jpg', mime: 'image/jpeg' };
    } catch (err) {
      console.warn('Failed to compress image', err);
      throw new Error('לא הצלחנו לעבד את התמונה, נסה שוב');
    }
  };

  const uploadImage = async (userId: string, uri: string): Promise<string> => {
    const normalized = await normalizeImageForUpload(uri);
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${normalized.ext}`;
    const path = `apartments/${userId}/${fileName}`;
    const res = await fetch(normalized.uri);
    const arrayBuffer = await res.arrayBuffer();
    const { error: upErr } = await supabase
      .storage
      .from('apartment-images')
      .upload(path, arrayBuffer, { upsert: true, contentType: normalized.mime });
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
      !bathrooms ||
      roommateCapacity === null
    ) {
      setError('אנא מלא את כל השדות החובה');
      return;
    }

    const priceNum = parseFloat(price);
    const bedroomsNum = parseInt(bedrooms);
    const bathroomsNum = parseInt(bathrooms);
    const roommatesNum = roommateCapacity as number;

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

    if (!roommateCapacityOptions.includes(roommatesNum)) {
      setError('בחירת כמות השותפים אינה תקפה');
      return;
    }

    setIsLoading(true);
    setError('');
    setIsRoommateDropdownOpen(false);

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
          roommate_capacity: roommatesNum,
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.sheet}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <Text style={styles.title}>הוסף דירה חדשה</Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width:
                        TOTAL_STEPS <= 1
                          ? '100%'
                          : `${Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.stepLabelsRow}>
                {STEP_LABELS.map((lbl, idx) => {
                  const s = (idx + 1) as Step;
                  const isActive = s === step;
                  const isDone = s < step;
                  return (
                    <View key={lbl} style={styles.stepLabelWrap}>
                      <View
                        style={[
                          styles.stepDot,
                          isDone ? styles.stepDotDone : null,
                          isActive ? styles.stepDotActive : null,
                        ]}
                      />
                      <Text
                        style={[
                          styles.stepLabel,
                          isActive ? styles.stepLabelActive : null,
                          isDone ? styles.stepLabelDone : null,
                        ]}
                      >
                        {lbl}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.card}> 
            <View style={styles.form}>
            {step === 1 ? (
              <>
                <View style={[styles.inputGroup, citySuggestions.length > 0 ? styles.inputGroupRaised : null]}>
                  <Text style={styles.label}>
                    עיר <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="לדוגמה: תל אביב"
                    value={city}
                    onChangeText={(t) => { setCity(t); }}
                    editable={!isLoading}
                    placeholderTextColor="#9AA0A6"
                  />
                  {citySuggestions.length > 0 ? (
                    <View style={styles.suggestionsBox}>
                      {citySuggestions.map((name) => (
                        <TouchableOpacity
                          key={name}
                          style={styles.suggestionItem}
                          onPress={() => { setCity(name); setCitySuggestions([]); }}
                        >
                          <Text style={styles.suggestionText}>{name}</Text>
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
              </>
            ) : null}

            {step === 2 ? (
              <>
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
              </>
            ) : null}

            {step === 3 ? (
              <>
                <View style={styles.row}>
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
                </View>

                <View style={[styles.inputGroup, isRoommateDropdownOpen ? styles.inputGroupRaised : null]}>
                  <Text style={styles.label}>
                    מתאים לכמות שותפים <Text style={styles.required}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={[styles.input, styles.selectButton]}
                    onPress={() => setIsRoommateDropdownOpen((prev) => !prev)}
                    disabled={isLoading}
                  >
                    <Text
                      style={[
                        styles.selectButtonText,
                        roommateCapacity === null && styles.selectButtonPlaceholder,
                      ]}
                    >
                      {roommateCapacity !== null ? `${roommateCapacity} שותפים` : 'בחר מספר שותפים'}
                    </Text>
                    <Text style={styles.selectButtonArrow}>▼</Text>
                  </TouchableOpacity>
                  {isRoommateDropdownOpen ? (
                    <View style={styles.suggestionsBox}>
                      {roommateCapacityOptions.map((value) => (
                        <TouchableOpacity
                          key={value}
                          style={styles.suggestionItem}
                          onPress={() => {
                            setRoommateCapacity(value);
                            setIsRoommateDropdownOpen(false);
                          }}
                        >
                          <Text style={styles.suggestionText}>{`${value} שותפים`}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={[styles.inputGroup, styles.switchRow]}>
                  <Text style={[styles.label, styles.switchLabel]}>האם אתה שותף בדירה?</Text>
                  <Switch
                    value={includeAsPartner}
                    onValueChange={setIncludeAsPartner}
                    disabled={isLoading}
                    trackColor={{ false: '#D1D5DB', true: '#4C1D95' }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor="#D1D5DB"
                  />
                </View>
              </>
            ) : null}

            {step === 4 ? (
              <>
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
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.buttonText}>הוסף דירה</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : null}

            <View style={styles.navRow}>
              {step > 1 ? (
                <TouchableOpacity
                  style={[styles.navSecondaryButton, isLoading && styles.buttonDisabled]}
                  onPress={handlePrev}
                  disabled={isLoading}
                >
                  <Text style={styles.navSecondaryText}>הקודם</Text>
                </TouchableOpacity>
              ) : null}

              {step < TOTAL_STEPS ? (
                <View style={[styles.navPrimaryWrap, step === 1 ? { flex: 1 } : null]}>
                  <TouchableOpacity
                    style={[styles.navPrimaryButton, isLoading && styles.buttonDisabled]}
                    onPress={handleNext}
                    disabled={isLoading}
                  >
                    <Text style={styles.navPrimaryText}>הבא</Text>
                  </TouchableOpacity>
                  <Text style={styles.navStepText}>{`שלב ${step} מתוך ${TOTAL_STEPS}`}</Text>
                </View>
              ) : null}
            </View>
            </View>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // White behind the "sheet" so rounded top corners are visible under the global top bar
    backgroundColor: '#FFFFFF',
  },
  sheet: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    marginTop: 64, // a bit lower than the global top bar for nicer spacing
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 30,
    // Give room for the global top bar above the rounded sheet
    paddingTop: 16,
    paddingBottom: 28,
  },
  header: {
    marginBottom: 24,
    paddingTop: 15,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 6,
  },
  progressTrack: {
    flexDirection: 'row-reverse',
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: 6,
    backgroundColor: '#4C1D95',
    borderRadius: 999,
  },
  stepLabelsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#D1D5DB',
  },
  stepDotActive: {
    backgroundColor: '#4C1D95',
  },
  stepDotDone: {
    backgroundColor: '#8B5CF6',
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textAlign: 'right',
  },
  stepLabelActive: {
    color: '#4C1D95',
  },
  stepLabelDone: {
    color: '#111827',
  },
  backBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E2F5',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backBtnText: {
    color: '#4C1D95',
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7E2F5',
    padding: 16,
    shadowColor: '#111827',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
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
    color: '#3B3556',
    textAlign: 'right',
  },
  required: {
    color: '#F87171',
  },
  input: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E7E2F5',
    color: '#111827',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7E2F5',
    overflow: 'hidden',
    maxHeight: 220,
    shadowColor: '#111827',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1ECFF',
  },
  suggestionText: {
    color: '#111827',
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
    justifyContent: 'flex-end',
    gap: 12,
  },
  switchLabel: {
    flex: 1,
    textAlign: 'right',
  },
  halfWidth: {
    flex: 1,
  },
  button: {
    backgroundColor: '#4C1D95',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  resetButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E7E2F5',
  },
  resetButtonText: {
    color: '#4C1D95',
    fontSize: 16,
    fontWeight: '700',
  },
  navRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  navPrimaryWrap: {
    flex: 1,
    gap: 8,
    alignItems: 'center',
  },
  navPrimaryButton: {
    flex: 1,
    backgroundColor: '#4C1D95',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  navPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  navStepText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'center',
  },
  navSecondaryButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E7E2F5',
  },
  navSecondaryText: {
    color: '#4C1D95',
    fontSize: 16,
    fontWeight: '800',
  },
  error: {
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
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
    backgroundColor: '#4C1D95',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  addImagesBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  galleryHint: {
    color: '#6B7280',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E2F5',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    marginTop: 10,
  },
  galleryPlaceholderText: {
    color: '#6B7280',
    fontSize: 13,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectButtonText: {
    flex: 1,
    color: '#111827',
    fontSize: 16,
  },
  selectButtonPlaceholder: {
    color: '#9AA0A6',
  },
  selectButtonArrow: {
    color: '#6B7280',
    fontSize: 12,
    marginLeft: 8,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#E7E2F5',
    color: '#111827',
    textAlign: 'right',
    marginBottom: 8,
    marginHorizontal: 8,
    marginTop: 8,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
});
