import { supabase } from './supabase';

export interface AuthUser {
  id: string;
  email: string;
}

export const authService = {
  async signUp(email: string, password: string, fullName: string) {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('No user returned');

    const { error: profileError } = await supabase.from('users').insert({
      id: authData.user.id,
      email: authData.user.email!,
      full_name: fullName,
    });

    if (profileError) throw profileError;

    return authData;
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
