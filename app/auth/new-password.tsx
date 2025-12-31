import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LavaLamp from '@/components/LavaLamp';
import { authService } from '@/lib/auth';
import { usePendingPasswordResetStore } from '@/stores/pendingPasswordResetStore';
import { Eye, EyeOff } from 'lucide-react-native';
import KeyboardAwareScrollView from 'react-native-keyboard-aware-scroll-view/lib/KeyboardAwareScrollView';

const PRIMARY = '#4C1D95';

export default function NewPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pending, clearPending } = usePendingPasswordResetStore();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPwVisible, setPwVisible] = useState(false);
  const [isConfirmVisible, setConfirmVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Require that the OTP step happened (or at least email exists in store)
    if (isLoading) return;
    if (!pending?.email) {
      router.replace('/auth/forgot-password' as any);
      return;
    }
    if (!pending?.otpVerified) {
      router.replace('/auth/reset-code' as any);
      return;
    }
  }, [pending?.email, pending?.otpVerified, router, isLoading]);

  const handleUpdate = async () => {
    if (!pending?.email) return;
    if (!newPassword || !confirmPassword) {
      setError('אנא מלא סיסמה חדשה ואימות סיסמה');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }
    if (newPassword.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      await authService.updatePassword(newPassword);
      const email = pending.email;
      // Navigate first, then clear local pending state to avoid redirect loops during rerender.
      router.replace({ pathname: '/auth/login', params: { email } } as any);
      setTimeout(() => clearPending(), 250);
    } catch (e: any) {
      setError(e?.message || 'לא הצלחנו לעדכן סיסמה');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <LavaLamp hue="purple" intensity={60} count={5} duration={16000} backgroundColor="#2E1065" />
      <KeyboardAwareScrollView
        enableOnAndroid
        extraScrollHeight={Platform.OS === 'ios' ? 16 : 24}
        keyboardOpeningTime={0}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
          <View style={styles.sheet}>
            <Text style={styles.title}>סיסמה חדשה</Text>
            <Text style={styles.subtitle}>בחרו סיסמה חדשה לחשבון שלכם.</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.label}>סיסמה חדשה</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="הקלד סיסמה חדשה"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!isPwVisible}
                editable={!isLoading}
                placeholderTextColor="#9DA4AE"
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={isPwVisible ? 'הסתר סיסמה' : 'הצג סיסמה'}
                onPress={() => setPwVisible((v) => !v)}
                style={styles.inputIconButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={isLoading}
              >
                {isPwVisible ? <EyeOff color="#6B7280" /> : <Eye color="#6B7280" />}
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>אימות סיסמה</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder="הקלד שוב את הסיסמה"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!isConfirmVisible}
                editable={!isLoading}
                placeholderTextColor="#9DA4AE"
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={isConfirmVisible ? 'הסתר סיסמה' : 'הצג סיסמה'}
                onPress={() => setConfirmVisible((v) => !v)}
                style={styles.inputIconButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                disabled={isLoading}
              >
                {isConfirmVisible ? <EyeOff color="#6B7280" /> : <Eye color="#6B7280" />}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleUpdate} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>עדכן סיסמה</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                clearPending();
                router.replace('/auth/login' as any);
              }}
              disabled={isLoading}
              style={styles.linkBtn}
            >
              <Text style={[styles.linkText, { color: '#6B7280' }]}>ביטול וחזרה להתחברות</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  container: { flex: 1, paddingHorizontal: 24 },
  sheet: {
    marginTop: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
  },
  title: { color: PRIMARY, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    marginTop: 8,
    color: '#374151',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  error: {
    marginTop: 12,
    backgroundColor: 'rgba(255,59,48,0.08)',
    color: '#B91C1C',
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
  },
  label: {
    marginTop: 12,
    color: PRIMARY,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    paddingRight: 4,
  },
  inputWrapper: { position: 'relative', justifyContent: 'center', marginTop: 6 },
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
  inputIconButton: { position: 'absolute', left: 12, top: 12 },
  button: {
    marginTop: 14,
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  linkBtn: { marginTop: 12, alignItems: 'center' },
  linkText: { color: PRIMARY, fontSize: 14, fontWeight: '700' },
});


