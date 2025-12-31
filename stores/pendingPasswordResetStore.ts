import { create } from 'zustand';

export interface PendingPasswordResetData {
  email: string;
  otpVerified?: boolean;
}

interface PendingPasswordResetState {
  pending: PendingPasswordResetData | null;
  setPending: (data: PendingPasswordResetData) => void;
  clearPending: () => void;
}

export const usePendingPasswordResetStore = create<PendingPasswordResetState>((set) => ({
  pending: null,
  setPending: (data) => set({ pending: data }),
  clearPending: () => set({ pending: null }),
}));


