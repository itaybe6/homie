import { AuthApiError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AuthUser {
  id: string;
  email: string;
  role?: 'user' | 'owner' | 'admin';
}

export const authService = {
  /**
   * Checks (server-side) if an email is already registered.
   * Requires the `public.email_exists(email_to_check text)` RPC to be deployed.
   */
  async isEmailRegistered(email: string): Promise<boolean> {
    const normalized = (email || '').trim().toLowerCase();
    if (!normalized) return false;
    const { data, error } = await supabase.rpc('email_exists', {
      email_to_check: normalized,
    } as any);
    if (error) {
      const msg = String((error as any)?.message || error);
      // Helpful hint when the migration wasn't applied yet
      if (msg.toLowerCase().includes('function') && msg.toLowerCase().includes('email_exists')) {
        throw new Error(
          'חסר RPC במסד הנתונים לבדיקת אימייל קיים (public.email_exists). נא להריץ את המיגרציה של Supabase ואז לנסות שוב.'
        );
      }
      throw error;
    }
    return !!data;
  },

  /**
   * Throws a friendly error when the email already exists.
   */
  async assertEmailAvailable(email: string): Promise<void> {
    const exists = await this.isEmailRegistered(email);
    if (exists) {
      throw new Error('המייל כבר קיים במערכת. אנא הירשמו עם מייל אחר.');
    }
  },

  async startEmailOtpSignUp(params: {
    email: string;
    fullName: string;
    role: 'user' | 'owner';
    phone?: string;
    age?: number;
    bio?: string;
    gender?: 'male' | 'female';
    city?: string;
    avatarUrl?: string;
    instagramUrl?: string;
  }) {
    const { email, fullName, role, phone, age, bio, gender, city, avatarUrl, instagramUrl } = params;

    // Sends an email OTP (6-digit code) when Email OTP is enabled in Supabase Auth settings.
    // shouldCreateUser ensures a new user is created if it doesn't exist yet.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: {
          full_name: fullName,
          role,
          phone: phone || null,
          age: typeof age === 'number' ? age : null,
          bio: bio || null,
          gender: gender || null,
          city: city || null,
          avatar_url: avatarUrl || null,
          instagram_url: instagramUrl || null,
        },
      },
    });

    if (error) throw error;
    return true;
  },

  /**
   * Password reset via OTP (6-digit code).
   * We intentionally set shouldCreateUser=false so an unknown email won't create an account.
   */
  async startPasswordResetOtp(email: string) {
    const normalized = (email || '').trim();
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        shouldCreateUser: false,
      },
    });
    if (error) throw error;
    return true;
  },

  /**
   * Verify OTP for password reset. This creates an authenticated session.
   */
  async verifyPasswordResetEmailOtp(params: { email: string; token: string }) {
    const { email, token } = params;
    const cleaned = token.replace(/\s/g, '');
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: cleaned,
      type: 'email',
    });
    if (error) throw error;
    const authedUser = data.user;
    if (!authedUser) throw new Error('לא התקבל משתמש מהשרת');
    return { user: authedUser };
  },

  /**
   * Update password for the currently authenticated user (after OTP verification).
   */
  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return true;
  },

  async verifyEmailOtp(email: string, token: string) {
    const cleaned = token.replace(/\s/g, '');
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: cleaned,
      type: 'email',
    });
    if (error) throw error;
    return data;
  },

  async signUp(params: {
    email: string;
    password: string;
    fullName: string;
    role: 'user' | 'owner';
    phone?: string;
    age?: number;
    bio?: string;
    gender?: 'male' | 'female';
    city?: string;
    avatarUrl?: string;
    instagramUrl?: string;
    createProfile?: boolean; // when false, do not upsert into users table
  }) {
    const {
      email,
      password,
      fullName,
      role,
      phone,
      age,
      bio,
      gender,
      city,
      avatarUrl,
      instagramUrl,
      createProfile = true,
    } = params;

    // Try to sign up. If the user already exists (422), fall back to sign-in.
    // Also store basic profile fields in user metadata so a DB trigger can create the profile row.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          phone: phone || null,
          age: typeof age === 'number' ? age : null,
          bio: bio || null,
          gender: gender || null,
          city: city || null,
          avatar_url: avatarUrl || null,
          instagram_url: instagramUrl || null,
        },
      },
    });

    let userId: string | null = null;
    let userEmail: string | null = null;

    if (signUpError) {
      // Handle 'User already registered' gracefully by signing in
      // Supabase error code is 422 in this case
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const status = (signUpError as any).status;
      if (status === 422) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        userId = signInData.user?.id ?? null;
        userEmail = signInData.user?.email ?? null;
      } else {
        throw signUpError;
      }
    } else {
      userId = signUpData.user?.id ?? null;
      userEmail = signUpData.user?.email ?? null;
    }

    if (!userId || !userEmail) throw new Error('No user returned');

    // Some Supabase projects require email confirmation. In that case, signUp returns a user but no session yet,
    // and RLS will block any write to protected tables (like public.users).
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const hasSession = !!session?.user?.id;
    const needsEmailVerification = !hasSession && !signUpError;

    // Optionally ensure profile row exists (idempotent) when we have a session.
    if (createProfile && hasSession) {
      // Always create a users row. For owners, keep minimal fields.
      const baseProfile: Record<string, unknown> = {
        id: userId,
        email: userEmail,
        full_name: fullName,
        role,
      };

      const extendedForRegularUser: Record<string, unknown> =
        role === 'user'
          ? {
              phone: phone || null,
              age: typeof age === 'number' ? age : null,
              bio: bio || null,
              gender: gender || null,
              city: city || null,
              avatar_url: avatarUrl || null,
              instagram_url: instagramUrl || null,
            }
          : {};

      const { error: profileError } = await supabase
        .from('users')
        .upsert(
          { ...baseProfile, ...extendedForRegularUser },
          { onConflict: 'id' }
        );

      if (profileError) {
        const msg = String((profileError as any)?.message || profileError);
        // Friendly message for the common RLS misconfiguration.
        if (msg.toLowerCase().includes('row-level security')) {
          throw new Error(
            'הרשמה נחסמה בגלל הגדרת הרשאות במסד הנתונים (RLS) לטבלת users. צריך להוסיף Policy שמאפשרת ליצור פרופיל למשתמש המחובר.'
          );
        }
        throw profileError;
      }
    }

    return { user: { id: userId, email: userEmail }, needsEmailVerification } as any;
  },

  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    const authedUser = data.user;
    let role: 'user' | 'owner' | 'admin' | undefined = undefined;
    if (authedUser?.id) {
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('role')
          .eq('id', authedUser.id)
          .maybeSingle();
        role = (profile as any)?.role;
      } catch {
        // ignore
      }
    }

    return { user: authedUser, role } as any;
  },

  async signOut() {
    // Use global scope to clear cookies on web as well
    const { error } = await supabase.auth.signOut({ scope: 'global' as any });
    if (error) throw error;
  },

  async getCurrentUser() {
    let session: any = null;
    let sessionError: any = null;

    try {
      const res = await supabase.auth.getSession();
      session = (res as any)?.data?.session ?? null;
      sessionError = (res as any)?.error ?? null;
    } catch (err) {
      // Some edge cases can throw instead of returning { error }
      sessionError = err;
      session = null;
    }

    if (sessionError) {
      if (
        sessionError instanceof AuthApiError &&
        sessionError.message.toLowerCase().includes('invalid refresh token')
      ) {
        // Clear the broken session so app can continue to login screen without noisy errors
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // ignore secondary errors when clearing local session
        }
        return null;
      }

      // Fallback: in case the error isn't an AuthApiError instance (dup deps / thrown error),
      // still clear local session if the message matches.
      const msg = String((sessionError as any)?.message || sessionError || '').toLowerCase();
      if (msg.includes('invalid refresh token')) {
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // ignore
        }
        return null;
      }
      throw sessionError;
    }

    const user = session?.user;
    if (!user) return null;

    let role: 'user' | 'owner' | 'admin' | undefined = undefined;
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      role = (profile as any)?.role;
    } catch {
      // ignore
    }

    return { ...user, role } as any;
  },

  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (session?.user) {
          let role: 'user' | 'owner' | 'admin' | undefined = undefined;
          try {
            const { data: profile } = await supabase
              .from('users')
              .select('role')
              .eq('id', session.user.id)
              .maybeSingle();
            role = (profile as any)?.role;
          } catch {
            // ignore
          }
          callback({
            id: session.user.id,
            email: session.user.email!,
            role,
          });
        } else {
          callback(null);
        }
      })();
    });
  },
};
