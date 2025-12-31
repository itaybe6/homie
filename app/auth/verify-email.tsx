import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LavaLamp from '@/components/LavaLamp';
import OtpCodeInput from '@/components/OtpCodeInput';
import { authService } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { usePendingSignupStore } from '@/stores/pendingSignupStore';
import * as ImageManipulator from 'expo-image-manipulator';

const PRIMARY = '#4C1D95';

async function uploadAvatarLocalUri(userId: string, uri: string): Promise<void> {
  const trimmed = String(uri || '').trim();
  if (!trimmed) return;
  // Only handle local files here; remote URLs are already handled via metadata on signup.
  if (/^https?:\/\//.test(trimmed)) return;

  // Resize (only if needed) + compress to keep uploads light.
  const imageInfo = await ImageManipulator.manipulateAsync(trimmed, []);
  const actions: ImageManipulator.Action[] = [];
  if (imageInfo.width > 800) {
    actions.push({ resize: { width: 800 } });
  }
  const compressed = await ImageManipulator.manipulateAsync(trimmed, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const fileName = `${userId}-${Date.now()}.jpg`;
  const filePath = `users/${userId}/${fileName}`;

  const res = await fetch(compressed.uri);
  const arrayBuffer = await res.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from('user-images')
    .upload(filePath, arrayBuffer, { upsert: true, contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('user-images').getPublicUrl(filePath);
  const publicUrl = data.publicUrl;

  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() } as any)
    .eq('id', userId);
  if (updateError) throw updateError;
}

export default function VerifyEmailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
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
    // If user refreshed/arrived directly without pending AND not authenticated, go back to register.
    // Important: after successful verification we clear pending, so we must not redirect when a session exists.
    if (!pending?.email && !user) {
      // If user refreshed or arrived here directly, go back to register.
      router.replace('/auth/register' as any);
    }
  }, [pending?.email, user, router]);

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
        if (pwErr) {
          // If the user already had the same password (re-register / repeat OTP), Supabase may return:
          // "New password should be different from the old password."
          // This is not fatal for the OTP verification flow, so we treat it as non-blocking.
          const msg = String((pwErr as any)?.message || pwErr);
          if (!msg.toLowerCase().includes('new password should be different')) {
            throw pwErr;
          }
        }
      }

      // 3) Best-effort: ensure role is set for owners if column exists
      try {
        if (pending.role === 'owner') {
          await supabase.from('users').update({ role: 'owner' as any }).eq('id', user.id);
        }
      } catch {
        // ignore
      }

      // 3.5) Best-effort: upload avatar chosen during signup (local file URI)
      // We can only upload after OTP verification because we need an authenticated session.
      try {
        if (pending.role === 'user' && pending.avatarLocalUri) {
          await uploadAvatarLocalUri(user.id, pending.avatarLocalUri);
        }
      } catch {
        // Non-blocking: don't fail signup if avatar upload fails
      }

      // 4) Continue into the app
      setUser({ id: user.id, email: user.email! } as any);
      clearPending();
      if (pending.role === 'owner') {
        router.replace('/add-apartment' as any);
      } else {
        router.replace('/(tabs)/onboarding/survey' as any);
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

          <OtpCodeInput
            value={code}
            onChange={(t) => setCode(t.replace(/[^\d]/g, '').slice(0, 6))}
            length={6}
            autoFocus
            disabled={isLoading}
            accentColor={PRIMARY}
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


