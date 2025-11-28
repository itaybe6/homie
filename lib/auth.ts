import { AuthApiError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AuthUser {
  id: string;
  email: string;
  role?: 'user' | 'owner' | 'admin';
}

export const authService = {
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
      createProfile = true,
    } = params;

    // Try to sign up. If the user already exists (422), fall back to sign-in
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
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

    // Optionally ensure profile row exists (idempotent)
    if (createProfile) {
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
            }
          : {};

      const { error: profileError } = await supabase
        .from('users')
        .upsert(
          { ...baseProfile, ...extendedForRegularUser },
          { onConflict: 'id' }
        );

      if (profileError) throw profileError;
    }

    return { user: { id: userId, email: userEmail } } as any;
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
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

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
