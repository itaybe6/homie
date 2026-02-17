import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, EyeOff, ArrowLeft } from 'lucide-react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
// Removed vector icon for Google since it is single-color; using multicolor image instead
import LavaLamp from '../../components/LavaLamp';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { onAppleSignIn } from '@/lib/appleSignIn';

const ACCENT_BROWN = '#5e3f2d';
const BG_DARK = '#2B1A12';
const SHEET_TOP_OFFSET = 72;

export default function LoginScreen() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAppleSignInAvailable, setIsAppleSignInAvailable] = useState(false);

  // Prefill email when coming from register ("email already exists")
  useEffect(() => {
    const incoming = (params as any)?.email;
    if (typeof incoming === 'string' && incoming.trim()) {
      setEmail(incoming.trim());
    }
  }, [params]);

  // Clear any broken/partial session so the login screen doesn't log refresh errors on mount
  useEffect(() => {
    (async () => {
      try {
        await authService.getCurrentUser();
      } catch {
        // ignore – getCurrentUser already clears invalid refresh tokens locally
      }
    })();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then((available) => setIsAppleSignInAvailable(available))
      .catch(() => setIsAppleSignInAvailable(false));
  }, []);

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
        // Owners should land on apartments ("דירות") and never on partners.
        // Regular users land on partners by default.
        const next =
          role === 'admin'
            ? '/admin'
            : role === 'owner'
              ? '/(tabs)/home'
              : '/(tabs)/partners';
        setUser({ id: user.id, email: user.email!, role });
        router.replace(next as any);
      }
    } catch (e: any) {
      setError(e.message || 'שגיאה בהתחברות');
    } finally {
      setIsLoading(false);
    }
  };
 
   const handleGoogleSignIn = async () => {
     try {
       setIsLoading(true);
       // Hook your Google sign-in flow here (expo-auth-session / firebase / supabase, etc.)
       console.log('Google sign-in pressed');
     } finally {
       setIsLoading(false);
     }
   };

  const handleAppleSignIn = async () => {
    try {
      setIsLoading(true);
      setError('');

      const res = await onAppleSignIn();
      if (!res) return; // cancelled

      const { user, role, needsProfileCompletion, suggestedFullName } = res as any;
      if (user) {
        if (needsProfileCompletion) {
          router.replace({
            pathname: '/auth/complete-profile',
            params: {
              email: user.email,
              fullName: suggestedFullName || '',
            },
          } as any);
          return;
        }

        // Owners should land on apartments ("דירות") and never on partners.
        // Regular users land on partners by default.
        const next =
          role === 'admin'
            ? '/admin'
            : role === 'owner'
              ? '/(tabs)/home'
              : '/(tabs)/partners';
        setUser({ id: user.id, email: user.email!, role });
        router.replace(next as any);
      }
    } catch (e: any) {
      setError(e?.message || 'שגיאה בהתחברות עם Apple');
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
          <View style={styles.content}>
          <View style={[styles.header, { paddingTop: insets.top + 24, paddingBottom: 16 }]}>
            <TouchableOpacity
              onPress={() => router.replace('/auth/intro')}
              accessibilityRole="button"
              accessibilityLabel="חזרה"
              style={styles.backButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ArrowLeft color="#FFFFFF" size={24} />
            </TouchableOpacity>
            <Image
               source={require('../../assets/images/logo slog.png')}
              style={styles.logo}
              resizeMode="contain"
              accessible
              accessibilityLabel="Homie logo"
            />
          </View>

          {error ? <Text style={styles.errorLight}>{error}</Text> : null}

          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>מצא את השותפים שלך</Text>
              <Text style={styles.sheetSubtitle}>התחבר לחשבון שלך</Text>
            </View>
            <View style={{ paddingBottom: insets.bottom + 16 }}>
              <View style={styles.form}>
                <TextInput
                  style={styles.inputLight}
                  placeholder="אימייל"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholderTextColor="#9DA4AE"
                />
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.inputLight}
                    placeholder="סיסמה"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!isPasswordVisible}
                    placeholderTextColor="#9DA4AE"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={isPasswordVisible ? 'הסתר סיסמה' : 'הצג סיסמה'}
                    onPress={() => setPasswordVisible((v) => !v)}
                    style={styles.inputIconButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {isPasswordVisible ? <EyeOff color="#6B7280" /> : <Eye color="#6B7280" />}
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.forgotLinkWrap}
                  onPress={() => router.push({ pathname: '/auth/forgot-password', params: { email: email.trim() } } as any)}
                  disabled={isLoading}
                >
                  <Text style={styles.forgotLinkText}>שכחתי סיסמה?</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, isLoading && styles.buttonDisabled]} onPress={handleLogin} disabled={isLoading}>
                  {isLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>התחבר</Text>}
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.line} />
                  <Text style={styles.dividerText}>התחברות או הרשמה עם אפל או גוגל</Text>
                  <View style={styles.line} />
                </View>

                <TouchableOpacity
                  style={styles.oauthBtn}
                  onPress={handleGoogleSignIn}
                  disabled={isLoading}
                  activeOpacity={0.9}
                >
                  {/* Use local multi-color SVG for Google icon */}
                  {/** We render a local SVG component to ensure brand colors **/}
                  {/** and avoid single-color font icons. **/}
                  <View style={{ marginLeft: 6 }}>
                    {require('../../components/icons/GoogleSvg').default({
                      width: 18,
                      height: 18,
                    })}
                  </View>
                  <Text style={styles.oauthText}>Google</Text>
                </TouchableOpacity>

                {Platform.OS === 'ios' && isAppleSignInAvailable ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={12}
                    style={styles.appleBtn}
                    onPress={handleAppleSignIn}
                  />
                ) : null}
                <TouchableOpacity style={styles.linkContainerCenter} onPress={() => router.replace('/auth/register')} disabled={isLoading}>
                  <Text style={styles.linkTextPurple}>אין לך חשבון? הרשם כאן</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 0,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    backgroundColor: 'transparent',
    marginHorizontal: 0,
    paddingHorizontal: 24,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: 45,
    zIndex: 10,
  },
  logo: {
    width: 320,
    height: 100,
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
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#9DA4AE',
    marginTop: 6,
    textAlign: 'center',
  },
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 40,
    paddingTop: 38,
    paddingBottom: 16,
    // Stretch to full width (cancel outer content padding)
    marginHorizontal: -24,
    // Sheet starts right after the background fill
    marginTop: 0,
  },
  sheetHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: ACCENT_BROWN,
    textAlign: 'center',
  },
  sheetSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: ACCENT_BROWN,
    textAlign: 'center',
  },
  form: {
    gap: 12,
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputLight: {
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
  inputIconButton: {
    position: 'absolute',
    left: 12,
    // vertically align around text input's content
    top: 12,
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
    backgroundColor: ACCENT_BROWN,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  dividerRow: {
    marginTop: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    color: '#9DA4AE',
    fontSize: 12,
  },
  oauthBtn: {
    marginTop: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  oauthText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  appleBtn: {
    width: '100%',
    height: 45,
    marginTop: 4,
  },
  linkContainerCenter: {
    alignItems: 'center',
    marginTop: 8,
  },
  linkTextPurple: {
    color: ACCENT_BROWN,
    fontSize: 14,
    textAlign: 'center',
  },
  forgotLinkWrap: {
    alignItems: 'flex-end',
    // Pull closer to the input above (form uses a fixed gap)
    marginTop: -8,
    marginBottom: 4,
    paddingRight: 4,
  },
  forgotLinkText: {
    color: ACCENT_BROWN,
    fontSize: 13,
    fontWeight: '500',
    textDecorationLine: 'underline',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  errorLight: {
    backgroundColor: 'rgba(255,59,48,0.08)',
    color: '#B91C1C',
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
});
