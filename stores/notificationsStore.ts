import { create } from 'zustand';

interface NotificationsState {
  unreadCount: number;
  /**
   * ISO timestamp of the last time the user opened the unified inbox (/notifications).
   * Used to count "new" requests/matches/invites (since those tables don't have is_read).
   */
  lastSeenAt: string | null;
  setUnreadCount: (count: number) => void;
  setLastSeenAt: (iso: string | null) => void;
  markSeenNow: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  unreadCount: 0,
  lastSeenAt: null,
  setUnreadCount: (count) => set({ unreadCount: count }),
  setLastSeenAt: (iso) => set({ lastSeenAt: iso }),
  markSeenNow: () => set({ lastSeenAt: new Date().toISOString(), unreadCount: 0 }),
}));




