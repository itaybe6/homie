import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LavaLamp from '@/components/LavaLamp';
import OtpCodeInput from '@/components/OtpCodeInput';
import { authService } from '@/lib/auth';
import { usePendingPasswordResetStore } from '@/stores/pendingPasswordResetStore';
import KeyboardAwareScrollView from 'react-native-keyboard-aware-scroll-view/lib/KeyboardAwareScrollView';

const PRIMARY = '#5e3f2d';
const BG_DARK = '#2B1A12';

export default function ResetCodeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pending, setPending, clearPending } = usePendingPasswordResetStore();

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const email = pending?.email || '';

  const maskedEmail = useMemo(() => {
    if (!email.includes('@')) return email;
    const [name, domain] = email.split('@');
    const safeName = name.length <= 2 ? `${name[0] || ''}*` : `${name.slice(0, 2)}***`;
    return `${safeName}@${domain}`;
  }, [email]);

  useEffect(() => {
    if (!pending?.email) router.replace('/auth/forgot-password' as any);
  }, [pending?.email, router]);

  const handleVerify = async () => {
    if (!pending?.email) return;
    const token = code.replace(/\D/g, '');
    if (token.length !== 6) {
      setError('הקוד חייב להכיל 6 ספרות');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await authService.verifyPasswordResetEmailOtp({ email: pending.email, token });
      setPending({ email: pending.email, otpVerified: true });
      router.replace('/auth/new-password' as any);
    } catch (e: any) {
      setError(e?.message || 'שגיאה באימות הקוד');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pending?.email) return;
    setIsLoading(true);
    setError('');
    try {
      await authService.startPasswordResetOtp(pending.email);
    } catch (e: any) {
      setError(e?.message || 'לא הצלחנו לשלוח קוד שוב');
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
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
          <View style={styles.sheet}>
            <Text style={styles.title}>איפוס סיסמה</Text>
            <Text style={styles.subtitle}>
              שלחנו קוד בן 6 ספרות לכתובת{'\n'}
              <Text style={styles.email}>{maskedEmail}</Text>
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <OtpCodeInput
              value={code}
              onChange={(t) => setCode(t.replace(/[^\d]/g, '').slice(0, 6))}
              length={6}
              autoFocus
              disabled={isLoading}
              accentColor={PRIMARY}
            />

            <TouchableOpacity style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleVerify} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>אמת קוד</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleResend} disabled={isLoading} style={styles.linkBtn}>
              <Text style={styles.linkText}>לא קיבלתי קוד — שלח שוב</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                clearPending();
                router.replace('/auth/login' as any);
              }}
              disabled={isLoading}
              style={styles.linkBtn}
            >
              <Text style={[styles.linkText, { color: '#6B7280' }]}>חזרה להתחברות</Text>
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
  email: { color: PRIMARY, fontWeight: '800' },
  error: {
    marginTop: 12,
    backgroundColor: 'rgba(255,59,48,0.08)',
    color: '#B91C1C',
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
  },
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


