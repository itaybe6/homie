import { create } from 'zustand';

interface NotificationsState {
	unreadCount: number;
	setUnreadCount: (count: number) => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
	unreadCount: 0,
	setUnreadCount: (count) => set({ unreadCount: count }),
}));




