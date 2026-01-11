import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface NotificationsState {
  unreadCount: number;
  /**
   * ISO timestamp of the last time the user opened the unified inbox (/notifications),
   * stored per-user to avoid leaking state between accounts.
   * Used to count "new" requests/matches/invites (since those tables don't have is_read).
   */
  lastSeenAtByUserId: Record<string, string>;
  setUnreadCount: (count: number) => void;
  setLastSeenAtForUser: (userId: string, iso: string | null) => void;
  markSeenNow: (userId: string) => void;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      unreadCount: 0,
      lastSeenAtByUserId: {},
      setUnreadCount: (count) => set({ unreadCount: count }),
      setLastSeenAtForUser: (userId, iso) =>
        set((s) => {
          const next = { ...(s.lastSeenAtByUserId || {}) };
          if (!iso) delete next[userId];
          else next[userId] = iso;
          return { lastSeenAtByUserId: next };
        }),
      markSeenNow: (userId) =>
        set((s) => ({
          lastSeenAtByUserId: { ...(s.lastSeenAtByUserId || {}), [userId]: new Date().toISOString() },
          unreadCount: 0,
        })),
    }),
    {
      name: 'homie:notifications:v1',
      storage: createJSONStorage(() => AsyncStorage as any),
      // Only persist the "last seen" marker. `unreadCount` is computed live by the bell button.
      partialize: (state) => ({ lastSeenAtByUserId: state.lastSeenAtByUserId }),
    }
  )
);




