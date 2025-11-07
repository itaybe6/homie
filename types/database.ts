export interface User {
  id: string;
  email: string;
  full_name: string;
  age?: number;
  phone?: string;
  city?: string;
  bio?: string;
  avatar_url?: string;
  image_urls?: string[]; // up to 6 additional images
  created_at: string;
  updated_at: string;
}

export interface Apartment {
  id: string;
  owner_id: string;
  title: string;
  description?: string;
  address: string;
  city: string;
  neighborhood?: string;
  price: number;
  room_type: string;
  bedrooms: number;
  bathrooms: number;
  image_url?: string;
  image_urls?: string[]; // new: multiple images
  created_at: string;
  updated_at: string;
}

export interface ApartmentMember {
  // removed; kept for backward-compat notice
}

export interface ApartmentOwner {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  apartment_id?: string | null;
}
