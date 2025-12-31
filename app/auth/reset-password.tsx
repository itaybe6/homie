import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

// Backwards compatibility: the reset flow is now split into two screens:
// 1) /auth/reset-code (verify OTP)
// 2) /auth/new-password (choose new password)
export default function ResetPasswordLegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/auth/reset-code' as any);
  }, [router]);
  return <View style={{ flex: 1 }} />;
}


