export interface User {
  id: string;
  email: string;
  full_name: string;
  role?: 'user' | 'owner' | 'admin';
  age?: number;
  phone?: string;
  city?: string;
  address?: string;
  bio?: string;
  gender?: 'male' | 'female';
  avatar_url?: string;
  instagram_url?: string;
  image_urls?: string[]; // up to 6 additional images
  favorites?: string[]; // national IDs of favorited users
  likes?: string[]; // IDs of apartments the user has liked
  created_at: string;
  updated_at: string;
}

// Merged profile (roommate group) types
export type ProfileGroupStatus = 'PENDING' | 'ACTIVE' | 'CANCELLED' | 'ARCHIVED';

export interface ProfileGroup {
  id: string;
  created_by: string;
  status: ProfileGroupStatus;
  name?: string;
  created_at: string;
  updated_at: string;
}

export type ProfileGroupMemberRole = 'owner' | 'member';
export type ProfileGroupMemberStatus = 'ACTIVE' | 'LEFT' | 'REMOVED';

export interface ProfileGroupMember {
  group_id: string;
  user_id: string;
  role: ProfileGroupMemberRole;
  status: ProfileGroupMemberStatus;
  joined_at: string;
}

export type ProfileGroupInviteStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface ProfileGroupInvite {
  id: string;
  group_id: string;
  inviter_id: string;
  invitee_id: string;
  status: ProfileGroupInviteStatus;
  created_at: string;
  responded_at?: string;
  expires_at?: string;
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
  bedrooms: number;
  bathrooms: number;
  roommate_capacity?: number;
  image_url?: string; // legacy: single image url (some environments still use it)
  image_urls?: string[]; // new: multiple images
  partner_ids?: string[]; // national IDs of roommates associated to the apartment
  join_passcode?: string | null; // 6-digit code used to join the apartment

  // Apartment details (פרטי דירה)
  apartment_type?: 'REGULAR' | 'GARDEN'; // סוג הדירה
  square_meters?: number; // מטר מרובע של הדירה
  floor?: number; // קומה
  garden_square_meters?: number; // מטר מרובע של הגינה (רק אם apartment_type === 'GARDEN')

  // Property features (מאפייני הנכס)
  balcony_count?: number; // 0-3
  wheelchair_accessible?: boolean; // גישה לנכים
  has_air_conditioning?: boolean; // מיזוג
  has_bars?: boolean; // סורגים
  has_solar_heater?: boolean; // דוד שמש
  is_furnished?: boolean; // ריהוט
  has_safe_room?: boolean; // ממ"ד
  is_renovated?: boolean; // משופצת
  pets_allowed?: boolean; // חיות מחמד
  has_elevator?: boolean; // מעלית
  kosher_kitchen?: boolean; // מטבח כשר

  // Move-in availability (זמינות כניסה)
  move_in_date?: string | null; // YYYY-MM-DD

  created_at: string;
  updated_at: string;
}



export type MatchStatus = 'PENDING' | 'APPROVED' | 'NOT_RELEVANT' | 'REJECTED' | 'CANCELLED';

export interface Matches {
  id: string;
  sender_id: string;
  receiver_id: string;
  // Optional group association fields:
  // - receiver_group_id: request was targeted at a group
  // - sender_group_id: request was sent by a user who is part of a group
  receiver_group_id?: string | null;
  sender_group_id?: string | null;
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

// apartments_request table
export type ApartmentRequestType = 'JOIN_APT' | 'GENERAL';
export type ApartmentRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface ApartmentRequest {
  id: string;
  sender_id: string;
  recipient_id: string;
  apartment_id?: string;
  type: ApartmentRequestType;
  status: ApartmentRequestStatus;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface UserSurveyResponse {
  id: number;
  user_id: string;
  is_completed?: boolean;
  draft_step_key?: string | null;
  is_sublet?: boolean;
  occupation?: string;
  student_year?: number; // if occupation === 'student', 1–8
  keeps_kosher?: boolean; // does the user eat kosher only
  is_shomer_shabbat?: boolean;
  diet_type?: string;
  is_smoker?: boolean;
  relationship_status?: string;
  has_pet?: boolean;
  home_lifestyle?: string; // merged from lifestyle + home_vibe
  cleanliness_importance?: number; // 1–5
  cleaning_frequency?: string;
  hosting_preference?: string;
  cooking_style?: string;
  price_range?: number;
  // Tri-state preferences: true/false/null (null = "לא משנה לי")
  preferred_city?: string;
  preferred_neighborhoods?: string[];
  floor_preference?: string;
  has_balcony?: boolean | null;
  move_in_month?: string;
  preferred_roommates?: number; // legacy single value (kept for backwards compat)
  preferred_roommates_min?: number | null;
  preferred_roommates_max?: number | null;
  pets_allowed?: boolean; // whether the user wants an apartment that allows pets
  sublet_month_from?: string; // format: YYYY-MM
  sublet_month_to?: string;   // format: YYYY-MM
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
