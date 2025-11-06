export interface User {
  id: string;
  email: string;
  full_name: string;
  age?: number;
  bio?: string;
  interests?: string;
  avatar_url?: string;
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
  price: number;
  room_type: string;
  bedrooms: number;
  bathrooms: number;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ApartmentMember {
  id: string;
  apartment_id: string;
  user_id: string;
  role: 'owner' | 'roommate';
  joined_at: string;
}
