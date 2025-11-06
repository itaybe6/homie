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
} from 'react-native';
import { useRouter } from 'expo-router';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { Home } from 'lucide-react-native';

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setError('אנא מלא את כל השדות');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const { user } = await authService.signIn(email, password);
      if (user) {
        setUser({ id: user.id, email: user.email! });
        router.replace('/(tabs)/home');
      }
    } catch (err: any) {
      setError(err.message || 'שגיאה בהתחברות');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Home size={48} color="#00BCD4" />
          <Text style={styles.title}>Homie</Text>
          <Text style={styles.subtitle}>ברוכים השבים</Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="אימייל"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!isLoading}
          />

          <TextInput
            style={styles.input}
            placeholder="סיסמה"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            editable={!isLoading}
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}>
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.buttonText}>התחבר</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkContainer}
            onPress={() => router.push('/auth/register')}
            disabled={isLoading}>
            <Text style={styles.linkText}>אין לך חשבון? הירשם כאן</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#00BCD4',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#757575',
    marginTop: 8,
  },
  form: {
    gap: 16,
  },
  input: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  button: {
    backgroundColor: '#00BCD4',
    paddingVertical: 16,
    borderRadius: 8,
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
    alignItems: 'center',
    marginTop: 16,
  },
  linkText: {
    color: '#00BCD4',
    fontSize: 14,
  },
  error: {
    backgroundColor: '#FFEBEE',
    color: '#C62828',
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
    marginBottom: 16,
  },
});
