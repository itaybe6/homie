import { useEffect, useMemo, useRef, useState } from 'react';
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
import MapboxMap from '@/components/MapboxMap';
import type { MapboxFeatureCollection } from '@/lib/mapboxHtml';
import { autocompleteMapbox, reverseGeocodeMapbox, type MapboxGeocodingFeature } from '@/lib/mapboxAutocomplete';
import {
  Accessibility,
  Snowflake,
  Fence,
  Sun,
  Sofa,
  Shield,
  Hammer,
  PawPrint,
  ArrowUpDown,
  Utensils,
  Users,
} from 'lucide-react-native';


export default function AddApartmentScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const addApartment = useApartmentStore((state) => state.addApartment);
  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string | undefined;
  const mapboxStyleUrl = process.env.EXPO_PUBLIC_MAPBOX_STYLE_URL as string | undefined;

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
  const [citySuggestions, setCitySuggestions] = useState<MapboxGeocodingFeature[]>([]);
  const [addressSuggestions, setAddressSuggestions] = useState<MapboxGeocodingFeature[]>([]);
  const [selectedGeo, setSelectedGeo] = useState<{ lng: number; lat: number } | null>(null);
  const [isResolvingNeighborhood, setIsResolvingNeighborhood] = useState(false);
  const [selectedCity, setSelectedCity] = useState<{
    name: string;
    center?: { lng: number; lat: number };
    bbox?: [number, number, number, number];
  } | null>(null);
  const [includeAsPartner, setIncludeAsPartner] = useState(false);
  const [roommateCapacity, setRoommateCapacity] = useState<number | null>(null);
  const [isRoommateDropdownOpen, setIsRoommateDropdownOpen] = useState(false);
  const roommateCapacityOptions = [2, 3, 4, 5];
  const [isBalconyDropdownOpen, setIsBalconyDropdownOpen] = useState(false);
  const balconyOptions: Array<0 | 1 | 2 | 3> = [0, 1, 2, 3];

  // Property features (מאפייני הנכס)
  const [balconyCount, setBalconyCount] = useState<0 | 1 | 2 | 3>(0);
  const [wheelchairAccessible, setWheelchairAccessible] = useState(false);
  const [hasAirConditioning, setHasAirConditioning] = useState(false);
  const [hasBars, setHasBars] = useState(false);
  const [hasSolarHeater, setHasSolarHeater] = useState(false);
  const [isFurnished, setIsFurnished] = useState(false);
  const [hasSafeRoom, setHasSafeRoom] = useState(false);
  const [isRenovated, setIsRenovated] = useState(false);
  const [petsAllowed, setPetsAllowed] = useState(false);
  const [hasElevator, setHasElevator] = useState(false);
  const [kosherKitchen, setKosherKitchen] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async () => {
      const q = city.trim();
      if (!mapboxToken) {
        if (active) setCitySuggestions([]);
        return;
      }
      if (!q || q.length < 1) {
        if (active) setCitySuggestions([]);
        return;
      }
      const t = setTimeout(async () => {
        const results = await autocompleteMapbox({
          accessToken: mapboxToken,
          query: q,
          country: 'il',
          language: 'he',
          limit: 8,
          types: 'place,locality',
        });
        if (active) setCitySuggestions(results);
      }, 250);
      return () => clearTimeout(t);
    };
    let cleanup: undefined | (() => void);
    (async () => {
      cleanup = await run();
    })();
    return () => {
      active = false;
      cleanup?.();
    };
  }, [city, mapboxToken]);

  // If user edits the city after selecting a city, invalidate the selection (so address search won't be "wrong city")
  useEffect(() => {
    const c = city.trim();
    if (!selectedCity) return;
    if (c && c === selectedCity.name) return;
    // user changed city text -> require re-selecting city from suggestions
    setSelectedCity(null);
    setSelectedGeo(null);
    setAddress('');
    setNeighborhood('');
    setAddressSuggestions([]);
  }, [city]); // intentionally not depending on selectedCity to keep logic simple

  useEffect(() => {
    let active = true;
    const run = async () => {
      const q = address.trim();
      if (!mapboxToken) {
        if (active) setAddressSuggestions([]);
        return;
      }
      // enforce flow: must pick city (from suggestions) before searching address
      if (!selectedCity || !selectedCity.name.trim()) {
        if (active) setAddressSuggestions([]);
        return;
      }
      if (!q || q.length < 2) {
        if (active) setAddressSuggestions([]);
        return;
      }
      const cityPart = city.trim();
      const query = cityPart ? `${q}, ${cityPart}` : q;
      const t = setTimeout(async () => {
        const results = await autocompleteMapbox({
          accessToken: mapboxToken,
          query,
          country: 'il',
          language: 'he',
          limit: 8,
          types: 'address',
          bbox: selectedCity.bbox,
          proximity: selectedCity.center,
        });
        if (active) setAddressSuggestions(results);
      }, 320);
      return () => clearTimeout(t);
    };
    let cleanup: undefined | (() => void);
    (async () => {
      cleanup = await run();
    })();
    return () => {
      active = false;
      cleanup?.();
    };
  }, [address, city, mapboxToken]);

  const closeOverlays = () => {
    setCitySuggestions([]);
    setAddressSuggestions([]);
    setIsRoommateDropdownOpen(false);
    setIsBalconyDropdownOpen(false);
  };

  function ctxText(feature: MapboxGeocodingFeature, prefix: string): string {
    const ctx = feature?.context || [];
    const hit = ctx.find((c) => String(c?.id || '').startsWith(prefix));
    return String(hit?.text || '').trim();
  }

  const neighborhoodReqIdRef = useRef(0);

  function ctxTextFromFeatures(features: MapboxGeocodingFeature[], prefix: string): string {
    for (const f of features || []) {
      const t = ctxText(f, prefix);
      if (t) return t;
    }
    return '';
  }

  const previewPoints = useMemo<MapboxFeatureCollection | undefined>(() => {
    if (!selectedGeo) return { type: 'FeatureCollection', features: [] };
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [selectedGeo.lng, selectedGeo.lat] },
          properties: { id: 'preview', title: 'מיקום הדירה' },
        },
      ],
    };
  }, [selectedGeo]);

  const goToStep = (next: Step) => {
    closeOverlays();
    setError('');
    setStep(next);
  };

  const validateCurrentStep = (): boolean => {
    // Close overlays so the UI doesn't get stuck with an open dropdown
    closeOverlays();

    if (step === 1) {
      if (!city.trim() || !selectedCity) {
        setError('אנא בחר/י עיר מהרשימה');
        return false;
      }
      if (!address.trim()) {
        setError('אנא מלא/י כתובת');
        return false;
      }
      if (![0, 1, 2, 3].includes(balconyCount)) {
        setError('מספר מרפסות לא תקין');
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

          // Property features
          balcony_count: balconyCount,
          wheelchair_accessible: wheelchairAccessible,
          has_air_conditioning: hasAirConditioning,
          has_bars: hasBars,
          has_solar_heater: hasSolarHeater,
          is_furnished: isFurnished,
          has_safe_room: hasSafeRoom,
          is_renovated: isRenovated,
          pets_allowed: petsAllowed,
          has_elevator: hasElevator,
          kosher_kitchen: kosherKitchen,
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
                    onChangeText={(t) => {
                      setCity(t);
                    }}
                    editable={!isLoading}
                    placeholderTextColor="#9AA0A6"
                  />
                  {citySuggestions.length > 0 ? (
                    <View style={styles.suggestionsBox}>
                      {citySuggestions.map((f) => (
                        <TouchableOpacity
                          key={f.id}
                          style={styles.suggestionItem}
                          onPress={() => {
                            setCity(f.text);
                            setCitySuggestions([]);
                            const center = Array.isArray(f.center) && f.center.length === 2 ? { lng: f.center[0], lat: f.center[1] } : undefined;
                            setSelectedCity({
                              name: f.text,
                              center,
                              bbox: f.bbox,
                            });
                            // reset address flow when changing city
                            setAddress('');
                            setNeighborhood('');
                            setSelectedGeo(center ?? null);
                          }}
                        >
                          <Text style={styles.suggestionText}>{f.place_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={[styles.inputGroup, addressSuggestions.length > 0 ? styles.inputGroupRaised : null]}>
                  <Text style={styles.label}>
                    כתובת <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={selectedCity ? 'רחוב ומספר בית' : 'בחר/י עיר קודם'}
                    value={address}
                    onChangeText={(t) => {
                      setAddress(t);
                      // neighborhood is derived from selected address; clear while typing
                      if (neighborhood) setNeighborhood('');
                    }}
                    editable={!isLoading && !!selectedCity}
                    placeholderTextColor="#9AA0A6"
                  />
                  {addressSuggestions.length > 0 ? (
                    <View style={styles.suggestionsBox}>
                      {addressSuggestions.map((f) => (
                        <TouchableOpacity
                          key={f.id}
                          style={styles.suggestionItem}
                          onPress={() => {
                            const street = String(f.text || '').trim();
                            const house = String(f.address || '').trim();
                            const nextAddress = `${street}${house ? ` ${house}` : ''}`.trim();

                            setAddress(nextAddress || street || address);
                            setAddressSuggestions([]);

                            // neighborhood derived from the address selection (auto)
                            const inferredNeighborhood = ctxText(f, 'neighborhood.');
                            if (inferredNeighborhood) setNeighborhood(inferredNeighborhood);

                            if (Array.isArray(f.center) && f.center.length === 2) {
                              const geo = { lng: f.center[0], lat: f.center[1] };
                              setSelectedGeo(geo);

                              // Fallback: Mapbox autocomplete doesn't always include neighborhood.
                              // Do a reverse lookup to fetch neighborhood for the selected point.
                              if (!inferredNeighborhood && mapboxToken) {
                                const reqId = ++neighborhoodReqIdRef.current;
                                setIsResolvingNeighborhood(true);
                                setNeighborhood('');
                                reverseGeocodeMapbox({
                                  accessToken: mapboxToken,
                                  lng: geo.lng,
                                  lat: geo.lat,
                                  country: 'il',
                                  language: 'he',
                                  // Important: don't filter types here. The "address" result usually contains the full context
                                  // (including neighborhood/locality/district). Filtering types can remove this context.
                                  limit: 5,
                                })
                                  .then((rev) => {
                                    if (neighborhoodReqIdRef.current !== reqId) return;
                                    const bestNeighborhood =
                                      // Prefer context from the top result (often address) first
                                      ctxTextFromFeatures(rev, 'neighborhood.') ||
                                      ctxTextFromFeatures(rev, 'locality.') ||
                                      ctxTextFromFeatures(rev, 'district.') ||
                                      // fallback to feature texts by place_type
                                      rev.find((x) => (x.place_type || []).includes('neighborhood'))?.text ||
                                      rev.find((x) => (x.place_type || []).includes('locality'))?.text ||
                                      rev.find((x) => (x.place_type || []).includes('district'))?.text ||
                                      '';
                                    if (bestNeighborhood) setNeighborhood(bestNeighborhood);
                                  })
                                  .catch(() => {
                                    // ignore
                                  })
                                  .finally(() => {
                                    if (neighborhoodReqIdRef.current !== reqId) return;
                                    setIsResolvingNeighborhood(false);
                                  });
                              }
                            }
                          }}
                        >
                          <Text style={styles.suggestionText}>{f.place_name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>שכונה (אוטומטי)</Text>
                  <TextInput
                    style={[styles.input, !neighborhood ? styles.autoFieldEmpty : null]}
                    placeholder={isResolvingNeighborhood ? 'מאתר שכונה...' : 'ייבחר אוטומטית אחרי בחירת כתובת'}
                    value={neighborhood}
                    editable={false}
                    placeholderTextColor="#9AA0A6"
                  />
                </View>

                <View style={styles.mapPreviewCard}>
                  <View style={styles.mapPreviewHeader}>
                    <Text style={styles.mapPreviewTitle}>תצוגה על המפה</Text>
                    {!mapboxToken ? (
                      <Text style={styles.mapPreviewHint}>חסר EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN</Text>
                    ) : !selectedGeo ? (
                      <Text style={styles.mapPreviewHint}>בחר/י כתובת כדי לראות נקודה על המפה</Text>
                    ) : null}
                  </View>
                  <View style={styles.mapPreviewBody}>
                    <MapboxMap
                      accessToken={mapboxToken}
                      styleUrl={mapboxStyleUrl}
                      center={selectedGeo ? ([selectedGeo.lng, selectedGeo.lat] as const) : undefined}
                      zoom={selectedGeo ? 15 : 11}
                      points={previewPoints}
                    />
                  </View>
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

                {/* Property features */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>מאפייני הנכס</Text>

                  <View style={styles.featuresGrid}>
                    {(
                      [
                        {
                          key: 'wheelchairAccessible',
                          label: 'גישה לנכים',
                          Icon: Accessibility,
                          value: wheelchairAccessible,
                          set: setWheelchairAccessible,
                        },
                        {
                          key: 'hasAirConditioning',
                          label: 'מיזוג',
                          Icon: Snowflake,
                          value: hasAirConditioning,
                          set: setHasAirConditioning,
                        },
                        {
                          key: 'hasBars',
                          label: 'סורגים',
                          Icon: Fence,
                          value: hasBars,
                          set: setHasBars,
                        },
                        {
                          key: 'hasSolarHeater',
                          label: 'דוד שמש',
                          Icon: Sun,
                          value: hasSolarHeater,
                          set: setHasSolarHeater,
                        },
                        {
                          key: 'isFurnished',
                          label: 'ריהוט',
                          Icon: Sofa,
                          value: isFurnished,
                          set: setIsFurnished,
                        },
                        {
                          key: 'hasSafeRoom',
                          label: 'ממ"ד',
                          Icon: Shield,
                          value: hasSafeRoom,
                          set: setHasSafeRoom,
                        },
                        {
                          key: 'isRenovated',
                          label: 'משופצת',
                          Icon: Hammer,
                          value: isRenovated,
                          set: setIsRenovated,
                        },
                        {
                          key: 'petsAllowed',
                          label: 'חיות מחמד',
                          Icon: PawPrint,
                          value: petsAllowed,
                          set: setPetsAllowed,
                        },
                        {
                          key: 'hasElevator',
                          label: 'מעלית',
                          Icon: ArrowUpDown,
                          value: hasElevator,
                          set: setHasElevator,
                        },
                        {
                          key: 'kosherKitchen',
                          label: 'מטבח כשר',
                          Icon: Utensils,
                          value: kosherKitchen,
                          set: setKosherKitchen,
                        },
                      ] as const
                    ).map((item) => {
                      const active = item.value;
                      const Icon = item.Icon;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          style={[styles.featureCard, active ? styles.featureCardActive : null]}
                          onPress={() => item.set(!item.value)}
                          activeOpacity={0.85}
                          disabled={isLoading}
                        >
                          <Icon size={18} color={active ? '#4C1D95' : '#6B7280'} />
                          <Text
                            style={[
                              styles.featureText,
                              active ? styles.featureTextActive : null,
                            ]}
                            numberOfLines={1}
                          >
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
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

                <View style={[styles.inputGroup, isBalconyDropdownOpen ? styles.inputGroupRaised : null]}>
                  <Text style={styles.label}>מרפסות</Text>
                  <TouchableOpacity
                    style={[styles.input, styles.selectButton]}
                    onPress={() => setIsBalconyDropdownOpen((prev) => !prev)}
                    disabled={isLoading}
                  >
                    <Text
                      style={styles.selectButtonText}
                    >
                      {balconyCount === 0 ? 'ללא מרפסת' : `${balconyCount} מרפסות`}
                    </Text>
                    <Text style={styles.selectButtonArrow}>▼</Text>
                  </TouchableOpacity>
                  {isBalconyDropdownOpen ? (
                    <View style={styles.suggestionsBox}>
                      {balconyOptions.map((value) => (
                        <TouchableOpacity
                          key={value}
                          style={styles.suggestionItem}
                          onPress={() => {
                            setBalconyCount(value);
                            setIsBalconyDropdownOpen(false);
                          }}
                        >
                          <Text style={styles.suggestionText}>
                            {value === 0 ? 'ללא מרפסת' : `${value} מרפסות`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
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
  mapPreviewCard: {
    marginTop: 10,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  mapPreviewHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
  },
  mapPreviewTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'right',
  },
  mapPreviewHint: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textAlign: 'right',
  },
  mapPreviewBody: {
    height: 210,
    backgroundColor: '#FFFFFF',
  },
  autoFieldEmpty: {
    backgroundColor: '#FAFAFA',
    color: '#6B7280',
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

  section: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1ECFF',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
  },
  chipsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  chip: {
    borderWidth: 1,
    borderColor: '#E7E2F5',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: 'rgba(76, 29, 149, 0.10)',
    borderColor: '#4C1D95',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  chipTextActive: {
    color: '#4C1D95',
  },
  featuresGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  featureCard: {
    width: '48%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E7E2F5',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  featureCardActive: {
    backgroundColor: 'rgba(76, 29, 149, 0.08)',
    borderColor: 'rgba(76, 29, 149, 0.55)',
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  featureTextActive: {
    color: '#4C1D95',
  },
});
