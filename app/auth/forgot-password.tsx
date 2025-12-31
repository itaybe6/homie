import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LavaLamp from '@/components/LavaLamp';
import { authService } from '@/lib/auth';
import { usePendingPasswordResetStore } from '@/stores/pendingPasswordResetStore';
import KeyboardAwareScrollView from 'react-native-keyboard-aware-scroll-view/lib/KeyboardAwareScrollView';

const PRIMARY = '#4C1D95';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const setPending = usePendingPasswordResetStore((s) => s.setPending);

  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const incoming = (params as any)?.email;
    if (typeof incoming === 'string' && incoming.trim()) setEmail(incoming.trim());
  }, [params]);

  const handleSend = async () => {
    if (!email.trim()) {
      setError('אנא הזן/י אימייל');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await authService.startPasswordResetOtp(email.trim());
      setPending({ email: email.trim(), otpVerified: false });
      router.push('/auth/reset-code' as any);
    } catch (e: any) {
      setError(e?.message || 'לא הצלחנו לשלוח קוד');
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
            <Text style={styles.title}>איפוס סיסמה</Text>
            <Text style={styles.subtitle}>הכניסו את האימייל שלכם ונשלח קוד אימות בן 6 ספרות.</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TextInput
              style={styles.input}
              placeholder="אימייל"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholderTextColor="#9DA4AE"
              editable={!isLoading}
            />

            <TouchableOpacity style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleSend} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>שלח קוד אימות</Text>}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.replace('/auth/login' as any)} disabled={isLoading} style={styles.linkBtn}>
              <Text style={styles.linkText}>חזרה להתחברות</Text>
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
  title: {
    color: PRIMARY,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    color: '#374151',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  input: {
    marginTop: 14,
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
  button: {
    marginTop: 14,
    backgroundColor: PRIMARY,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  linkBtn: { marginTop: 12, alignItems: 'center' },
  linkText: { color: PRIMARY, fontSize: 14, fontWeight: '700' },
  error: {
    marginTop: 12,
    backgroundColor: 'rgba(255,59,48,0.08)',
    color: '#B91C1C',
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
  },
});


