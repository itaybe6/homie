import { create } from 'zustand';

export type PendingSignupRole = 'user' | 'owner';

export interface PendingSignupData {
  email: string;
  password: string;
  fullName: string;
  role: PendingSignupRole;
  phone?: string;
  age?: number;
  bio?: string;
  gender?: 'male' | 'female';
  city?: string;
  avatarUrl?: string;
  instagramUrl?: string;
  /**
   * Local file URI selected during signup (e.g. file://...).
   * Uploaded after OTP verification when a session exists.
   */
  avatarLocalUri?: string;
}

interface PendingSignupState {
  pending: PendingSignupData | null;
  setPending: (data: PendingSignupData) => void;
  clearPending: () => void;
}

export const usePendingSignupStore = create<PendingSignupState>((set) => ({
  pending: null,
  setPending: (data) => set({ pending: data }),
  clearPending: () => set({ pending: null }),
}));


