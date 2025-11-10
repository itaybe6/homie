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
  favorites?: string[]; // national IDs of favorited users
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
  partner_ids?: string[]; // national IDs of roommates associated to the apartment
  created_at: string;
  updated_at: string;
}


export interface ApartmentOwner {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  apartment_id?: string | null;
}

export interface Matches {
  id: string;
  sender_id: string;
  receiver_id: string;
  approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  sender_id: string;
  recipient_id: string;
  title: string;
  description: string;
  created_at: string;
}
