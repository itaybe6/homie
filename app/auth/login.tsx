import { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Home } from 'lucide-react-native';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';

const ACCENT_PURPLE = '#7C5CFF';

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('אנא מלא אימייל וסיסמה');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const { user, role } = await authService.signIn(email, password) as any;
      if (user) {
        const next = role === 'admin' ? '/admin' : '/(tabs)/home';
        setUser({ id: user.id, email: user.email!, role });
        router.replace(next as any);
      }
    } catch (e: any) {
      setError(e.message || 'שגיאה בהתחברות');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.header}> 
            <View style={styles.logoWrap}>
              <Home size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>ברוך הבא ל־Homie</Text>
            <Text style={styles.subtitle}>התחבר לחשבון שלך</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="אימייל"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#9DA4AE"
            />
            <TextInput
              style={styles.input}
              placeholder="סיסמה"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholderTextColor="#9DA4AE"
            />
            <TouchableOpacity style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleLogin} disabled={isLoading}>
              {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>התחבר</Text>}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.linkContainer} onPress={() => router.replace('/auth/register')} disabled={isLoading}>
            <Text style={styles.linkText}>אין לך חשבון? הרשם כאן</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
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
    marginBottom: 28,
  },
  logoWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 14,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 14,
    color: '#9DA4AE',
    marginTop: 6,
    textAlign: 'right',
  },
  card: {
    backgroundColor: '#141420',
    borderWidth: 1,
    borderColor: '#2A2A37',
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  input: {
    backgroundColor: '#17171F',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2A2A37',
    color: '#FFFFFF',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  button: {
    backgroundColor: ACCENT_PURPLE,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#0F0F14',
    fontSize: 16,
    fontWeight: '800',
  },
  linkContainer: {
    alignItems: 'flex-end',
    marginTop: 16,
  },
  linkText: {
    color: ACCENT_PURPLE,
    fontSize: 14,
    textAlign: 'right',
  },
  error: {
    backgroundColor: 'rgba(255,59,48,0.12)',
    color: '#FF9AA2',
    padding: 12,
    borderRadius: 12,
    textAlign: 'right',
    marginBottom: 12,
  },
});
