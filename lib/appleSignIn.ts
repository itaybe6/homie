import * as AppleAuthentication from 'expo-apple-authentication';
import { authService } from '@/lib/auth';

export async function onAppleSignIn() {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    const { identityToken, fullName, email, user } = credential;

    // IMPORTANT: Apple only returns fullName and email on the FIRST sign-in.
    // You MUST save them immediately to your backend on the first call.
    // On subsequent sign-ins, only identityToken and user will be available.
    void identityToken;
    void fullName;
    void email;
    void user;

    if (!identityToken) {
      throw new Error('Apple לא החזיר identityToken. נסה שוב או בדוק הגדרות Sign in with Apple.');
    }

    // Exchange Apple identity token for Supabase session
    const { user: supaUser, role, needsProfileCompletion } =
      await authService.signInWithAppleIdToken(identityToken);

    const suggestedFullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return { user: supaUser, role, needsProfileCompletion, suggestedFullName, credential };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') {
      // User canceled the sign-in flow - do nothing
      return null;
    }
    throw e;
  }
}

