import { create } from 'zustand';

type UiState = {
  partnersFiltersOpen: boolean;
  openPartnersFilters: () => void;
  closePartnersFilters: () => void;
};

const STORE_KEY = '__homie_ui_store__';

export const useUiStore: ReturnType<typeof create<UiState>> =
  ((globalThis as any)[STORE_KEY] as any) ||
  (((globalThis as any)[STORE_KEY] = create<UiState>((set) => ({
    partnersFiltersOpen: false,
    openPartnersFilters: () => set({ partnersFiltersOpen: true }),
    closePartnersFilters: () => set({ partnersFiltersOpen: false }),
  }))) as any);

