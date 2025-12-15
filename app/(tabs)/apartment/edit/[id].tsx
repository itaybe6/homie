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
import { ArrowLeft } from 'lucide-react-native';
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
} from 'lucide-react-native';
import * as ImageManipulator from 'expo-image-manipulator';

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
  const [members, setMembers] = useState<any[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Property features (מאפייני הנכס)
  const [balconyCount, setBalconyCount] = useState<0 | 1 | 2 | 3>(0);
  const [isBalconyDropdownOpen, setIsBalconyDropdownOpen] = useState(false);
  const balconyOptions: Array<0 | 1 | 2 | 3> = [0, 1, 2, 3];
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

      // Property features
      const bc =
        typeof (apt as any)?.balcony_count === 'number'
          ? Math.max(0, Math.min(3, (apt as any).balcony_count as number))
          : 0;
      setBalconyCount(bc as 0 | 1 | 2 | 3);
      setWheelchairAccessible(!!(apt as any)?.wheelchair_accessible);
      setHasAirConditioning(!!(apt as any)?.has_air_conditioning);
      setHasBars(!!(apt as any)?.has_bars);
      setHasSolarHeater(!!(apt as any)?.has_solar_heater);
      setIsFurnished(!!(apt as any)?.is_furnished);
      setHasSafeRoom(!!(apt as any)?.has_safe_room);
      setIsRenovated(!!(apt as any)?.is_renovated);
      setPetsAllowed(!!(apt as any)?.pets_allowed);
      setHasElevator(!!(apt as any)?.has_elevator);
      setKosherKitchen(!!(apt as any)?.kosher_kitchen);

      const existing = normalizeImages((apt as any).image_urls);
      setImages(existing.map((u) => ({ uri: u, isLocal: false })));

			// Load current partners
			const partnerIds = (apt as any)?.partner_ids as string[] | undefined;
			if (partnerIds && partnerIds.length > 0) {
				const { data: usersData, error: usersErr } = await supabase
					.from('users')
					.select('id, full_name, avatar_url')
					.in('id', partnerIds);
				if (!usersErr) {
					setMembers(usersData || []);
				}
			} else {
				setMembers([]);
			}
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

  const handleRemovePartner = async (partnerId: string) => {
    if (!apartment) return;
    if (partnerId === apartment.owner_id) {
      Alert.alert('שגיאה', 'לא ניתן להסיר את בעל הדירה');
      return;
    }
    setRemovingId(partnerId);
    try {
      const currentPartnerIds: string[] = Array.isArray((apartment as any).partner_ids)
        ? ((apartment as any).partner_ids as string[])
        : [];
      const newPartnerIds = currentPartnerIds.filter((pid) => pid !== partnerId);
      const { error: updateErr } = await supabase
        .from('apartments')
        .update({ partner_ids: newPartnerIds })
        .eq('id', apartment.id);
      if (updateErr) throw updateErr;

      setMembers((prev) => prev.filter((m) => m.id !== partnerId));
      setApartment((prev) => (prev ? ({ ...(prev as any), partner_ids: newPartnerIds } as Apartment) : prev));
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן להסיר את השותף');
    } finally {
      setRemovingId(null);
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
        <ActivityIndicator size="large" color="#4C1D95" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerRow}>
            <View />
            <TouchableOpacity style={styles.backBtn} onPress={handleCancel} disabled={isSaving} activeOpacity={0.85}>
              <ArrowLeft size={18} color="#4C1D95" />
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

              {/* Property features */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>מאפייני הנכס</Text>

                <View style={[styles.inputGroup, isBalconyDropdownOpen ? styles.inputGroupRaised : null]}>
                  <Text style={styles.label}>מרפסות</Text>
                  <TouchableOpacity
                    style={[styles.input, styles.selectButton]}
                    onPress={() => setIsBalconyDropdownOpen((prev) => !prev)}
                    disabled={isSaving}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.selectButtonText}>
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
                          disabled={isSaving}
                        >
                          <Text style={styles.suggestionText}>
                            {value === 0 ? 'ללא מרפסת' : `${value} מרפסות`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>

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
                        label: 'ממ״ד',
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
                    const Icon = item.Icon as any;
                    return (
                      <TouchableOpacity
                        key={item.key}
                        style={[styles.featureCard, active ? styles.featureCardActive : null]}
                        onPress={() => item.set(!item.value)}
                        activeOpacity={0.85}
                        disabled={isSaving}
                      >
                        <Icon size={18} color={active ? '#4C1D95' : '#6B7280'} />
                        <Text
                          style={[styles.featureText, active ? styles.featureTextActive : null]}
                          numberOfLines={1}
                        >
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
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

              {/* Partners management */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>שותפים בדירה</Text>
                {(members || []).length ? (
                  <View style={{ gap: 10 }}>
                    {members.map((m) => (
                      <View key={m.id} style={styles.memberRow}>
                        <View style={styles.memberLeft}>
                          <Image
                            source={{ uri: m.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                            style={styles.memberAvatar}
                          />
                          <Text style={styles.memberName} numberOfLines={1}>
                            {m.full_name || 'משתמש'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.removeBtn, (removingId === m.id || m.id === apartment?.owner_id) && { opacity: 0.6 }]}
                          disabled={removingId === m.id || m.id === apartment?.owner_id || isSaving}
                          activeOpacity={0.85}
                          onPress={() => handleRemovePartner(m.id)}
                        >
                          <Text style={styles.removeBtnText}>{removingId === m.id ? 'מסיר...' : 'הסר'}</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.galleryHint}>אין שותפים משויכים</Text>
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
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 30,
    paddingTop: 16,
    paddingBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E2F5',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
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
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  section: {
    marginTop: 4,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'right',
    marginTop: 6,
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
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  selectButtonArrow: {
    color: '#6B7280',
    fontSize: 12,
    marginLeft: 8,
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
  featuresGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 4,
  },
  featureCard: {
    width: '48%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7E2F5',
    marginBottom: 12,
  },
  featureCardActive: {
    backgroundColor: 'rgba(76,29,149,0.06)',
    borderColor: 'rgba(76,29,149,0.35)',
  },
  featureText: {
    flex: 1,
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  featureTextActive: {
    color: '#4C1D95',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
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
    color: '#9DA4AE',
    fontSize: 13,
  },
  memberRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E2F5',
    borderRadius: 12,
    padding: 12,
  },
  memberLeft: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    paddingLeft: 10,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  memberName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
    textAlign: 'right',
  },
  removeBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  removeBtnText: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '800',
  },
});


