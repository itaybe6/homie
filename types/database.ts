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
  room_type: string;
  bedrooms: number;
  bathrooms: number;
  roommate_capacity?: number;
  image_urls?: string[]; // new: multiple images
  partner_ids?: string[]; // national IDs of roommates associated to the apartment

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
  is_sublet?: boolean;
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
