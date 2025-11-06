import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { Home, Camera, Edit3 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

// App primary brand color (purple)
const PRIMARY = '#7256B2';

export default function RegisterScreen() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'user' | 'owner'>('user');
  const [segWidth, setSegWidth] = useState(0);
  const segAnim = useRef(new Animated.Value(0)).current;
  // Owner apartment details will be collected later in a dedicated screen

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
      const fileExt = (uri.split('.').pop() || 'jpg').split('?')[0];
      const path = `avatars/${userId}.${fileExt}`;
      const res = await fetch(uri);
      const blob = await res.blob();
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = data.publicUrl;
      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
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

    try {
      const trimmed = avatarUrl.trim();
      const safeAvatarUrl = /^https?:\/\//.test(trimmed) ? trimmed : undefined;
      const avatarForSignup = mode === 'user' ? safeAvatarUrl : undefined;
      const { user } = await authService.signUp({
        email,
        password,
        fullName,
        phone: mode === 'user' ? (phone.trim() || undefined) : undefined,
        age: age ? Number(age) : undefined,
        avatarUrl: avatarForSignup,
        // Always create users profile so FK from apartments(owner_id) -> users(id) passes
        createProfile: true,
      });
      if (user) {
        if (mode === 'user' && avatarUrl) {
          // Try to upload avatar and update profile (best-effort)
          await uploadAvatar(user.id, avatarUrl);
        }
        if (mode === 'owner') {
          // Create/ensure owner record; apartment will be added in the next step
          const { error: ownerError } = await supabase
            .from('apartment_owners')
            .upsert(
              {
                id: user.id,
                email: user.email!,
                full_name: fullName,
                phone: phone.trim() || null,
                apartment_id: null,
              },
              { onConflict: 'id' }
            );

          if (ownerError) {
            // Allow flow to continue if the table doesn't exist yet (migration not applied)
            const msg = ownerError.message || '';
            if (msg.includes("Could not find the table 'public.apartment_owners'")) {
              console.warn(
                'apartment_owners table missing; continuing without owner row until migrations are applied.'
              );
            } else {
              console.error('Failed to create apartment_owners row:', ownerError);
              setError(ownerError.message);
              return;
            }
          }

          setUser({ id: user.id, email: user.email! });
          router.replace('/(tabs)/add-apartment');
        } else {
          setUser({ id: user.id, email: user.email! });
          router.replace('/(tabs)/home');
        }
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה ברישום');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.logoWrap}>
              <Home size={32} color="#fff" />
            </View>
            <Text style={styles.title}>ברוך הבא ל־Homie</Text>
            <Text style={styles.subtitle}>צור חשבון חדש</Text>
          </View>

          {/* Segmented toggle */}
          <View
            style={styles.segment}
            onLayout={(e) => setSegWidth(e.nativeEvent.layout.width)}
          >
            {segWidth > 0 ? (
              <Animated.View
                style={[
                  styles.segmentThumb,
                  {
                    width: segWidth / 2 - 4,
                    transform: [
                      {
                        translateX: segAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [2, segWidth / 2 + 2],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ) : null}
            <TouchableOpacity
              style={styles.segmentButton}
              activeOpacity={0.8}
              onPress={() => {
                setMode('user');
                Animated.timing(segAnim, {
                  toValue: 0,
                  duration: 260,
                  easing: Easing.out(Easing.cubic),
                  useNativeDriver: true,
                }).start();
              }}
            >
              <Text style={[styles.segmentText, mode === 'user' && styles.segmentTextActive]}>משתמש</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.segmentButton}
              activeOpacity={0.8}
              onPress={() => {
                setMode('owner');
                setAvatarUrl('');
                Animated.timing(segAnim, {
                  toValue: 1,
                  duration: 260,
                  easing: Easing.out(Easing.cubic),
                  useNativeDriver: true,
                }).start();
              }}
            >
              <Text style={[styles.segmentText, mode === 'owner' && styles.segmentTextActive]}>בעל דירה</Text>
            </TouchableOpacity>
          </View>

          {mode === 'user' ? (
            <View style={styles.avatarContainer}>
              <TouchableOpacity onPress={handlePickImage} activeOpacity={0.85}>
                <View style={styles.avatarRing}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Camera size={28} color="#6B7280" />
                    </View>
                  )}
                  <View style={styles.avatarBadge}>
                    <Edit3 size={14} color="#fff" />
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.form}>
            <View style={styles.card}>
              <TextInput
                style={styles.input}
                placeholder="שם מלא"
                value={fullName}
                onChangeText={setFullName}
                editable={!isLoading}
                placeholderTextColor="#9AA0A6"
              />

              <TextInput
                style={styles.input}
                placeholder="אימייל"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isLoading}
                placeholderTextColor="#9AA0A6"
              />

              {mode === 'user' ? (
                <View style={styles.row}>
                  <TextInput
                    style={[styles.input, styles.inputHalf]}
                    placeholder="טלפון"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    editable={!isLoading}
                    placeholderTextColor="#9AA0A6"
                  />
                  <TextInput
                    style={[styles.input, styles.inputHalf]}
                    placeholder="גיל"
                    value={age}
                    onChangeText={setAge}
                    keyboardType="number-pad"
                    editable={!isLoading}
                    placeholderTextColor="#9AA0A6"
                  />
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder="טלפון"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  editable={!isLoading}
                  placeholderTextColor="#9AA0A6"
                />
              )}

              {/* Owner fills apartment later on a dedicated screen */}

              {mode === 'user' ? (
                <TextInput
                  style={styles.input}
                  placeholder="קישור לתמונת פרופיל (לא חובה)"
                  value={avatarUrl}
                  onChangeText={setAvatarUrl}
                  autoCapitalize="none"
                  editable={!isLoading}
                  placeholderTextColor="#9AA0A6"
                />
              ) : null}

              <View style={styles.divider} />

              <TextInput
                style={styles.input}
                placeholder="סיסמה"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!isLoading}
                placeholderTextColor="#9AA0A6"
              />

              <TextInput
                style={styles.input}
                placeholder="אימות סיסמה"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                editable={!isLoading}
                placeholderTextColor="#9AA0A6"
              />
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {mode === 'owner' ? 'המשך הרשמה' : 'הירשם'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.linkContainer}
              onPress={() => router.back()}
              disabled={isLoading}>
              <Text style={styles.linkText}>יש לך חשבון? התחבר כאן</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  header: {
    alignItems: 'flex-end',
    marginBottom: 32,
  },
  avatarContainer: {
    alignSelf: 'center',
    marginBottom: 16,
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
    borderWidth: 1,
    borderColor: '#E5E7EB',
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
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0A0A0A',
    marginTop: 16,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'right',
  },
  form: {
    gap: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    borderRadius: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  input: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#0A0A0A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inputMultiline: {
    height: 96,
    textAlignVertical: 'top',
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
  linkContainer: {
    alignItems: 'flex-end',
    marginTop: 16,
  },
  linkText: {
    color: PRIMARY,
    fontSize: 14,
    textAlign: 'right',
  },
  error: {
    backgroundColor: 'rgba(255,59,48,0.12)',
    color: '#FF3B30',
    padding: 12,
    borderRadius: 12,
    textAlign: 'right',
    marginBottom: 16,
  },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segment: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginBottom: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    padding: 2,
    position: 'relative',
  },
  segmentThumb: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    left: 2,
    backgroundColor: '#FFFFFF',
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
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#0A0A0A',
  },
});
