import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Image,
  Platform,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut, Edit, Save, X, Plus, MapPin, Inbox, Trash2, Settings, ClipboardList } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import { User, Apartment, UserSurveyResponse } from '@/types/database';


export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const apartments = useApartmentStore((state) => state.apartments);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [profile, setProfile] = useState<User | null>(null);
  const [userApartments, setUserApartments] = useState<Apartment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [aptMembers, setAptMembers] = useState<Record<string, User[]>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const [isAddingImage, setIsAddingImage] = useState(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [sharedGroups, setSharedGroups] = useState<
    { id: string; name?: string | null; members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }[]
  >([]);
  const [surveyResponse, setSurveyResponse] = useState<UserSurveyResponse | null>(null);

  const surveySheetMaxHeight = useMemo(() => {
    const hardMax = Math.max(420, Math.round(windowHeight * 0.88));
    // Keep a little space at the top so the sheet never "sticks" to full screen.
    const safeMax = Math.max(420, Math.round(windowHeight - (insets.top + 24)));
    return Math.min(hardMax, safeMax);
  }, [windowHeight, insets.top]);

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  // Removed deprecated interests field

  useEffect(() => {
    fetchProfile();
  }, [user]);

  // Re-fetch when the screen regains focus (after approvals/merges)
  useFocusEffect(
    (React as any).useCallback(() => {
      fetchProfile();
      return () => {};
    }, [user?.id])
  );

  // Subscribe to realtime membership changes for the current user and refresh
  useEffect(() => {
    if (!user?.id) return;
    try {
      const channel = supabase
        .channel(`profile-${user.id}-group-memberships`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profile_group_members', filter: `user_id=eq.${user.id}` },
          () => {
            fetchProfile();
          }
        )
        .subscribe();
      return () => {
        try { supabase.removeChannel(channel); } catch {}
      };
    } catch {
      // ignore
    }
  }, [user?.id]);
  const getApartmentPrimaryImage = (apartment: Apartment): string => {
    const PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';
    const anyValue: any = (apartment as any).image_urls;
    if (Array.isArray(anyValue) && anyValue[0]) return anyValue[0] as string;
    if (typeof anyValue === 'string') {
      try {
        const parsed = JSON.parse(anyValue);
        if (Array.isArray(parsed) && parsed[0]) return parsed[0] as string;
      } catch {
        try {
          const asArray = anyValue
            .replace(/^{|}$/g, '')
            .split(',')
            .map((s: string) => s.replace(/^"+|"+$/g, '').trim())
            .filter(Boolean);
          if (asArray[0]) return asArray[0] as string;
        } catch {}
      }
    }
    if (apartment.image_url) return apartment.image_url;
    return PLACEHOLDER;
  };

  const getObjectPathFromPublicUrl = (publicUrl: string): string | null => {
    if (!publicUrl) return null;
    const marker = '/object/public/user-images/';
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return publicUrl.substring(idx + marker.length);
  };

  const formatYesNo = (value?: boolean | null): string => {
    if (value === undefined || value === null) return '';
    return value ? 'כן' : 'לא';
  };

  const formatMonthLabel = (value?: string | null): string => {
    if (!value) return '';
    const [year, month] = value.split('-');
    if (year && month) {
      const yearNum = parseInt(year, 10);
      const monthNum = parseInt(month, 10) - 1;
      if (!Number.isNaN(yearNum) && !Number.isNaN(monthNum)) {
        const date = new Date(yearNum, monthNum, 1);
        if (!Number.isNaN(date.getTime())) {
          try {
            return date.toLocaleDateString('he-IL', { month: 'short', year: 'numeric' });
          } catch {
            return `${month}/${year.slice(-2)}`;
          }
        }
      }
    }
    return value;
  };

  const formatCurrency = (value?: number | null): string => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '';
    try {
      return new Intl.NumberFormat('he-IL', {
        style: 'currency',
        currency: 'ILS',
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `₪${value}`;
    }
  };

  const normalizeNeighborhoods = (value: any): string => {
    if (!value) return '';
    if (Array.isArray(value)) {
      return value.filter(Boolean).join(' • ');
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter(Boolean).join(' • ');
        }
      } catch {
        // fall through to cleanup
      }
      return value
        .replace(/[{}\[\]"]/g, ' ')
        .split(',')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(' • ');
    }
    return '';
  };

  const removeImageAt = async (idx: number) => {
    try {
      if (!user?.id || !profile?.image_urls) return;
      const url = profile.image_urls[idx];
      if (!url) return;

      const shouldProceed = await new Promise<boolean>((resolve) => {
        Alert.alert('מחיקת תמונה', 'למחוק את התמונה הזו?', [
          { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
          { text: 'מחק', style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
      if (!shouldProceed) return;

      setIsDeletingImage(true);
      const next = profile.image_urls.filter((_, i) => i !== idx);
      const { error: updateErr } = await supabase
        .from('users')
        .update({ image_urls: next, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateErr) throw updateErr;

      setProfile((prev) => (prev ? { ...prev, image_urls: next } as any : prev));
      setViewerIndex(null);

      try {
        const objectPath = getObjectPathFromPublicUrl(url);
        if (objectPath) {
          await supabase.storage.from('user-images').remove([objectPath]);
        }
      } catch {}
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן למחוק את התמונה');
    } finally {
      setIsDeletingImage(false);
    }
  };

  const fetchProfile = async () => {
    if (!user) {
      setSurveyResponse(null);
      setIsLoading(false);
      return;
    }

    setSurveyResponse(null);

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (profileData) {
        setProfile(profileData);
        setFullName(profileData.full_name);
        setAge(profileData.age?.toString() || '');
        setBio(profileData.bio || '');
      }

      let latestSurvey: UserSurveyResponse | null = null;
      try {
        const { data: surveyRows, error: surveyError } = await supabase
          .from('user_survey_responses')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (surveyError) throw surveyError;
        latestSurvey = (surveyRows && surveyRows[0]) || null;
      } catch (surveyErr) {
        console.error('Error fetching survey response:', surveyErr);
      }
      setSurveyResponse(latestSurvey);

      const [{ data: ownedApts, error: ownedError }, { data: partnerApts, error: partnerError }] =
        await Promise.all([
          supabase.from('apartments').select('*').eq('owner_id', user.id),
          supabase.from('apartments').select('*').contains('partner_ids', [user.id]),
        ]);

      if (ownedError) throw ownedError;
      if (partnerError) throw partnerError;

      const mergedById: Record<string, Apartment> = {};
      (ownedApts || []).forEach((apt: any) => {
        mergedById[apt.id] = apt;
      });
      (partnerApts || []).forEach((apt: any) => {
        mergedById[apt.id] = apt;
      });

      const mergedApts = Object.values(mergedById) as Apartment[];
      setUserApartments(mergedApts);

      // Load roommates (partners) avatars per apartment
      const membersMap: Record<string, User[]> = {};
      await Promise.all(
        mergedApts.map(async (apt: any) => {
          const ids = apt.partner_ids as string[] | undefined;
          if (ids && ids.length > 0) {
            const { data: usersData, error: usersError } = await supabase
              .from('users')
              .select('id, full_name, avatar_url')
              .in('id', ids);
            if (!usersError && usersData) {
              membersMap[apt.id] = usersData as any;
            }
          }
        })
      );
      setAptMembers(membersMap);

      // Load shared profile groups (compact view)
      try {
        const { data: membershipRows, error: membershipError } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE');
        if (membershipError) throw membershipError;
        const groupIds = (membershipRows || []).map((r: any) => r.group_id).filter(Boolean);
        if (!groupIds.length) {
          setSharedGroups([]);
        } else {
          const results: { id: string; name?: string | null; members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }[] = [];
          for (const gid of groupIds) {
            const { data: groupRow } = await supabase
              .from('profile_groups')
              .select('id,name,status')
              .eq('id', gid)
              .eq('status', 'ACTIVE')
              .maybeSingle();
            if (!groupRow) continue;
            const { data: memberRows } = await supabase
              .from('profile_group_members')
              .select('user_id')
              .eq('group_id', gid)
              .eq('status', 'ACTIVE');
            const memberIds = (memberRows || []).map((m: any) => m.user_id).filter(Boolean);
            if (!memberIds.length) continue;
            const { data: usersRows } = await supabase
              .from('users')
              .select('id, full_name, avatar_url')
              .in('id', memberIds);
            results.push({
              id: gid,
              name: (groupRow as any)?.name,
              members: ((usersRows || []) as any[]).filter(Boolean) as any,
            });
          }
          setSharedGroups(results);
        }
      } catch {
        setSharedGroups([]);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      Alert.alert('שגיאה', 'שם מלא הוא שדה חובה');
      return;
    }

    setIsSaving(true);

    try {
      const ageNum = age ? parseInt(age) : null;

      if (age && (isNaN(ageNum!) || ageNum! <= 0)) {
        Alert.alert('שגיאה', 'גיל לא תקין');
        setIsSaving(false);
        return;
      }

      const { error } = await supabase
        .from('users')
        .update({
          full_name: fullName,
          age: ageNum,
          bio: bio || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user!.id);

      if (error) throw error;

      Alert.alert('הצלחה', 'הפרופיל עודכן בהצלחה');
      setIsEditing(false);
      fetchProfile();
    } catch (error: any) {
      Alert.alert('שגיאה', error.message || 'לא ניתן לעדכן את הפרופיל');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (profile) {
      setFullName(profile.full_name);
      setAge(profile.age?.toString() || '');
      setBio(profile.bio || '');
    }
    setIsEditing(false);
  };

  const handleSignOut = async () => {
    try {
      if (Platform.OS === 'web') {
        const confirmed = typeof confirm === 'function' ? confirm('האם אתה בטוח שברצונך להתנתק?') : true;
        if (!confirmed) return;
        await authService.signOut();
        setUser(null);
        router.replace('/auth/login');
        return;
      }

      Alert.alert('התנתקות', 'האם אתה בטוח שברצונך להתנתק?', [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'התנתק',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.signOut();
              setUser(null);
              router.replace('/auth/login');
            } catch (error) {
              Alert.alert('שגיאה', 'לא ניתן להתנתק');
            }
          },
        },
      ]);
    } catch (error) {
      Alert.alert('שגיאה', 'לא ניתן להתנתק');
    }
  };

  const handleDeleteProfile = async () => {
    if (!user) return;
    try {
      if (Platform.OS === 'web') {
        const confirmed = typeof confirm === 'function' ? confirm('האם אתה בטוח/ה שברצונך למחוק את הפרופיל? פעולה זו אינה ניתנת לשחזור.') : true;
        if (!confirmed) return;
      } else {
        const shouldProceed = await new Promise<boolean>((resolve) => {
          Alert.alert('מחיקת פרופיל', 'האם אתה בטוח/ה שברצונך למחוק את הפרופיל? פעולה זו אינה ניתנת לשחזור.', [
            { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
            { text: 'מחק', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
        if (!shouldProceed) return;
      }

      setIsDeleting(true);
      const { error: deleteError } = await supabase.from('users').delete().eq('id', user.id);
      if (deleteError) throw deleteError;

      try {
        await authService.signOut();
      } catch {
        // ignore sign out failure after deletion; we'll still clear local state
      }
      setUser(null);
      router.replace('/auth/login');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן למחוק את הפרופיל כעת');
    } finally {
      setIsDeleting(false);
    }
  };

  const pickAndUploadAvatar = async () => {
    try {
      const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perms.granted) {
        Alert.alert('הרשאה נדרשת', 'יש לאפשר גישה לגלריה כדי להעלות תמונה');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length || !user) return;

      setIsSaving(true);
      const asset = result.assets[0];
      // Check image dimensions and only resize if larger than 800px
      const imageInfo = await ImageManipulator.manipulateAsync(asset.uri, []);
      const actions: ImageManipulator.Action[] = [];
      if (imageInfo.width > 800) {
        actions.push({ resize: { width: 800 } });
      }
      // Compress the image
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        actions,
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      const response = await fetch(compressed.uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileName = `${user.id}-${Date.now()}.jpg`;
      const filePath = `users/${user.id}/${fileName}`;
      // Use arrayBuffer on native (Blob/File may not exist)
      const filePayload: any = arrayBuffer as any;

      const { error: uploadError } = await supabase.storage
        .from('user-images')
        .upload(filePath, filePayload, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('user-images').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;

      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      Alert.alert('הצלחה', 'התמונה עודכנה');
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'לא ניתן להעלות תמונה');
    } finally {
      setIsSaving(false);
    }
  };

  // moved extra-photos upload to edit profile screen
  const addGalleryImage = async () => {
    try {
      const perms = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perms.granted) {
        Alert.alert('הרשאה נדרשת', 'יש לאפשר גישה לגלריה כדי להעלות תמונה');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled || !result.assets?.length || !user || !profile) return;

      setIsAddingImage(true);
      const asset = result.assets[0];
      // Check image dimensions and only resize if larger than 1200px
      const imageInfo = await ImageManipulator.manipulateAsync(asset.uri, []);
      const actions: ImageManipulator.Action[] = [];
      if (imageInfo.width > 1200) {
        actions.push({ resize: { width: 1200 } });
      }
      // Compress the image
      const compressed = await ImageManipulator.manipulateAsync(
        asset.uri,
        actions,
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      const response = await fetch(compressed.uri);
      const arrayBuffer = await response.arrayBuffer();
      const fileName = `${user.id}-${Date.now()}.jpg`;
      const filePath = `users/${user.id}/gallery/${fileName}`;
      const filePayload: any = arrayBuffer as any;

      const { error: uploadError } = await supabase.storage
        .from('user-images')
        .upload(filePath, filePayload, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('user-images').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      const next = [...(profile.image_urls || []), publicUrl];
      const { error: updateError } = await supabase
        .from('users')
        .update({ image_urls: next, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;

      setProfile((prev) => (prev ? { ...prev, image_urls: next } as any : prev));
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן להוסיף תמונה');
    } finally {
      setIsAddingImage(false);
    }
  };

  const surveyHighlights = useMemo(() => {
    if (!surveyResponse) return [];
    const highlights: { label: string; value: string }[] = [];
    const push = (label: string, raw?: string) => {
      if (!raw) return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      highlights.push({ label, value: trimmed });
    };

    push('עיר מועדפת', surveyResponse.preferred_city || undefined);
    if (typeof surveyResponse.price_range === 'number') {
      const formatted = formatCurrency(surveyResponse.price_range);
      push('תקציב חודשי', formatted);
    }
    push('כניסה מתוכננת', formatMonthLabel(surveyResponse.move_in_month));
    push('וייב יומיומי', surveyResponse.lifestyle || surveyResponse.home_vibe || undefined);
    if (surveyResponse.is_sublet) {
      highlights.push({ label: 'סאבלט', value: 'כן' });
    }

    return highlights.slice(0, 4);
  }, [surveyResponse]);

  const surveyItems = useMemo(() => {
    if (!surveyResponse) return [];
    const items: { label: string; value: string }[] = [];

    const add = (label: string, raw?: string | number | null) => {
      if (raw === undefined || raw === null) return;
      const value =
        typeof raw === 'string'
          ? raw.trim()
          : typeof raw === 'number' && Number.isFinite(raw)
            ? `${raw}`
            : '';
      if (!value) return;
      items.push({ label, value });
    };

    const addBool = (label: string, raw?: boolean | null) => {
      const formatted = formatYesNo(raw);
      if (!formatted) return;
      items.push({ label, value: formatted });
    };

    add('עיסוק', surveyResponse.occupation);
    if (typeof surveyResponse.student_year === 'number' && surveyResponse.student_year > 0) {
      add('שנת לימודים', `שנה ${surveyResponse.student_year}`);
    }
    addBool('עבודה מהבית', surveyResponse.works_from_home);
    addBool('שומר/ת כשרות', surveyResponse.keeps_kosher);
    addBool('שומר/ת שבת', surveyResponse.is_shomer_shabbat);
    add('תזונה', surveyResponse.diet_type);
    addBool('מעשן/ת', surveyResponse.is_smoker);
    add('מצב זוגי', surveyResponse.relationship_status);
    addBool('חיית מחמד בבית', surveyResponse.has_pet);
    if (typeof surveyResponse.cleanliness_importance === 'number') {
      add('חשיבות ניקיון', `${surveyResponse.cleanliness_importance}/5`);
    }
    add('תדירות ניקיון', surveyResponse.cleaning_frequency);
    add('העדפת אירוח', surveyResponse.hosting_preference);
    add('סטייל בישול', surveyResponse.cooking_style);
    add('וייב בבית', surveyResponse.home_vibe);
    addBool('תת-השכרה', surveyResponse.is_sublet);
    if (surveyResponse.sublet_month_from || surveyResponse.sublet_month_to) {
      const period = [formatMonthLabel(surveyResponse.sublet_month_from), formatMonthLabel(surveyResponse.sublet_month_to)]
        .filter(Boolean)
        .join(' → ');
      add('טווח סאבלט', period);
    }
    if (typeof surveyResponse.price_range === 'number') {
      add('תקציב שכירות', formatCurrency(surveyResponse.price_range));
    }
    addBool('חשבונות כלולים', surveyResponse.bills_included);
    add('עיר מועדפת', surveyResponse.preferred_city);
    const neighborhoodsJoined = normalizeNeighborhoods((surveyResponse.preferred_neighborhoods as unknown) ?? null);
    if (neighborhoodsJoined) {
      add('שכונות מועדפות', neighborhoodsJoined);
    }
    add('קומה מועדפת', surveyResponse.floor_preference);
    addBool('מרפסת', surveyResponse.has_balcony);
    addBool('מעלית', surveyResponse.has_elevator);
    addBool('חדר מאסטר', surveyResponse.wants_master_room);
    add('חודש כניסה', formatMonthLabel(surveyResponse.move_in_month));
    if (typeof surveyResponse.preferred_roommates === 'number') {
      add('מספר שותפים מועדף', `${surveyResponse.preferred_roommates}`);
    }
    addBool('חיות מורשות', surveyResponse.pets_allowed);
    addBool('עם מתווך', surveyResponse.with_broker);
    add('טווח גילאים רצוי', surveyResponse.preferred_age_range);
    add('מגדר שותפים', surveyResponse.preferred_gender);
    add('עיסוק שותפים', surveyResponse.preferred_occupation);
    add('שותפים ושבת', surveyResponse.partner_shabbat_preference);
    add('שותפים ותזונה', surveyResponse.partner_diet_preference);
    add('שותפים ועישון', surveyResponse.partner_smoking_preference);
    add('שותפים וחיות', surveyResponse.partner_pets_preference);

    return items;
  }, [surveyResponse]);

  const surveySubtitle = useMemo(() => {
    if (!surveyResponse || !surveyHighlights.length) {
      return 'לחיצה להצגת סיכום ההעדפות';
    }
    const values = surveyHighlights.map((h) => h.value).filter(Boolean);
    return values.slice(0, 2).join(' • ') || 'לחיצה להצגת סיכום ההעדפות';
  }, [surveyResponse, surveyHighlights]);

  const surveyStatusLabel = surveyResponse
    ? surveyResponse.is_completed
      ? 'הסקר הושלם'
      : 'בטיוטה'
    : 'טרם מולא';
  const surveyStatusStyle = surveyResponse
    ? surveyResponse.is_completed
      ? styles.surveyBadgeSuccess
      : styles.surveyBadgePending
    : styles.surveyBadgeMuted;

  const isSurveyCompleted = !!surveyResponse?.is_completed;

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4C1D95" />
      </View>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ padding: 16, alignItems: 'center', gap: 12 }}>
          <Text style={{ color: '#111827', fontSize: 18, fontWeight: '800', textAlign: 'right', alignSelf: 'stretch' }}>לא מחובר/ת</Text>
          <Text style={{ color: '#6B7280', textAlign: 'right', alignSelf: 'stretch' }}>
            כדי לראות את הפרופיל שלך, יש להתחבר או להירשם.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/auth/login')}
            style={{ backgroundColor: '#4C1D95', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>כניסה / הרשמה</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={[
          styles.scrollContent,
          {
            // add top spacer so the global top bar won't overlap the photo
            paddingTop: 60,
            paddingBottom: Math.max(220, 120 + insets.bottom),
          },
        ]}>

        {!isEditing ? (
          <View style={styles.profileCard}>
            <View style={styles.photoWrap}>
              <Image
                source={{
                  uri:
                    profile?.avatar_url ||
                    'https://cdn-icons-png.flaticon.com/512/847/847969.png',
                }}
                style={styles.photo}
              />
              <LinearGradient
                colors={["rgba(0,0,0,0.0)", "rgba(0,0,0,0.6)"]}
                style={styles.photoBottomGradient}
              />

              <TouchableOpacity
                style={styles.settingsBtn}
                onPress={() => router.push('/(tabs)/profile/settings')}
                activeOpacity={0.9}
              >
                <Settings size={18} color="#FFFFFF" />
              </TouchableOpacity>

              {!profile?.avatar_url ? (
                <TouchableOpacity style={styles.addPhotoBtn} onPress={pickAndUploadAvatar} activeOpacity={0.9} disabled={isSaving}>
                  <Plus size={20} color="#FFFFFF" />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.infoPanel}>
              <Text style={styles.nameText}>
                {profile?.full_name || 'משתמש/ת'}
              </Text>
              {(profile?.address || profile?.city) ? (
                <View style={styles.locationRow}>
                  <MapPin size={16} color="#6B7280" style={{ marginLeft: 6 }} />
                  <Text style={styles.locationText}>
                    {profile?.address || profile?.city}
                  </Text>
                </View>
              ) : null}
              {profile?.age ? (
                <Text style={styles.ageText}>גיל {profile.age}</Text>
              ) : null}

              {profile?.bio ? (
                <Text style={styles.bioText}>{profile.bio}</Text>
              ) : null}

              {/* per design, action buttons moved to settings screen */}

              {/* gallery grid moved to its own section below */}
            </View>
          </View>
        ) : (
          <View style={styles.editCard}>
            <View style={styles.editHeaderRow}>
              <Text style={styles.editTitle}>עריכת פרופיל</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancelEdit} disabled={isSaving}>
                  <X size={20} color="#9DA4AE" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile} disabled={isSaving}>
                  {isSaving ? <ActivityIndicator size="small" color="#FFF" /> : <Save size={20} color="#FFF" />}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>שם מלא</Text>
                <TextInput style={styles.input} value={fullName} onChangeText={setFullName} editable={!isSaving} />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>גיל</Text>
                <TextInput
                  style={styles.input}
                  value={age}
                  onChangeText={setAge}
                  keyboardType="numeric"
                  placeholder="לא חובה"
                  editable={!isSaving}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>אודות</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={bio}
                  onChangeText={setBio}
                  multiline
                  numberOfLines={4}
                  placeholder="ספר/י קצת על עצמך..."
                  editable={!isSaving}
                />
              </View>
            </View>
          </View>
        )}

        {/* Shared profile (if any) */}
        {sharedGroups.length > 0 && (
          <View style={styles.sectionDark}>
            <Text style={styles.sectionTitleDark}>
              {sharedGroups.length > 1 ? 'פרופילים משותפים' : 'פרופיל משותף'}
            </Text>
            {sharedGroups.map((g) => (
              <View key={g.id} style={styles.sharedCard}>
                <View style={styles.sharedAvatarsRow}>
                  {g.members.map((m) => (
                    <View key={m.id} style={styles.sharedAvatarWrap}>
                      <Image
                        source={{ uri: m.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                        style={styles.sharedAvatar}
                      />
                    </View>
                  ))}
                </View>
                <Text style={styles.sharedMembersLine} numberOfLines={2}>
                  {g.members.map((m) => m.full_name || 'חבר').join(' • ')}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Gallery section */}
        <View style={styles.sectionDark}>
          <View style={styles.galleryHeaderRow}>
            <Text style={styles.galleryHeaderTitle}>תמונות</Text>
            <Text style={styles.galleryCountText}>{(profile?.image_urls?.length || 0)}/6</Text>
          </View>
          <View style={styles.galleryCard}>
            {profile?.image_urls?.length ? (
              <View style={styles.galleryGrid}>
                {profile.image_urls.map((url, idx) => (
                  <TouchableOpacity
                    key={url + idx}
                    style={styles.galleryItem}
                    activeOpacity={0.9}
                    onPress={() => setViewerIndex(idx)}
                  >
                    <Image source={{ uri: url }} style={styles.galleryImg} />
                  </TouchableOpacity>
                ))}
                {profile.image_urls.length < 6 && (
                  <TouchableOpacity
                    style={[styles.galleryAddTile, isAddingImage && { opacity: 0.75 }]}
                    onPress={isAddingImage ? undefined : addGalleryImage}
                    activeOpacity={0.9}
                  >
                    <Plus size={18} color="#4C1D95" />
                    <Text style={styles.galleryAddTileText}>הוסף</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.galleryGrid}>
                <TouchableOpacity
                  style={[styles.galleryAddTile, isAddingImage && { opacity: 0.75 }]}
                  onPress={isAddingImage ? undefined : addGalleryImage}
                  activeOpacity={0.9}
                >
                  <Plus size={18} color="#4C1D95" />
                  <Text style={styles.galleryAddTileText}>הוסף</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {userApartments.length > 0 && (
          <View style={styles.sectionDark}>
            <Text style={styles.sectionTitleDark}>הדירות שלי</Text>
            {userApartments.map((apt) => {
              const thumb = getApartmentPrimaryImage(apt);
              return (
                <TouchableOpacity
                  key={apt.id}
                  style={styles.apartmentRow}
                  onPress={() => router.push({ pathname: '/apartment/[id]', params: { id: apt.id } })}
                >
                  <Image source={{ uri: thumb }} style={styles.aptThumb} />
                  <View style={styles.aptTextWrap}>
                    <Text style={styles.aptTitle} numberOfLines={1}>{apt.title}</Text>
                    <Text style={styles.aptSub} numberOfLines={1}>
                      {([apt.city, (apt as any).address].filter(Boolean) as string[]).join(' • ')}
                    </Text>
                    <Text style={styles.aptPricePurple}>₪{apt.price}/חודש</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={styles.sectionDark}>
          <TouchableOpacity
            style={styles.surveyCTA}
            activeOpacity={0.9}
            onPress={() => {
              if (isSurveyCompleted) {
                setIsSurveyOpen(true);
              } else {
                router.push('/(tabs)/onboarding/survey' as any);
              }
            }}
          >
            {profile ? (
              <LinearGradient
                colors={['#A78BFA', '#4C1D95']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.surveyCTAAvatarRing}
              >
                <View style={styles.surveyCTAAvatarInner}>
                  <Image
                    source={{ uri: profile.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                    style={styles.surveyCTAAvatar}
                  />
                </View>
              </LinearGradient>
            ) : null}
            <View style={styles.surveyCTATexts}>
              <Text style={styles.surveyCTATitle}>
                {isSurveyCompleted ? 'תוצאות הסקר' : 'מילוי שאלון'}
              </Text>
              <Text style={styles.surveyCTASubtitle} numberOfLines={1}>
                {isSurveyCompleted ? surveySubtitle : 'לחיצה למילוי שאלון ההעדפות'}
              </Text>
            </View>
            <View style={styles.surveyCTABadge}>
              <LinearGradient
                colors={['#A78BFA', '#4C1D95']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.surveyCTABadgeInner}
              >
                <ClipboardList size={24} color="#FFFFFF" />
              </LinearGradient>
            </View>
          </TouchableOpacity>
          {!isSurveyCompleted && (
            <Text style={styles.surveyCTAHint}>
              מלא/י את השאלון כדי שנוכל לחפש לך התאמות טובות יותר.
            </Text>
          )}
        </View>

        {/* moved logout and delete actions to /profile/settings */}
      </ScrollView>
      {viewerIndex !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setViewerIndex(null)}
        >
          <View style={styles.viewerOverlay}>
            <TouchableOpacity
              style={[styles.viewerCloseBtn, { top: 36 + insets.top }]}
              onPress={() => setViewerIndex(null)}
              activeOpacity={0.9}
            >
              <X size={18} color="#E5E7EB" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewerDeleteBtn, { top: 36 + insets.top }]}
              onPress={() => {
                if (viewerIndex !== null) removeImageAt(viewerIndex);
              }}
              disabled={isDeletingImage}
              activeOpacity={0.9}
            >
              {isDeletingImage ? (
                <ActivityIndicator size="small" color="#F87171" />
              ) : (
                <Trash2 size={18} color="#F87171" />
              )}
            </TouchableOpacity>
            {viewerIndex !== null && (
              <Image
                source={{ uri: profile?.image_urls?.[viewerIndex] || '' }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>
      )}
      <Modal visible={isSurveyOpen} animationType="slide" transparent onRequestClose={() => setIsSurveyOpen(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setIsSurveyOpen(false)} />
          <View style={[styles.sheet, { height: surveySheetMaxHeight }]}>
            <View style={styles.sheetHandleWrap}>
              <View style={styles.sheetHandle} />
            </View>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>סיכום ההעדפות</Text>
              <TouchableOpacity onPress={() => setIsSurveyOpen(false)} style={styles.closeBtn}>
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={[styles.sheetContent, { paddingBottom: 16 + (insets.bottom || 0) }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {!!surveyHighlights.length && (
                <View style={styles.surveyHighlightsRow}>
                  {surveyHighlights.map((item) => (
                    <View key={`${item.label}-${item.value}`} style={styles.surveyHighlightPill}>
                      <Text style={styles.surveyHighlightLabel}>{item.label}</Text>
                      <Text style={styles.surveyHighlightValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              )}
              {surveyResponse ? (
                surveyItems.length ? (
                  <View style={styles.surveyGrid}>
                    {surveyItems.map((item) => (
                      <View key={`${item.label}-${item.value}`} style={styles.surveyCell}>
                        <Text style={styles.surveyCellLabel}>{item.label}</Text>
                        <Text style={styles.surveyCellValue}>{item.value}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.surveyEmptyState}>
                    <Text style={styles.surveyEmptyText}>
                      סקר ההעדפות הושלם אך אין עדיין נתונים להצגה.
                    </Text>
                  </View>
                )
              ) : (
                <View style={styles.surveyEmptyState}>
                  <Text style={styles.surveyEmptyText}>
                    ברגע שתמלא/י את סקר ההעדפות נציג כאן את ההתאמות האישיות שלך.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {(isSaving || isAddingImage) && (
        <View style={styles.fullScreenLoader}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    writingDirection: 'rtl',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 120,
  },
  headerGradient: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  profileCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  photoWrap: {
    position: 'relative',
    backgroundColor: '#F3F4F6',
  },
  photo: {
    width: '100%',
    height: 360,
  },
  photoBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  fullScreenLoader: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  addPhotoBtn: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4C1D95',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtn: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4C1D95',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '92%',
    height: '70%',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  viewerDeleteBtn: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(248,113,113,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  viewerCloseBtn: {
    position: 'absolute',
    left: 16,
    top: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  matchBadgeWrap: {
    // removed (badge no longer displayed)
  },
  matchBadgeCircle: {
    // removed
  },
  matchBadgeText: {
    // removed
  },
  whyMatchWrap: {
    // removed (moved below image)
  },
  whyMatchTitle: {
    // removed
  },
  whyChip: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  whyChipText: {
    color: '#1F2937',
    fontWeight: '700',
    fontSize: 13,
  },
  infoPanel: {
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  nameText: {
    color: '#111827',
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 6,
    textAlign: 'right',
  },
  locationRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationText: {
    color: '#6B7280',
    fontSize: 16,
    textAlign: 'right',
  },
  ageText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 8,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  tagChip: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  tagText: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  whyInlineWrap: {
    marginBottom: 8,
  },
  whyInlineTitle: {
    color: '#111827',
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'right',
  },
  bioText: {
    color: '#6B7280',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 8,
    textAlign: 'right',
  },
  seeMoreText: {
    color: '#111827',
    fontWeight: '800',
    textAlign: 'right',
  },

  // actions for gallery moved to edit screen
  galleryGrid: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
  },
  galleryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  galleryHeaderRow: {
    marginTop: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
  },
  galleryHeaderTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  galleryCountText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  galleryAddBtn: {
    backgroundColor: '#4C1D95',
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  galleryAddBtnDisabled: {
    opacity: 0.75,
  },
  galleryEmptyText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'right',
    paddingVertical: 16,
  },
  galleryItem: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  galleryAddTile: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 18,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#A78BFA',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  galleryAddTileText: {
    marginTop: 6,
    color: '#4C1D95',
    fontWeight: '800',
    fontSize: 12,
  },
  galleryItemTall: {
    aspectRatio: 0.8,
    borderRadius: 22,
  },
  galleryImg: {
    width: '100%',
    height: '100%',
  },

  editCard: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  editHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  editTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    padding: 8,
  },
  saveButton: {
    backgroundColor: '#4C1D95',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    color: '#111827',
    textAlign: 'right',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  sectionDark: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  sectionTitleDark: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
    textAlign: 'right',
  },
  surveyCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  surveyHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  surveyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  surveyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#EFEAFE',
    borderColor: '#E5E7EB',
  },
  surveyBadgeText: {
    color: '#4C1D95',
    fontSize: 12,
    fontWeight: '800',
  },
  surveyBadgeSuccess: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.25)',
  },
  surveyBadgePending: {
    backgroundColor: 'rgba(250,204,21,0.12)',
    borderColor: 'rgba(250,204,21,0.25)',
  },
  surveyBadgeMuted: {
    backgroundColor: 'rgba(148,163,184,0.12)',
    borderColor: 'rgba(148,163,184,0.25)',
  },
  surveyHighlightsRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  surveyHighlightPill: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '48%',
  },
  surveyHighlightLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 2,
    textAlign: 'right',
    fontWeight: '600',
  },
  surveyHighlightValue: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  surveyGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 12,
  },
  surveyCell: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '48%',
  },
  surveyCellLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 6,
    textAlign: 'right',
    fontWeight: '600',
  },
  surveyCellValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
    lineHeight: 20,
  },
  surveyEmptyState: {
    paddingVertical: 18,
    paddingHorizontal: 4,
    gap: 8,
  },
  surveyEmptyText: {
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
  },
  surveyCTA: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  surveyCTATexts: {
    flex: 1,
    marginRight: 8,
  },
  surveyCTATitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    marginBottom: 4,
  },
  surveyCTASubtitle: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'right',
  },
  surveyCTAHint: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
    alignSelf: 'stretch',
  },
  surveyCTABadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  surveyCTABadgeInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4C1D95',
    shadowColor: '#4C1D95',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalBackdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheetHandleWrap: {
    paddingTop: 10,
    paddingBottom: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  sheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  sheetTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4C1D95',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  surveyCTAAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginLeft: 0,
  },
  surveyCTAAvatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  surveyCTAAvatarInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 12,
    marginTop: 4,
    alignItems: 'center',
  },
  sharedAvatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  sharedAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
  },
  sharedAvatar: {
    width: '100%',
    height: '100%',
  },
  sharedMembersLine: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'right',
  },
  apartmentRow: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    minHeight: 120,
  },
  aptThumb: {
    width: 120,
    height: 90,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  aptTextWrap: {
    flex: 1,
    gap: 6,
  },
  aptTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'right',
  },
  aptSub: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'right',
  },
  aptAvatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  aptAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  aptPricePill: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  aptPriceText: {
    color: '#22C55E',
    fontWeight: '900',
    fontSize: 13,
  },
  aptPricePurple: {
    color: '#4C1D95',
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'right',
    marginTop: 6,
  },
  actionButtonsRow: {
    marginTop: 10,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  editProfileBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editProfileBtnText: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 14,
  },
  // removed sign out & delete button styles (moved to settings)

  bottomActions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  actionCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionNo: {
    shadowColor: '#EF4444',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  actionStar: {
    shadowColor: '#7C3AED',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  actionYes: {
    shadowColor: '#10B981',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
});
