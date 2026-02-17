import * as AppleAuthentication from 'expo-apple-authentication';

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

    // TODO: Send identityToken to your backend server to verify and create/login user
    // The backend should verify the identityToken JWT with Apple's public keys

    return credential;
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') {
      // User canceled the sign-in flow - do nothing
      return null;
    }
    throw e;
  }
}

