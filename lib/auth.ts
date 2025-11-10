import { supabase } from './supabase';

export interface AuthUser {
  id: string;
  email: string;
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
    city?: string;
    avatarUrl?: string;
    createProfile?: boolean; // when false, do not upsert into users table
  }) {
    const {
      email,
      password,
      fullName,
      role,
      age,
      bio,
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
              // phone intentionally omitted unless schema guarantees it
              age: typeof age === 'number' ? age : null,
              bio: bio || null,
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
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getCurrentUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  },

  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (session?.user) {
          callback({
            id: session.user.id,
            email: session.user.email!,
          });
        } else {
          callback(null);
        }
      })();
    });
  },
};
