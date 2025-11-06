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
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { Home } from 'lucide-react-native';

export default function RegisterScreen() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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

    setIsLoading(true);
    setError('');

    try {
      const { user } = await authService.signUp(email, password, fullName);
      if (user) {
        setUser({ id: user.id, email: user.email! });
        router.replace('/(tabs)/home');
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
            <Home size={48} color="#00BCD4" />
            <Text style={styles.title}>Homie</Text>
            <Text style={styles.subtitle}>צור חשבון חדש</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              placeholder="שם מלא"
              value={fullName}
              onChangeText={setFullName}
              editable={!isLoading}
            />

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

            <TextInput
              style={styles.input}
              placeholder="אימות סיסמה"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!isLoading}
            />

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>הירשם</Text>
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
    backgroundColor: '#F5F5F5',
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
