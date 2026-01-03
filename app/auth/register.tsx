import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  InteractionManager,
  TouchableWithoutFeedback,
  Platform,
  ScrollView,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { usePendingSignupStore } from '@/stores/pendingSignupStore';
import { Home, Camera, Pencil, X, ChevronRight, Eye, EyeOff, Check } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { BlurView } from 'expo-blur';
import { supabase } from '@/lib/supabase';
import { autocompleteMapbox, type MapboxGeocodingFeature } from '@/lib/mapboxAutocomplete';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LavaLamp from '../../components/LavaLamp';
import KeyboardAwareScrollView from 'react-native-keyboard-aware-scroll-view/lib/KeyboardAwareScrollView';
import { KeyFabPanel } from '@/components/KeyFabPanel';

// App primary accent color (align with dark theme)
const PRIMARY = '#5e3f2d';
// Keep the auth background consistent with the login screen
const BG_DARK = '#2B1A12';

export default function RegisterScreen() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const setPending = usePendingSignupStore((s) => s.setPending);
  const insets = useSafeAreaInsets();
  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string | undefined;
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [city, setCity] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<MapboxGeocodingFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'user' | 'owner'>('user');
  // step 0: choose account type; step 1: fill form for chosen type
  const [step, setStep] = useState<0 | 1>(0);
  // formStep for renter: 0-basic, 1-profile (age/gender/bio), 2-avatar, 3-credentials
  // for owner: 0-basic, 1-credentials
  const [formStep, setFormStep] = useState<0 | 1 | 2 | 3>(0);
  const [segWidth, setSegWidth] = useState(0);
  const segAnim = useRef(new Animated.Value(0)).current;
  // Owner apartment details will be collected later in a dedicated screen
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  const [bio, setBio] = useState('');
  const [isGenderPickerOpen, setIsGenderPickerOpen] = useState(false);
  const [isAgePickerOpen, setIsAgePickerOpen] = useState(false);
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [emailAlreadyExists, setEmailAlreadyExists] = useState(false);
  const transitionTokenRef = useRef(0);

  // Autocomplete cities using Mapbox
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

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('נדרשת הרשאה לגישה לגלריה');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.length) {
        setAvatarUrl(result.assets[0].uri);
      }
    } catch (e: any) {
      setError(e.message || 'שגיאה בבחירת תמונה');
    }
  };

  const uploadAvatar = async (userId: string, uri: string) => {
    try {
      // Check image dimensions and only resize if larger than 800px
      const imageInfo = await ImageManipulator.manipulateAsync(uri, []);
      const actions: ImageManipulator.Action[] = [];
      if (imageInfo.width > 800) {
        actions.push({ resize: { width: 800 } });
      }
      // Compress the image
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        actions,
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      const fileName = `${userId}-${Date.now()}.jpg`;
      const filePath = `users/${userId}/${fileName}`;

      const res = await fetch(compressed.uri);
      const arrayBuffer = await res.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('user-images')
        .upload(filePath, arrayBuffer, {
          upsert: true,
          contentType: 'image/jpeg',
        });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('user-images').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (updateError) throw updateError;
    } catch (err) {
      // Non-blocking: ignore upload errors to not fail registration UX
    }
  };

  const handleRegister = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      setError('אנא מלא את כל השדות');
      return;
    }

    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    // Optional fields validation
    if (age && isNaN(Number(age))) {
      setError('גיל חייב להיות מספר');
      return;
    }

    setIsLoading(true);
    setError('');
    setEmailAlreadyExists(false);

    try {
      // IMPORTANT: OTP sign-up with shouldCreateUser=true behaves like login for existing emails.
      // Block early so "register" doesn't silently sign the user in.
      await authService.assertEmailAvailable(email);

      const trimmed = avatarUrl.trim();
      const isRemoteAvatar = /^https?:\/\//.test(trimmed);
      const safeAvatarUrl = isRemoteAvatar ? trimmed : undefined;
      const avatarLocalUri = !isRemoteAvatar && trimmed ? trimmed : undefined;
      const avatarForSignup = mode === 'user' ? safeAvatarUrl : undefined;

      // Store pending signup data locally (avoid passing secrets like password in the URL).
      const pendingRole = mode === 'owner' ? 'owner' : 'user';
      setPending({
        email: email.trim(),
        password,
        fullName,
        role: pendingRole,
        phone: mode === 'user' ? (phone.trim() || undefined) : undefined,
        age: age ? Number(age) : undefined,
        city: city.trim() || undefined,
        bio: mode === 'user' ? (bio.trim() || undefined) : undefined,
        gender: mode === 'user' && (gender === 'male' || gender === 'female') ? gender : undefined,
        avatarUrl: avatarForSignup,
        avatarLocalUri: mode === 'user' ? avatarLocalUri : undefined,
      });

      // Send 6-digit code email (requires Email OTP enabled in Supabase Auth settings).
      await authService.startEmailOtpSignUp({
        email: email.trim(),
        fullName,
        role: pendingRole,
        phone: mode === 'user' ? (phone.trim() || undefined) : undefined,
        age: age ? Number(age) : undefined,
        city: city.trim() || undefined,
        bio: mode === 'user' ? (bio.trim() || undefined) : undefined,
        gender: mode === 'user' && (gender === 'male' || gender === 'female') ? gender : undefined,
        avatarUrl: avatarForSignup,
      });

      router.push('/auth/verify-email' as any);
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      if (msg.includes('המייל כבר קיים')) {
        setEmailAlreadyExists(true);
        setError(msg);
      } else {
        setError(msg || 'שגיאה ברישום');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextFromBasic = () => {
    if (!fullName || !phone || !city) {
      setError('אנא מלא שם מלא, טלפון ועיר');
      return;
    }
    transitionToFormStep(1);
  };

  const handleNextFromProfile = () => {
    // No required fields here yet, but can be enforced later
    transitionToFormStep(2);
  };

  const handleNextFromAvatar = () => {
    transitionToFormStep(3);
  };

  const transitionToFormStep = (next: 0 | 1 | 2 | 3) => {
    // Avoid KeyboardAwareScrollView trying to scroll to a field that gets unmounted
    // during step transitions (common on Android / bridgeless UIManager).
    setError('');
    Keyboard.dismiss();
    const token = ++transitionTokenRef.current;
    InteractionManager.runAfterInteractions(() => {
      // If another transition started since we scheduled this one, ignore.
      if (transitionTokenRef.current !== token) return;
      setFormStep(next);
    });
  };

  return (
    <View style={styles.container}>
      {/* Animated “liquid glass” background */}
      <View pointerEvents="none" style={styles.bgWrap}>
        <LavaLamp hue="orange" intensity={60} count={5} duration={16000} backgroundColor={BG_DARK} />
      </View>
      {/* Back to login */}
      <TouchableOpacity
        onPress={() => {
          if (step === 1) {
            setError('');
            setFormStep(0);
            setStep(0);
          } else {
            router.replace('/auth/login');
          }
        }}
        accessibilityRole="button"
        accessibilityLabel="סגור"
        style={[styles.backBtn, { top: insets.top + 8 }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <X size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <KeyboardAwareScrollView
        enableOnAndroid
        extraScrollHeight={Platform.OS === 'ios' ? 16 : 24}
        keyboardOpeningTime={0}
        // Ensure autocomplete suggestions can be selected with a single tap while the keyboard is open.
        // "handled" still allows the first tap to dismiss the keyboard in some cases (esp. iOS).
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      <View style={{ flex: 1 }}>
        <View style={[styles.content, (step === 1 || step === 0) && styles.contentForSheet, step === 0 && styles.contentBottom]}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={[styles.header, step === 1 && { paddingTop: insets.top + 24, marginBottom: 24 }, step === 0 && styles.headerCentered]}>
            <Image
              source={require('../../assets/images/logo slog.png')}
              style={[styles.headerLogo, { marginTop: 0 }]}
              resizeMode="contain"
              accessible
              accessibilityLabel="Homie logo"
            />
          </View>
          </TouchableWithoutFeedback>

          {step === 0 ? (
            <View style={[styles.sheet, styles.sheetStep0]}>
              <View style={{ paddingBottom: insets.bottom + 28 }}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>בואו נתחיל מהתחלה</Text>
                  <Text style={styles.sheetIntro}>צרו חשבון חדש כדי למצוא שותף או לפרסם דירה.</Text>
                </View>
                {/* Step 0 - choose account type */}
                <View style={styles.stepChooser}>
                  <Text style={styles.stepChooserLabel}>בחרו סוג משתמש</Text>
                  <View style={styles.stepOptionsRow}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => setMode('user')}
                      style={[styles.optionCard, mode === 'user' && styles.optionCardActive]}
                      disabled={isLoading}
                    >
                      {mode !== 'user' ? (
                        <View pointerEvents="none" style={styles.glassWrap}>
                          <BlurView style={styles.glassBlur} intensity={25} tint="light" />
                          <View style={styles.glassTint} />
                        </View>
                      ) : null}
                      <View style={styles.optionContentRow}>
                        <View style={styles.optionTextWrap}>
                          <Text style={[styles.optionTitle, mode === 'user' && styles.optionTitleActive]}>שוכר</Text>
                          <Text style={[styles.optionSub, mode === 'user' && styles.optionSubActive]}>חיפוש שותפים/ות</Text>
                        </View>
                        {mode === 'user' ? (
                          <View style={styles.optionCheckBadge}>
                            <Check size={16} color="#FFFFFF" />
                          </View>
                        ) : <View style={{ width: 28 }} />}
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => setMode('owner')}
                      style={[styles.optionCard, mode === 'owner' && styles.optionCardActive]}
                      disabled={isLoading}
                    >
                      {mode !== 'owner' ? (
                        <View pointerEvents="none" style={styles.glassWrap}>
                          <BlurView style={styles.glassBlur} intensity={25} tint="light" />
                          <View style={styles.glassTint} />
                        </View>
                      ) : null}
                      <View style={styles.optionContentRow}>
                        <View style={styles.optionTextWrap}>
                          <Text style={[styles.optionTitle, mode === 'owner' && styles.optionTitleActive]}>בעל דירה</Text>
                          <Text style={[styles.optionSub, mode === 'owner' && styles.optionSubActive]}>פרסום דירה וחיפוש דיירים</Text>
                        </View>
                        {mode === 'owner' ? (
                          <View style={styles.optionCheckBadge}>
                            <Check size={16} color="#FFFFFF" />
                          </View>
                        ) : <View style={{ width: 28 }} />}
                      </View>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={[styles.button, isLoading && styles.buttonDisabled]}
                    onPress={() => setStep(1)}
                    disabled={isLoading}
                  >
                    {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>המשך</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}

          {/* Step 1 - form */}
          {step === 1 ? (
            <View style={[styles.sheet, styles.sheetLowered]}>
              <View style={{ paddingBottom: insets.bottom + 28 }}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>
                    {mode === 'user'
                      ? (formStep === 1
                        ? 'כמה פרטים כדי\nלהכיר אתכם טוב יותר'
                        : formStep === 2
                          ? 'תמונה טובה\nעושה הכל פשוט יותר'
                          : formStep === 3
                            ? 'רק עוד צעד קטן וסיימנו'
                            : 'בוא נמצא לכם\nמקום שמתאים באמת')
                      : (formStep === 0
                        ? 'בוא נעלה את הדירה שלכם\nעל המפה'
                        : 'נשאר רק צעד קטן')}
                  </Text>
                  {(mode === 'user' || (mode === 'owner' && (formStep === 0 || formStep === 1))) ? (
                    <Text style={styles.sheetIntro}>
                      {mode === 'user'
                        ? (formStep === 1
                          ? 'זה יעזור לנו להתאים לכם שותפים ודירות.'
                          : formStep === 2
                            ? 'זה עוזר לשותפים להכיר אתכם מהר יותר.'
                            : formStep === 3
                              ? 'ממלאים אימייל וסיסמה ויוצאים לדרך.'
                              : 'צרו חשבון ומצאו שותף או דירה שמתאימים לכם')
                        : (formStep === 0
                          ? 'כמה פרטים קטנים ונתחיל בתהליך'
                          : 'כמה פרטים אחרונים – ואתם מוכנים לפרסום.')}
                    </Text>
                  ) : null}
                  {/* Step indicator is shown below the primary button; not in header */}
                </View>
                {/* Removed account type switch link per request */}

            {formStep === 0 ? (
              <>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={styles.form}>
                  <View style={styles.cardPlain}>
                    <Text style={styles.label}>שם מלא</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="ישראל ישראלי"
                      value={fullName}
                      onChangeText={setFullName}
                      editable={!isLoading}
                      placeholderTextColor="#9DA4AE"
                    />
                    <Text style={styles.label}>טלפון</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="050-123-4567"
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      editable={!isLoading}
                      placeholderTextColor="#9DA4AE"
                    />
                    <Text style={styles.label}>עיר</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="תל אביב-יפו"
                      value={city}
                      onChangeText={(t) => { setCity(t); if (!t) setCitySuggestions([]); }}
                      editable={!isLoading}
                      placeholderTextColor="#9DA4AE"
                    />
                    {citySuggestions.length > 0 ? (
                      <View style={styles.suggestionsBox}>
                        {citySuggestions.map((f) => (
                          <TouchableOpacity
                            key={f.id}
                            style={styles.suggestionItem}
                            onPress={() => {
                              const nextCity = String(f.text || '').trim();
                              if (nextCity) setCity(nextCity);
                              setCitySuggestions([]);
                              Keyboard.dismiss();
                            }}
                          >
                            <Text style={styles.suggestionText}>{String(f.text || '').trim()}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={[styles.button, isLoading && styles.buttonDisabled]}
                    onPress={handleNextFromBasic}
                    disabled={isLoading}
                  >
                    {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>הבא</Text>}
                  </TouchableOpacity>
                  {formStep === 0 ? (
                    <Text style={[styles.sheetSubtitle, { marginTop: 8, textAlign: 'center' }]}>
                      {`שלב 1 מתוך ${mode === 'user' ? 4 : 2}`}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : mode === 'user' && formStep === 1 ? (
              <>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={styles.form}>
                  <View style={styles.cardPlain}>
                    <Text style={styles.label}>מגדר</Text>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        Keyboard.dismiss();
                        setIsGenderPickerOpen(true);
                      }}
                      style={styles.selectInput}
                      disabled={isLoading}
                    >
                      <Text style={[styles.selectText, !gender && styles.selectTextPlaceholder]}>
                        {gender === 'male' ? 'זכר' : gender === 'female' ? 'נקבה' : gender === 'other' ? 'אחר' : 'בחר/י מגדר'}
                      </Text>
                    </TouchableOpacity>

                    <Text style={styles.label}>גיל</Text>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => {
                        Keyboard.dismiss();
                        setIsAgePickerOpen(true);
                      }}
                      style={styles.selectInput}
                      disabled={isLoading}
                    >
                      <Text style={[styles.selectText, !age && styles.selectTextPlaceholder]}>
                        {age ? age : 'בחר/י גיל'}
                      </Text>
                    </TouchableOpacity>

                    <Text style={styles.label}>קצת עלייך</Text>
                    <TextInput
                      style={[styles.input, styles.inputMultiline]}
                      placeholder="כמה מילים עלייך..."
                      value={bio}
                      onChangeText={setBio}
                      multiline
                      editable={!isLoading}
                      placeholderTextColor="#9DA4AE"
                    />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <TouchableOpacity
                      style={[styles.button, isLoading && styles.buttonDisabled, { flex: 1 }]}
                      onPress={handleNextFromProfile}
                      disabled={isLoading}
                    >
                      {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>הבא</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="חזרה"
                      onPress={() => transitionToFormStep(0)}
                      style={styles.iconButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      disabled={isLoading}
                    >
                      <ChevronRight size={28} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.sheetSubtitle, { marginTop: 8, textAlign: 'center' }]}>{`שלב 2 מתוך 4`}</Text>
                </View>
              </>
            ) : mode === 'user' && formStep === 2 ? (
              <>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={styles.form}>
                  <View style={styles.cardPlain}>
                    <TouchableOpacity onPress={handlePickImage} activeOpacity={0.85} style={styles.avatarFrame}>
                      <View style={styles.avatarContainer}>
                        <View style={styles.avatarRing}>
                          {avatarUrl ? (
                            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                          ) : (
                            <View style={styles.avatarPlaceholder}>
                              <Camera size={28} color="#9CA3AF" />
                            </View>
                          )}
                          <View style={styles.avatarBadge}>
                            <Pencil size={14} color="#fff" />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <TouchableOpacity
                      style={[styles.button, isLoading && styles.buttonDisabled, { flex: 1 }]}
                      onPress={handleNextFromAvatar}
                      disabled={isLoading}
                    >
                      {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>הבא</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="חזרה"
                      onPress={() => transitionToFormStep(1)}
                      style={styles.iconButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      disabled={isLoading}
                    >
                      <ChevronRight size={28} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.sheetSubtitle, { marginTop: 8, textAlign: 'center' }]}>{`שלב 3 מתוך 4`}</Text>
                </View>
              </>
            ) : (
              <>
                {error ? (
                  emailAlreadyExists ? (
                    <View style={styles.emailExistsCard}>
                      <Text style={styles.emailExistsText}>{error}</Text>
                      <TouchableOpacity
                        style={[styles.emailExistsButton, isLoading && styles.emailExistsButtonDisabled]}
                        onPress={() => {
                          // Move user to login and prefill the email for convenience
                          router.replace({ pathname: '/auth/login', params: { email: email.trim() } } as any);
                        }}
                        disabled={isLoading}
                      >
                        <Text style={styles.emailExistsButtonText}>לעבור להתחברות</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.error}>{error}</Text>
                  )
                ) : null}
                <View style={styles.form}>
                  <View style={styles.cardPlain}>
                    <Text style={styles.label}>אימייל</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="name@example.com"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      editable={!isLoading}
                      placeholderTextColor="#9DA4AE"
                    />
                    <View style={styles.divider} />
                    <Text style={styles.label}>סיסמה</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        placeholder="הקלד סיסמה"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!isPasswordVisible}
                        editable={!isLoading}
                        placeholderTextColor="#9DA4AE"
                      />
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={isPasswordVisible ? 'הסתר סיסמה' : 'הצג סיסמה'}
                        onPress={() => setPasswordVisible((v) => !v)}
                        style={styles.inputIconButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        {isPasswordVisible ? <EyeOff color="#6B7280" /> : <Eye color="#6B7280" />}
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.label}>אימות סיסמה</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.input}
                        placeholder="הקלד שוב את הסיסמה"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!isConfirmPasswordVisible}
                        editable={!isLoading}
                        placeholderTextColor="#9DA4AE"
                      />
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={isConfirmPasswordVisible ? 'הסתר סיסמה' : 'הצג סיסמה'}
                        onPress={() => setConfirmPasswordVisible((v) => !v)}
                        style={styles.inputIconButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        {isConfirmPasswordVisible ? <EyeOff color="#6B7280" /> : <Eye color="#6B7280" />}
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <TouchableOpacity
                      style={[styles.button, isLoading && styles.buttonDisabled, { flex: 1 }]}
                      onPress={handleRegister}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <Text style={styles.buttonText}>
                          {mode === 'owner' ? 'ממשיכים' : 'יאללה, נכנסים'}
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="חזרה"
                      onPress={() => transitionToFormStep(mode === 'user' ? 1 : 0)}
                      style={styles.iconButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      disabled={isLoading}
                    >
                      <ChevronRight size={28} color="#6B7280" />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.sheetSubtitle, { marginTop: 8, textAlign: 'center' }]}>
                    {mode === 'user' ? 'שלב 4 מתוך 4' : 'שלב 2 מתוך 2'}
                  </Text>
                </View>
              </>
            )}
              </View>
            </View>
          ) : null}
        </View>
      </View>
      </KeyboardAwareScrollView>
      {/* Gender / Age pickers – reuse the same animated panel UX as the apartment "key" button */}
      <KeyFabPanel
        isOpen={isGenderPickerOpen}
        onClose={() => setIsGenderPickerOpen(false)}
        title="בחר/י מגדר"
        subtitle=""
        bodyText=""
        primaryActionLabel=""
        onPrimaryAction={undefined}
      >
        <TouchableOpacity
          style={styles.optionItem}
          onPress={() => {
            setGender('male');
            setIsGenderPickerOpen(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="בחר מגדר זכר"
        >
          <Text style={styles.optionText}>זכר</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.optionItem}
          onPress={() => {
            setGender('female');
            setIsGenderPickerOpen(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="בחר מגדר נקבה"
        >
          <Text style={styles.optionText}>נקבה</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.optionItem}
          onPress={() => {
            setGender('other');
            setIsGenderPickerOpen(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="בחר מגדר אחר"
        >
          <Text style={styles.optionText}>אחר</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.optionItem, { marginTop: 6 }]}
          onPress={() => setIsGenderPickerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="ביטול"
        >
          <Text style={[styles.optionText, { color: '#6B7280' }]}>ביטול</Text>
        </TouchableOpacity>
      </KeyFabPanel>

      <KeyFabPanel
        isOpen={isAgePickerOpen}
        onClose={() => setIsAgePickerOpen(false)}
        title="בחר/י גיל"
        subtitle=""
        bodyText=""
        primaryActionLabel=""
        onPrimaryAction={undefined}
      >
        <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="always">
          {Array.from({ length: 65 - 18 + 1 }).map((_, idx) => {
            const val = String(18 + idx);
            return (
              <TouchableOpacity
                key={val}
                style={styles.optionItem}
                onPress={() => {
                  setAge(val);
                  setIsAgePickerOpen(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`בחר גיל ${val}`}
              >
                <Text style={styles.optionText}>{val}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity
          style={[styles.optionItem, { marginTop: 6 }]}
          onPress={() => setIsAgePickerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="ביטול"
        >
          <Text style={[styles.optionText, { color: '#6B7280' }]}>ביטול</Text>
        </TouchableOpacity>
      </KeyFabPanel>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  bgWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  bgBlobTop: {
    position: 'absolute',
    top: 60,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    transform: [{ rotate: '15deg' }],
  },
  bgBlobBottom: {
    position: 'absolute',
    bottom: -100,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    transform: [{ rotate: '-10deg' }],
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  contentForSheet: {
    paddingBottom: 0,
  },
  contentBottom: {
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  headerCentered: {
    flex: 1,
    justifyContent: 'center',
    marginBottom: 0,
  },
  headerLogo: {
    alignSelf: 'center',
    width: 320,
    height: 96,
    marginTop: 8,
    marginBottom: 8,
  },
  heroText: {
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarContainer: {
    alignSelf: 'center',
    marginBottom: 16,
  },
  avatarFrame: {
    borderWidth: 1.4,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: PRIMARY,
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: PRIMARY,
    marginTop: 8,
    textAlign: 'center',
  },
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 40,
    paddingTop: 24,
    paddingBottom: 28,
    marginHorizontal: -24,
    marginTop: 0,
    marginBottom: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  sheetLowered: {
    marginTop: 56,
  },
  sheetStep0: {
    flex: 0,
    minHeight: '40%',
  },
  sheetHeader: {
    alignItems: 'center',
    marginBottom: 26,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: PRIMARY,
    textAlign: 'center',
  },
  sheetIntro: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '400',
    color: PRIMARY,
    textAlign: 'center',
  },
  sheetSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: PRIMARY,
    textAlign: 'center',
  },
  form: {
    gap: 12,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    borderRadius: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    overflow: 'hidden',
    position: 'relative',
  },
  cardPlain: {
    gap: 12,
  },
  label: {
    color: PRIMARY,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingRight: 16,
    marginBottom: 0,
  },
  input: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inputMultiline: {
    height: 96,
    textAlignVertical: 'top',
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputIconButton: {
    position: 'absolute',
    left: 12,
    top: 12,
  },
  selectInput: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectText: {
    color: '#111827',
    fontSize: 16,
    textAlign: 'right',
  },
  selectTextPlaceholder: {
    color: '#9DA4AE',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputHalf: {
    width: '48%',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  button: {
    backgroundColor: PRIMARY,
    paddingVertical: 16,
    borderRadius: 12,
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
  iconButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceButton: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  choiceButtonActive: {
    backgroundColor: '#2B2141',
    borderColor: PRIMARY,
  },
  choiceText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  choiceTextActive: {
    color: '#FFFFFF',
  },
  linkContainer: {
    alignItems: 'flex-end',
    marginTop: 16,
  },
  linkText: {
    color: PRIMARY,
    fontSize: 14,
    textAlign: 'right',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  modalSheet: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '35%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  modalTitle: {
    textAlign: 'center',
    color: PRIMARY,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  optionItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  optionText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#111827',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 50,
  },
  error: {
    backgroundColor: 'rgba(255,59,48,0.12)',
    color: '#FF6B6B',
    padding: 12,
    borderRadius: 12,
    textAlign: 'right',
    marginBottom: 16,
  },
  emailExistsCard: {
    backgroundColor: 'rgba(94,63,45,0.06)',
    borderColor: 'rgba(94,63,45,0.16)',
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  emailExistsText: {
    color: '#374151',
    textAlign: 'right',
    writingDirection: 'rtl',
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '600',
  },
  emailExistsButton: {
    backgroundColor: 'transparent',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(94,63,45,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailExistsButtonDisabled: {
    opacity: 0.6,
  },
  emailExistsButtonText: {
    color: PRIMARY,
    fontSize: 13.5,
    fontWeight: '700',
  },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segment: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginBottom: 12,
    backgroundColor: '#17171F',
    borderRadius: 14,
    padding: 2,
    position: 'relative',
  },
  stepChooser: {
    marginBottom: 16,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
    marginBottom: 12,
  },
  stepOptionsRow: {
    flexDirection: 'column',
    gap: 12,
    marginBottom: 12,
  },
  stepChooserLabel: {
    color: PRIMARY,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    marginTop: 8,
    marginBottom: 6,
    paddingRight: 2,
  },
  step0Card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    paddingTop: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    marginBottom: 12,
  },
  optionCard: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#9CA3AF',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'stretch',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  optionCardActive: {
    backgroundColor: '#F9FAFB',
    borderColor: PRIMARY,
  },
  optionTitle: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  optionTitleActive: {
    color: PRIMARY,
  },
  optionSub: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
  },
  optionSubActive: {
    color: PRIMARY,
  },
  optionContentRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  optionTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  optionCheckBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  glassWrap: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    overflow: 'hidden',
  },
  glassBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  glassWrapSheet: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  segmentThumb: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    backgroundColor: '#2B2141',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  segmentText: {
    color: '#9DA4AE',
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#FFFFFF',
  },
  suggestionsBox: {
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  suggestionText: {
    color: '#111827',
    fontSize: 14,
    textAlign: 'right',
  },
  glassWrapCard: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
