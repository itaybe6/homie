import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LavaLamp from '@/components/LavaLamp';
import { authService } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { usePendingSignupStore } from '@/stores/pendingSignupStore';

const PRIMARY = '#4C1D95';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setUser = useAuthStore((s) => s.setUser);
  const { pending, clearPending } = usePendingSignupStore();

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
    if (!pending?.email) {
      // If user refreshed or arrived here directly, go back to register.
      router.replace('/auth/register' as any);
    }
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
      // 1) Verify OTP -> creates a session
      const { user } = await authService.verifyEmailOtp(pending.email, token);
      if (!user) throw new Error('לא התקבל משתמש מהשרת');

      // 2) Set password for future logins (since OTP flow is passwordless by default)
      if (pending.password) {
        const { error: pwErr } = await supabase.auth.updateUser({ password: pending.password });
        if (pwErr) throw pwErr;
      }

      // 3) Best-effort: ensure role is set for owners if column exists
      try {
        if (pending.role === 'owner') {
          await supabase.from('users').update({ role: 'owner' as any }).eq('id', user.id);
        }
      } catch {
        // ignore
      }

      // 4) Continue into the app
      setUser({ id: user.id, email: user.email! } as any);
      clearPending();
      if (pending.role === 'owner') {
        router.replace('/(tabs)/add-apartment' as any);
      } else {
        router.replace('/(tabs)/home' as any);
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      // Helpful hint when project is still configured to send magic links instead of OTP codes
      if (msg.toLowerCase().includes('otp') || msg.toLowerCase().includes('token')) {
        setError(msg);
      } else {
        setError(msg || 'שגיאה באימות הקוד');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pending?.email) return;
    setIsLoading(true);
    setError('');
    try {
      await authService.startEmailOtpSignUp({
        email: pending.email,
        fullName: pending.fullName,
        role: pending.role,
        phone: pending.phone,
        age: pending.age,
        bio: pending.bio,
        gender: pending.gender,
        city: pending.city,
        avatarUrl: pending.avatarUrl,
      });
    } catch (e: any) {
      setError(e?.message || 'לא הצלחנו לשלוח קוד שוב');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <LavaLamp hue="purple" intensity={50} count={5} duration={16000} backgroundColor="#2E1065" />
      <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
        <View style={styles.sheet}>
          <Text style={styles.title}>אימות מייל</Text>
          <Text style={styles.subtitle}>
            שלחנו קוד בן 6 ספרות לכתובת{'\n'}
            <Text style={styles.email}>{maskedEmail}</Text>
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^\d]/g, '').slice(0, 6))}
            placeholder="הקלד/י קוד (6 ספרות)"
            placeholderTextColor="#9DA4AE"
            keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
            textContentType="oneTimeCode"
            autoFocus
            editable={!isLoading}
            style={styles.input}
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>אמת קוד</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleResend} disabled={isLoading} style={styles.linkBtn}>
            <Text style={styles.linkText}>לא קיבלתי קוד — שלח שוב</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              clearPending();
              router.replace('/auth/register' as any);
            }}
            disabled={isLoading}
            style={styles.linkBtn}
          >
            <Text style={[styles.linkText, { color: '#6B7280' }]}>חזרה להרשמה</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
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
  email: {
    color: PRIMARY,
    fontWeight: '700',
  },
  input: {
    marginTop: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 6,
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
  linkBtn: {
    marginTop: 12,
    alignItems: 'center',
  },
  linkText: {
    color: PRIMARY,
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    marginTop: 12,
    backgroundColor: 'rgba(255,59,48,0.08)',
    color: '#B91C1C',
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
  },
});


