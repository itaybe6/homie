import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LavaLamp from '@/components/LavaLamp';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { autocompleteMapbox, type MapboxGeocodingFeature } from '@/lib/mapboxAutocomplete';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

const PRIMARY = '#5e3f2d';
const BG_DARK = '#2B1A12';

type RoleMode = 'user' | 'owner';

export default function CompleteProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const setUser = useAuthStore((s) => s.setUser);

  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string | undefined;

  const incomingEmail = useMemo(() => String((params as any)?.email || '').trim(), [params]);
  const incomingFullName = useMemo(() => String((params as any)?.fullName || '').trim(), [params]);

  const [mode, setMode] = useState<RoleMode>('user');
  const [email, setEmail] = useState(incomingEmail);
  const [fullName, setFullName] = useState(incomingFullName);
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | ''>('');
  const [bio, setBio] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<MapboxGeocodingFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Keep email in sync if route params change (rare).
  useEffect(() => {
    setEmail(incomingEmail);
  }, [incomingEmail]);

  useEffect(() => {
    if (incomingFullName) setFullName(incomingFullName);
  }, [incomingFullName]);

  // Autocomplete cities using Mapbox (same logic as register).
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

  // If user already has a complete profile, bounce them into the app.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const sessionUser = data.session?.user;
        if (!sessionUser?.id) return;

        // Fill email from session (params can be stale).
        if (!email) setEmail(sessionUser.email || '');
        if (!fullName) {
          const metaName = String((sessionUser.user_metadata as any)?.full_name || '').trim();
          if (metaName) setFullName(metaName);
        }

        const { data: profile } = await supabase
          .from('users')
          .select('id, role, full_name, phone, city, age, gender, bio')
          .eq('id', sessionUser.id)
          .maybeSingle();

        const hasRole = !!(profile as any)?.role;
        const hasFullName = !!String((profile as any)?.full_name || '').trim();
        const hasPhone = !!String((profile as any)?.phone || '').trim();
        const hasCity = !!String((profile as any)?.city || '').trim();

        if (profile?.id && hasRole && hasFullName && hasPhone && hasCity) {
          const role = (profile as any)?.role as any;
          setUser({ id: sessionUser.id, email: sessionUser.email!, role });
          if (role === 'owner') router.replace('/add-apartment' as any);
          else router.replace('/(tabs)/onboarding/survey' as any);
          return;
        }

        // Prefill fields if present (best-effort).
        if (profile) {
          if (!fullName) setFullName(String((profile as any)?.full_name || ''));
          setPhone(String((profile as any)?.phone || ''));
          setCity(String((profile as any)?.city || ''));
          const a = (profile as any)?.age;
          if (typeof a === 'number' && Number.isFinite(a)) setAge(String(a));
          const g = (profile as any)?.gender;
          if (g === 'male' || g === 'female' || g === 'other') setGender(g);
          setBio(String((profile as any)?.bio || ''));
          const r = (profile as any)?.role;
          if (r === 'owner' || r === 'user') setMode(r);
        }
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    setError('');
    const safeFullName = fullName.trim();
    const safePhone = phone.trim();
    const safeCity = city.trim();

    if (!safeFullName || !safePhone || !safeCity) {
      setError('אנא מלא שם מלא, טלפון ועיר');
      return;
    }
    if (age && isNaN(Number(age))) {
      setError('גיל חייב להיות מספר');
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;
      if (!sessionUser?.id) throw new Error('אין סשן מחובר. נסה להתחבר מחדש.');

      const payload: Record<string, unknown> = {
        id: sessionUser.id,
        email: sessionUser.email,
        full_name: safeFullName,
        role: mode,
        phone: safePhone,
        city: safeCity,
        updated_at: new Date().toISOString(),
      };

      if (mode === 'user') {
        payload.age = age ? Number(age) : null;
        payload.gender = gender || null;
        payload.bio = bio.trim() || null;
      }

      const { error: upsertError } = await supabase
        .from('users')
        .upsert(payload as any, { onConflict: 'id' });

      if (upsertError) {
        const msg = String((upsertError as any)?.message || upsertError);
        if (msg.toLowerCase().includes('row-level security')) {
          throw new Error(
            'שמירת פרופיל נחסמה בגלל הרשאות (RLS) בטבלת users. צריך Policy שמאפשר למשתמש מחובר לבצע upsert לשורה של עצמו (id = auth.uid()).'
          );
        }
        throw upsertError;
      }

      setUser({ id: sessionUser.id, email: sessionUser.email!, role: mode });

      if (mode === 'owner') {
        router.replace('/add-apartment' as any);
      } else {
        router.replace('/(tabs)/onboarding/survey' as any);
      }
    } catch (e: any) {
      setError(e?.message || 'שגיאה בשמירת הפרטים');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <LavaLamp hue="orange" intensity={60} count={5} duration={16000} backgroundColor={BG_DARK} />
      <KeyboardAwareScrollView
        enableOnAndroid
        extraScrollHeight={Platform.OS === 'ios' ? 16 : 24}
        keyboardOpeningTime={0}
        // Ensure autocomplete suggestions can be selected with a single tap while the keyboard is open.
        keyboardShouldPersistTaps="always"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.sheet}>
            <Text style={styles.title}>נשלים כמה פרטים</Text>
            <Text style={styles.subtitle}>כדי שנוכל להתאים לך דירות/שותפים ולפתוח פרופיל.</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'user' && styles.modeBtnActive]}
                onPress={() => setMode('user')}
                disabled={isLoading}
                activeOpacity={0.9}
              >
                <Text style={[styles.modeText, mode === 'user' && styles.modeTextActive]}>שוכר</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'owner' && styles.modeBtnActive]}
                onPress={() => setMode('owner')}
                disabled={isLoading}
                activeOpacity={0.9}
              >
                <Text style={[styles.modeText, mode === 'owner' && styles.modeTextActive]}>בעל דירה</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>אימייל</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={email}
              editable={false}
              placeholder="name@example.com"
              placeholderTextColor="#9DA4AE"
            />

            <Text style={styles.label}>שם מלא</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              editable={!isLoading}
              placeholder="ישראל ישראלי"
              placeholderTextColor="#9DA4AE"
            />

            <Text style={styles.label}>טלפון</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              editable={!isLoading}
              keyboardType="phone-pad"
              placeholder="050-123-4567"
              placeholderTextColor="#9DA4AE"
            />

            <Text style={styles.label}>עיר</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={(t) => {
                setCity(t);
                if (!t) setCitySuggestions([]);
              }}
              editable={!isLoading}
              placeholder="תל אביב-יפו"
              placeholderTextColor="#9DA4AE"
              onSubmitEditing={Keyboard.dismiss}
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

            {mode === 'user' ? (
              <>
                <Text style={styles.label}>גיל (אופציונלי)</Text>
                <TextInput
                  style={styles.input}
                  value={age}
                  onChangeText={setAge}
                  editable={!isLoading}
                  keyboardType="numeric"
                  placeholder="23"
                  placeholderTextColor="#9DA4AE"
                />

                <Text style={styles.label}>מגדר (אופציונלי)</Text>
                <View style={styles.genderRow}>
                  {(['male', 'female', 'other'] as const).map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.genderBtn, gender === g && styles.genderBtnActive]}
                      onPress={() => setGender((prev) => (prev === g ? '' : g))}
                      disabled={isLoading}
                      activeOpacity={0.9}
                    >
                      <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>
                        {g === 'male' ? 'זכר' : g === 'female' ? 'נקבה' : 'אחר'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>קצת עלייך (אופציונלי)</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={bio}
                  onChangeText={setBio}
                  editable={!isLoading}
                  multiline
                  placeholder="כמה מילים עלייך..."
                  placeholderTextColor="#9DA4AE"
                />
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={submit}
              disabled={isLoading}
              activeOpacity={0.9}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>שמור והמשך</Text>
              )}
            </TouchableOpacity>

            {Platform.OS === 'ios' ? (
              <Text style={styles.hint}>אם זו ההתחברות הראשונה עם Apple, ייתכן שאפל לא תחזיר את השם שוב בעתיד.</Text>
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
  },
  title: {
    color: PRIMARY,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    marginTop: 6,
    color: '#374151',
    fontSize: 13.5,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
  error: {
    marginTop: 12,
    backgroundColor: 'rgba(255,59,48,0.08)',
    color: '#B91C1C',
    padding: 12,
    borderRadius: 12,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  modeRow: {
    marginTop: 14,
    flexDirection: 'row-reverse',
    gap: 10,
  },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modeBtnActive: {
    borderColor: PRIMARY,
    backgroundColor: 'rgba(94,63,45,0.08)',
  },
  modeText: {
    color: '#6B7280',
    fontWeight: '900',
    fontSize: 14.5,
  },
  modeTextActive: {
    color: PRIMARY,
  },
  label: {
    marginTop: 12,
    marginBottom: 6,
    color: PRIMARY,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingRight: 6,
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
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  inputMultiline: {
    height: 92,
    textAlignVertical: 'top',
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
    writingDirection: 'rtl',
  },
  genderRow: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  genderBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  genderBtnActive: {
    borderColor: PRIMARY,
    backgroundColor: 'rgba(94,63,45,0.08)',
  },
  genderText: {
    color: '#6B7280',
    fontWeight: '800',
    fontSize: 13.5,
  },
  genderTextActive: {
    color: PRIMARY,
  },
  button: {
    marginTop: 16,
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  hint: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 12.5,
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 17,
  },
});

