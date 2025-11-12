export interface User {
  id: string;
  email: string;
  full_name: string;
  role?: 'user' | 'owner' | 'admin';
  age?: number;
  phone?: string;
  city?: string;
  bio?: string;
  gender?: 'male' | 'female';
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



export type MatchStatus = 'PENDING' | 'APPROVED' | 'NOT_RELEVANT' | 'REJECTED';

export interface Matches {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: MatchStatus;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  sender_id: string;
  recipient_id: string;
  title: string;
  description: string;
  is_read?: boolean;
  created_at: string;
}

export interface Request {
  id: string;
  sender_id: string;        // who initiated the request
  recipient_id: string;     // who should act on the request
  apartment_id?: string;    // optional: apartment this request relates to
  type: 'JOIN_APT' | 'GENERAL'; // request type
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  metadata?: any;           // free-form context
  created_at: string;
  updated_at: string;
}

export interface UserSurveyResponse {
  id: number;
  user_id: string;
  is_completed?: boolean;
  occupation?: string;
  student_year?: number; // if occupation === 'student', 1–8
  works_from_home?: boolean; // if occupation === 'עובד'
  keeps_kosher?: boolean; // does the user eat kosher only
  is_shomer_shabbat?: boolean;
  diet_type?: string;
  is_smoker?: boolean;
  relationship_status?: string;
  has_pet?: boolean;
  lifestyle?: string;
  cleanliness_importance?: number; // 1–5
  cleaning_frequency?: string;
  hosting_preference?: string;
  cooking_style?: string;
  home_vibe?: string;
  price_range?: number;
  bills_included?: boolean;
  preferred_city?: string;
  preferred_neighborhoods?: string[];
  floor_preference?: string;
  has_balcony?: boolean;
  has_elevator?: boolean;
  wants_master_room?: boolean;
  move_in_month?: string;
  preferred_roommates?: number;
  pets_allowed?: boolean;
  with_broker?: boolean;
  sublet_dates?: string;
  sublet_pets_allowed?: boolean;
  sublet_people_count?: number;
  sublet_price?: number;
  sublet_location?: string;
  sublet_floor?: string;
  sublet_balcony?: boolean;
  sublet_elevator?: boolean;
  sublet_master_room?: boolean;
  preferred_age_range?: string;
  preferred_gender?: string;
  preferred_occupation?: string;
  partner_shabbat_preference?: string;
  partner_diet_preference?: string;
  partner_smoking_preference?: string;
  partner_pets_preference?: string;

  created_at: string;
  updated_at: string;
}
