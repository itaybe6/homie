import { create } from 'zustand';
import { Apartment } from '@/types/database';

interface ApartmentState {
  apartments: Apartment[];
  selectedApartment: Apartment | null;
  isLoading: boolean;
  setApartments: (apartments: Apartment[]) => void;
  setSelectedApartment: (apartment: Apartment | null) => void;
  setLoading: (loading: boolean) => void;
  addApartment: (apartment: Apartment) => void;
  updateApartment: (apartment: Apartment) => void;
  removeApartment: (id: string) => void;
}

export const useApartmentStore = create<ApartmentState>((set) => ({
  apartments: [],
  selectedApartment: null,
  isLoading: false,
  setApartments: (apartments) => set({ apartments }),
  setSelectedApartment: (apartment) => set({ selectedApartment: apartment }),
  setLoading: (loading) => set({ isLoading: loading }),
  addApartment: (apartment) =>
    set((state) => ({ apartments: [...state.apartments, apartment] })),
  updateApartment: (apartment) =>
    set((state) => ({
      apartments: state.apartments.map((a) =>
        a.id === apartment.id ? apartment : a
      ),
    })),
  removeApartment: (id) =>
    set((state) => ({
      apartments: state.apartments.filter((a) => a.id !== id),
    })),
}));
