import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  ScrollView,
  TextInput,
  Animated,
  Easing,
} from 'react-native';
import KeyboardAwareScrollView from 'react-native-keyboard-aware-scroll-view/lib/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Edit, FileText, LogOut, Trash2, ChevronLeft, MapPin, UserPlus2, X, Home, Plus, User as UserIcon, Mail, Phone, Hash, Calendar } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Apartment, User } from '@/types/database';
import { upsertUserSurvey } from '@/lib/survey';
import { getNeighborhoodsForCityName } from '@/lib/neighborhoods';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export default function ProfileSettingsScreen() {
  const ICON_COLOR = '#5e3f2d';
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [profile, setProfile] = useState<User | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [hasSharedProfiles, setHasSharedProfiles] = useState(false);
  const [showSharedModal, setShowSharedModal] = useState(false);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [leavingGroupId, setLeavingGroupId] = useState<string | null>(null);
  const [sharedGroups, setSharedGroups] = useState<
    { id: string; name?: string | null; members: Pick<User, 'id' | 'full_name' | 'avatar_url'>[] }[]
  >([]);
  // My apartment modal state
  const [showAptModal, setShowAptModal] = useState(false);
  const [aptLoading, setAptLoading] = useState(false);
  const [myApartment, setMyApartment] = useState<Apartment | null>(null);
  const [aptOwner, setAptOwner] = useState<User | null>(null);
  const [aptMembers, setAptMembers] = useState<User[]>([]);
  const [isLeavingApartment, setIsLeavingApartment] = useState(false);
  // Edit profile bottom sheet state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  // Animation values for edit sheet
  const sheetTranslateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Terms modal state + animations
  const [showTermsModal, setShowTermsModal] = useState(false);
  const termsTranslateY = useRef(new Animated.Value(600)).current;
  const termsBackdropOpacity = useRef(new Animated.Value(0)).current;
  // Survey modal (currently not exposed via UI)
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const surveyTranslateY = useRef(new Animated.Value(600)).current;
  const surveyBackdropOpacity = useRef(new Animated.Value(0)).current;
  const [surveyCity, setSurveyCity] = useState('');
  const [surveyPrice, setSurveyPrice] = useState('');
  const [surveyMoveIn, setSurveyMoveIn] = useState(''); // YYYY-MM
  const [surveyIsSublet, setSurveyIsSublet] = useState(false);
  const [surveySaving, setSurveySaving] = useState(false);
  // Extra survey fields
  const [surveyNeighborhoods, setSurveyNeighborhoods] = useState('');
  const [surveyRoommatesMin, setSurveyRoommatesMin] = useState<string>('');
  const [surveyRoommatesMax, setSurveyRoommatesMax] = useState<string>('');
  const [surveyBillsIncluded, setSurveyBillsIncluded] = useState<boolean | null>(null);
  const [surveyHasBalcony, setSurveyHasBalcony] = useState<boolean | null>(null);
  const [surveyHasElevator, setSurveyHasElevator] = useState<boolean | null>(null);
  const [surveyWantsMasterRoom, setSurveyWantsMasterRoom] = useState<boolean | null>(null);
  const [surveyWithBroker, setSurveyWithBroker] = useState<boolean | null>(null);
  const [surveyWorksFromHome, setSurveyWorksFromHome] = useState(false);
  const [surveyKeepsKosher, setSurveyKeepsKosher] = useState(false);
  const [surveyIsShomerShabbat, setSurveyIsShomerShabbat] = useState(false);
  const [surveyIsSmoker, setSurveyIsSmoker] = useState(false);
  const [surveyHasPet, setSurveyHasPet] = useState(false);
  const [surveyHomeVibe, setSurveyHomeVibe] = useState('');
  const [surveyOccupation, setSurveyOccupation] = useState('');
  const [surveyRelationshipStatus, setSurveyRelationshipStatus] = useState('');
  const [surveyCleanlinessImportance, setSurveyCleanlinessImportance] = useState<number | null>(null);
  const [surveyCleaningFrequency, setSurveyCleaningFrequency] = useState('');
  const [surveyHostingPreference, setSurveyHostingPreference] = useState('');
  const [surveyCookingStyle, setSurveyCookingStyle] = useState('');
  const [surveyPreferredAgeRange, setSurveyPreferredAgeRange] = useState('');
  const [surveyPreferredGender, setSurveyPreferredGender] = useState('');
  const [surveyPreferredOccupation, setSurveyPreferredOccupation] = useState('');

  const openEditAnimations = () => {
    try {
      Animated.parallel([
        Animated.timing(sheetTranslateY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } catch {}
  };

  const closeEditAnimations = (onDone?: () => void) => {
    try {
      Animated.parallel([
        Animated.timing(sheetTranslateY, { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished && onDone) onDone();
      });
    } catch {
      if (onDone) onDone();
    }
  };
  const openTermsAnimations = () => {
    try {
      Animated.parallel([
        Animated.timing(termsTranslateY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(termsBackdropOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } catch {}
  };
  const closeTermsAnimations = (onDone?: () => void) => {
    try {
      Animated.parallel([
        Animated.timing(termsTranslateY, { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(termsBackdropOpacity, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished && onDone) onDone();
      });
    } catch {
      if (onDone) onDone();
    }
  };

  const openSurveyAnimations = () => {
    try {
      Animated.parallel([
        Animated.timing(surveyTranslateY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(surveyBackdropOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    } catch {}
  };

  const closeSurveyAnimations = (onDone?: () => void) => {
    try {
      Animated.parallel([
        Animated.timing(surveyTranslateY, { toValue: 600, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(surveyBackdropOpacity, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished && onDone) onDone();
      });
    } catch {
      if (onDone) onDone();
    }
  };

  // Helper: choose apartment primary image (first from image_urls or fallback to image_url)
  const getApartmentPrimaryImage = (apt: any): string => {
    const PLACEHOLDER = 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';
    if (!apt) return PLACEHOLDER;
    const anyValue: any = apt.image_urls;
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
    if (apt.image_url) return apt.image_url;
    return PLACEHOLDER;
  };
  useEffect(() => {
    if (showEditModal) {
      // reset starting positions before animating in
      sheetTranslateY.setValue(600);
      backdropOpacity.setValue(0);
      openEditAnimations();
    } else {
      // ensure values reset if modal was closed
      sheetTranslateY.setValue(600);
      backdropOpacity.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEditModal]);
  useEffect(() => {
    if (showTermsModal) {
      termsTranslateY.setValue(600);
      termsBackdropOpacity.setValue(0);
      openTermsAnimations();
    } else {
      termsTranslateY.setValue(600);
      termsBackdropOpacity.setValue(0);
    }
  }, [showTermsModal]);

  useEffect(() => {
    if (showSurveyModal) {
      surveyTranslateY.setValue(600);
      surveyBackdropOpacity.setValue(0);
      openSurveyAnimations();
    } else {
      surveyTranslateY.setValue(600);
      surveyBackdropOpacity.setValue(0);
    }
  }, [showSurveyModal]);

  useEffect(() => {
    (async () => {
      try {
        if (!user?.id) return;
        const { data } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
        setProfile((data as any) || null);
      } catch {
        // ignore
      }
    })();
  }, [user?.id]);

  // Load user's apartment when opening the modal
  useEffect(() => {
    (async () => {
      try {
        if (!showAptModal || !user?.id) return;
        setAptLoading(true);
        // Try to find an apartment the user is a partner of, otherwise one they own
        const [{ data: partnerRows }, { data: ownerRows }] = await Promise.all([
          supabase.from('apartments').select('*').contains('partner_ids', [user.id]).limit(1),
          supabase.from('apartments').select('*').eq('owner_id', user.id).limit(1),
        ]);
        const apt = (partnerRows && partnerRows[0]) || (ownerRows && ownerRows[0]) || null;
        setMyApartment((apt as any) || null);
        if (!apt) {
          setAptOwner(null);
          setAptMembers([]);
          return;
        }
        // Load owner
        const [{ data: ownerRow }, partnersResp] = await Promise.all([
          supabase.from('users').select('id, full_name, avatar_url').eq('id', (apt as any).owner_id).maybeSingle(),
          (Array.isArray((apt as any).partner_ids) && (apt as any).partner_ids.length > 0)
            ? supabase
                .from('users')
                .select('id, full_name, avatar_url')
                .in('id', (apt as any).partner_ids as string[])
            : Promise.resolve({ data: [] as any[] } as any),
        ]);
        setAptOwner((ownerRow as any) || null);
        const ownerId = (apt as any).owner_id as string;
        const partnersRaw: any[] = ((partnersResp as any)?.data || []) as any[];
        // de-duplicate by id and exclude the owner if mistakenly included
        const seen = new Set<string>();
        const partnersUnique = partnersRaw.filter((u: any) => {
          const uid = u?.id;
          if (!uid || uid === ownerId) return false;
          if (seen.has(uid)) return false;
          seen.add(uid);
          return true;
        });
        setAptMembers(partnersUnique as any);
      } catch (e: any) {
        Alert.alert('שגיאה', e?.message || 'לא ניתן לטעון את הדירה שלך');
      } finally {
        setAptLoading(false);
      }
    })();
  }, [showAptModal, user?.id]);

  const leaveApartment = async () => {
    if (!user?.id || !myApartment) return;
    // Only partners (not owner) can leave
    const currentPartners: string[] = Array.isArray((myApartment as any).partner_ids)
      ? ((myApartment as any).partner_ids as string[])
      : [];
    const isOwner = user.id === (myApartment as any).owner_id;
    const isPartner = currentPartners.includes(user.id);
    if (!isPartner || isOwner) {
      Alert.alert('שגיאה', isOwner ? 'בעל/ת הדירה לא יכול/ה לצאת מהדירה' : 'אינך משויך/ה כדייר/ת בדירה זו');
      return;
    }
    try {
      const shouldProceed =
        Platform.OS === 'web'
          ? (typeof confirm === 'function'
              ? confirm('האם לצאת מהדירה? ניתן להצטרף שוב בהזמנה.')
              : true)
          : await new Promise<boolean>((resolve) => {
              Alert.alert('יציאה מהדירה', 'האם לצאת מהדירה? ניתן להצטרף שוב בהזמנה.', [
                { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
                { text: 'צא/י מהדירה', style: 'destructive', onPress: () => resolve(true) },
              ]);
            });
      if (!shouldProceed) return;
      setIsLeavingApartment(true);
      const newPartnerIds = currentPartners.filter((pid) => pid !== user.id);
      const { error: updErr } = await supabase
        .from('apartments')
        .update({ partner_ids: newPartnerIds })
        .eq('id', (myApartment as any).id);
      if (updErr) {
        throw updErr;
      }
      // Handle shared profile memberships:
      // 1) Remove the current user's ACTIVE memberships.
      // 2) For any affected group that now has <= 1 ACTIVE member, remove that last member (if any) and delete the group.
      try {
        // Collect groups the user is actively a member of before deletion
        const groupsBeforeResp: any = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE');
        const affectedGroupIds: string[] = Array.isArray(groupsBeforeResp?.data)
          ? groupsBeforeResp.data.map((r: any) => r.group_id).filter(Boolean)
          : [];
        if (affectedGroupIds.length > 0) {
          // Remove the user's memberships in those groups
          await supabase
            .from('profile_group_members')
            .delete()
            .eq('user_id', user.id)
            .in('group_id', affectedGroupIds as any);
          // For each affected group, check remaining active members
          for (const gid of affectedGroupIds) {
            const remainingResp: any = await supabase
              .from('profile_group_members')
              .select('user_id')
              .eq('group_id', gid)
              .eq('status', 'ACTIVE');
            const remaining: any[] = Array.isArray(remainingResp?.data) ? remainingResp.data : [];
            if (remaining.length <= 1) {
              // If one member remains, remove their membership too
              if (remaining.length === 1) {
                const lastUserId = remaining[0]?.user_id;
                if (lastUserId) {
                  await supabase
                    .from('profile_group_members')
                    .delete()
                    .eq('group_id', gid)
                    .eq('user_id', lastUserId);
                }
              }
              // Delete the group itself
              await supabase.from('profile_groups').delete().eq('id', gid);
            }
          }
        }
      } catch {
        // Best-effort only; apartment leave should succeed even if group clean-up fails
      }
      // Update local state
      setMyApartment((prev) => (prev ? ({ ...(prev as any), partner_ids: newPartnerIds } as Apartment) : prev));
      setAptMembers((prev) => prev.filter((m) => m.id !== user.id));
      Alert.alert('הצלחה', 'יצאת מהדירה בהצלחה');
      setShowAptModal(false);
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לצאת מהדירה כעת');
    } finally {
      setIsLeavingApartment(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (!showSharedModal || !user?.id) return;
        setSharedLoading(true);
        const { data: membershipRows, error: membershipError } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE');
        if (membershipError) throw membershipError;
        const groupIds = (membershipRows || []).map((r: any) => r.group_id).filter(Boolean);
        if (!groupIds.length) {
          setSharedGroups([]);
          return;
        }

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

          const { data: usersRows, error: usersError } = await supabase
            .from('users')
            .select('id, full_name, avatar_url')
            .in('id', memberIds);
          if (usersError) throw usersError;

          results.push({
            id: gid,
            name: (groupRow as any)?.name,
            members: (usersRows || []) as any,
          });
        }
        setSharedGroups(results);
      } catch (e: any) {
        Alert.alert('שגיאה', e?.message || 'לא ניתן לטעון פרופילים משותפים');
      } finally {
        setSharedLoading(false);
      }
    })();
  }, [showSharedModal, user?.id]);

  const leaveGroup = async (groupId: string) => {
    if (!user?.id) return;
    try {
      let shouldProceed = true;
      if (Platform.OS === 'web') {
        shouldProceed =
          typeof confirm === 'function'
            ? confirm('האם לעזוב את הקבוצה הזו? ניתן להצטרף שוב בהזמנה.')
            : true;
      } else {
        shouldProceed = await new Promise<boolean>((resolve) => {
          Alert.alert('עזיבת קבוצה', 'האם לעזוב את הקבוצה הזו? ניתן להצטרף שוב בהזמנה.', [
            { text: 'ביטול', style: 'cancel', onPress: () => resolve(false) },
            { text: 'עזוב/י', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
      }
      if (!shouldProceed) return;
      setLeavingGroupId(groupId);
      // Check how many active members are currently in the group.
      // If there are only two, deleting the current user will leave a single member,
      // so we should remove the whole group.
      let shouldDeleteGroup = false;
      let activeMemberIds: string[] = [];
      try {
        const membersResp: any = await supabase
          .from('profile_group_members')
          .select('user_id')
          .eq('group_id', groupId)
          .eq('status', 'ACTIVE');
        activeMemberIds = Array.isArray(membersResp?.data) ? membersResp.data.map((r: any) => r.user_id) : [];
        const memberCount = activeMemberIds.length;
        shouldDeleteGroup = memberCount <= 2;
      } catch {
        // ignore counting errors; default is not to delete the group
      }
      if (shouldDeleteGroup) {
        try {
          // Delete all memberships in the group, then remove the group itself.
          // Requires RLS policies that let a current member remove other members
          // when the group is about to be dissolved (<=2 active members).
          const { error: deleteMembersErr } = await supabase
            .from('profile_group_members')
            .delete()
            .eq('group_id', groupId);
          if (deleteMembersErr) throw deleteMembersErr;
          const { error: deleteGroupErr } = await supabase
            .from('profile_groups')
            .delete()
            .eq('id', groupId);
          if (deleteGroupErr) throw deleteGroupErr;
        } catch {
          // Best-effort fallback: at least remove current user
          await supabase
            .from('profile_group_members')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', user.id);
        }
      } else {
        const { error } = await supabase
          .from('profile_group_members')
          .delete()
          .eq('group_id', groupId)
          .eq('user_id', user.id);
        if (error) {
          throw error;
        }
      }

      // Also remove the user from any apartments where they are a partner (not owner)
      try {
        const { data: aptRows, error: aptQueryErr } = await supabase
          .from('apartments')
          .select('id, owner_id, partner_ids')
          .contains('partner_ids', [user.id]);
        if (!aptQueryErr) {
          const apartments: any[] = (aptRows as any[]) || [];
          for (const apt of apartments) {
            const isOwner = String(apt.owner_id) === String(user.id);
            const currentPartners: string[] = Array.isArray(apt.partner_ids) ? (apt.partner_ids as string[]) : [];
            const nextPartners = currentPartners.filter((pid) => pid !== user.id);
            if (isOwner) {
              continue;
            }
            if (nextPartners.length === currentPartners.length) {
              continue;
            }
            const { error: aptUpdErr } = await supabase
              .from('apartments')
              .update({ partner_ids: nextPartners })
              .eq('id', apt.id);
            if (aptUpdErr) {
              // ignore
            }
          }
        }
      } catch (aptSideErr: any) {
        // ignore
      }

      // Optimistically update UI
      setSharedGroups((prev) => prev.filter((g) => g.id !== groupId));
      Alert.alert('הצלחה', 'עזבת את הקבוצה בהצלחה');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לעזוב את הקבוצה כעת');
    } finally {
      setLeavingGroupId(null);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (!user?.id) return;
        const { data, error } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', user.id)
          .eq('status', 'ACTIVE');
        if (error) throw error;
        setHasSharedProfiles(!!data && (data as any[]).length > 0);
      } catch {
        setHasSharedProfiles(false);
      }
    })();
  }, [user?.id]);

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

      setIsUploadingAvatar(true);
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
      Alert.alert('הצלחה', 'תמונת הפרופיל עודכנה');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן לעדכן את תמונת הפרופיל');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSignOut = async () => {
    try {
      if (Platform.OS === 'web') {
        const confirmed = typeof confirm === 'function' ? confirm('האם אתה בטוח שברצונך להתנתק?') : true;
        if (!confirmed) return;
        setIsSigningOut(true);
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
              setIsSigningOut(true);
              await authService.signOut();
              setUser(null);
              router.replace('/auth/login');
            } catch {
              Alert.alert('שגיאה', 'לא ניתן להתנתק');
            } finally {
              setIsSigningOut(false);
            }
          },
        },
      ]);
    } catch {
      setIsSigningOut(false);
      Alert.alert('שגיאה', 'לא ניתן להתנתק');
    }
  };

  const handleDeleteProfile = async () => {
    if (!user) return;
    try {
      if (Platform.OS === 'web') {
        const confirmed = typeof confirm === 'function'
          ? confirm('האם אתה בטוח/ה שברצונך למחוק את הפרופיל? פעולה זו אינה ניתנת לשחזור.')
          : true;
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
      const { error: deleteError } = await supabase.rpc('delete_my_account');
      if (deleteError) {
        const msg = String((deleteError as any)?.message || deleteError);
        if (msg.toLowerCase().includes('function') && msg.toLowerCase().includes('delete_my_account')) {
          throw new Error(
            'חסר RPC במסד הנתונים למחיקת חשבון (public.delete_my_account). נא להריץ את המיגרציה של Supabase ואז לנסות שוב.'
          );
        }
        throw deleteError;
      }

      try {
        await authService.signOut();
      } catch {}
      setUser(null);
      router.replace('/auth/login');
    } catch (e: any) {
      Alert.alert('שגיאה', e?.message || 'לא ניתן למחוק את הפרופיל כעת');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.topSpacer} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <Image
              source={{
                uri:
                  profile?.avatar_url ||
                  'https://cdn-icons-png.flaticon.com/512/847/847969.png',
              }}
              style={styles.avatar}
            />
          </View>
          <Text style={styles.profileName} numberOfLines={1}>
            {profile?.full_name || 'משתמש/ת'}
          </Text>
          {!!profile?.phone && (
            <Text style={styles.profileSub} numberOfLines={1}>
              {profile.phone}
            </Text>
          )}
          {!!profile?.email && (
            <Text style={styles.profileSub} numberOfLines={1}>
              {profile.email}
            </Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>הגדרות חשבון</Text>
        <View style={styles.groupCard}>
          <TouchableOpacity
            style={styles.groupItem}
            onPress={() => {
              if (profile) {
                setEditFullName(profile.full_name || '');
                setEditAge(profile.age ? String(profile.age) : '');
                setEditBio(profile.bio || '');
                setEditEmail((profile as any).email || '');
                setEditPhone((profile as any).phone || '');
                setEditCity((profile as any).city || '');
              }
              setShowEditModal(true);
            }}
            activeOpacity={0.9}
          >
            <View style={styles.itemIcon}>
              <Edit size={18} color="#5e3f2d" />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={styles.groupItemTitle}>עריכת פרופיל</Text>
              <Text style={styles.groupItemSub}>עדכון פרטים</Text>
            </View>
            <ChevronLeft size={18} color="#5e3f2d" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.groupItem}
            onPress={() => setShowAptModal(true)}
            activeOpacity={0.9}
          >
            <View style={styles.itemIcon}>
              <Home size={18} color="#5e3f2d" />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={styles.groupItemTitle}>הדירה שלי</Text>
              <Text style={styles.groupItemSub}>צפייה ויציאה מהדירה</Text>
            </View>
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {hasSharedProfiles ? (
            <>
              <TouchableOpacity
                style={styles.groupItem}
                onPress={() => setShowSharedModal(true)}
                activeOpacity={0.9}
              >
                <View style={styles.itemIcon}>
                  <UserPlus2 size={18} color="#5e3f2d" />
                </View>
                <View style={styles.itemTextWrap}>
                  <Text style={styles.groupItemTitle}>פרופילים משותפים</Text>
                  <Text style={styles.groupItemSub}>צפייה בפרופילים המשותפים שלך</Text>
                </View>
                <ChevronLeft size={18} color="#5e3f2d" />
              </TouchableOpacity>

              <View style={styles.divider} />
            </>
          ) : null}

          <TouchableOpacity
            style={styles.groupItem}
            onPress={() => setShowTermsModal(true)}
            activeOpacity={0.9}
          >
            <View style={styles.itemIcon}>
              <FileText size={18} color="#5e3f2d" />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={styles.groupItemTitle}>תנאי שימוש</Text>
              <Text style={styles.groupItemSub}>קריאת התקנון והמדיניות</Text>
            </View>
            <ChevronLeft size={18} color="#5e3f2d" />
          </TouchableOpacity>

          <View style={styles.divider} />

        </View>

        <Text style={styles.sectionTitle}>אבטחה וחשבון</Text>
        <View style={styles.groupCard}>
          <TouchableOpacity
            style={styles.groupItem}
            onPress={isDeleting ? undefined : handleDeleteProfile}
            activeOpacity={0.9}
          >
            <View style={[styles.itemIcon, styles.dangerIcon]}>
              {isDeleting ? (
                <ActivityIndicator size="small" color="#F87171" />
              ) : (
                <Trash2 size={18} color="#F87171" />
              )}
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={[styles.groupItemTitle, styles.dangerText]}>
                {isDeleting ? 'מוחק...' : 'מחיקת חשבון'}
              </Text>
              <Text style={styles.groupItemSub}>פעולה בלתי ניתנת לשחזור</Text>
            </View>
            <ChevronLeft size={18} color={ICON_COLOR} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.groupItem}
            onPress={isSigningOut ? undefined : handleSignOut}
            activeOpacity={0.9}
          >
            <View style={[styles.itemIcon, styles.dangerIcon]}>
              {isSigningOut ? (
                <ActivityIndicator size="small" color="#F87171" />
              ) : (
                <LogOut size={18} color="#F87171" />
              )}
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={[styles.groupItemTitle, styles.dangerText]}>
                {isSigningOut ? 'מתנתק...' : 'התנתק'}
              </Text>
              <Text style={styles.groupItemSub}>יציאה מהחשבון</Text>
            </View>
            <ChevronLeft size={18} color={ICON_COLOR} />
          </TouchableOpacity>
        </View>
      </ScrollView>
      {/* My apartment modal */}
      {showAptModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowAptModal(false)}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>הדירה שלי</Text>
                <TouchableOpacity style={styles.sheetClose} onPress={() => setShowAptModal(false)}>
                  <X size={18} color="#4C1D95" />
                </TouchableOpacity>
              </View>
              {aptLoading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#5e3f2d" />
                </View>
              ) : !myApartment ? (
                <Text style={styles.sharedEmptyText}>לא נמצאה דירה משויכת.</Text>
              ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                  <View style={styles.aptHeroCard}>
                    <View style={styles.aptCoverWrap}>
                      <TouchableOpacity
                        style={styles.aptCoverPressable}
                        activeOpacity={0.9}
                        onPress={() => {
                          try {
                            setShowAptModal(false);
                            const id = (myApartment as any)?.id;
                            if (id) router.push({ pathname: '/apartment/[id]', params: { id } });
                          } catch {}
                        }}
                      >
                        <Image
                          source={{ uri: getApartmentPrimaryImage(myApartment as any) }}
                          style={styles.aptCoverImg}
                        />
                        <LinearGradient
                          colors={['rgba(0,0,0,0.00)', 'rgba(0,0,0,0.92)']}
                          start={{ x: 0.5, y: 0 }}
                          end={{ x: 0.5, y: 1 }}
                          style={styles.aptCoverGradient}
                        />
                        <View style={styles.aptCoverTextWrap}>
                          <Text style={styles.aptCoverTitle} numberOfLines={1}>
                            {(myApartment as any).title || 'דירה'}
                          </Text>
                          {!!((myApartment as any).city || (myApartment as any).address) ? (
                            <View style={styles.aptCoverCityRow}>
                              <MapPin size={14} color="rgba(255,255,255,0.92)" />
                              <Text style={styles.aptCoverCityText} numberOfLines={1}>
                                {(myApartment as any).city || (myApartment as any).address}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </TouchableOpacity>

                      {(() => {
                        const occupants = [aptOwner, ...(aptMembers || [])].filter(Boolean) as any[];
                        const unique: any[] = [];
                        const seen = new Set<string>();
                        for (const o of occupants) {
                          const id = String(o?.id || '');
                          if (!id || seen.has(id)) continue;
                          seen.add(id);
                          unique.push(o);
                        }
                        const visible = unique.slice(0, 4);
                        const overflow = unique.length - visible.length;
                        if (!visible.length) return null;
                        return (
                          <View style={styles.aptCoverOccupantsRow} pointerEvents="none">
                            {visible.map((m, idx2) => {
                              const fallbackInitial = ((m.full_name || '').trim().charAt(0) || '?').toUpperCase();
                              return (
                                <View key={m.id} style={[styles.aptOccupantAvatarWrap, idx2 !== 0 && styles.aptOccupantOverlap]}>
                                  {m.avatar_url ? (
                                    <Image source={{ uri: m.avatar_url }} style={styles.aptOccupantAvatarImg} />
                                  ) : (
                                    <Text style={styles.aptOccupantFallback}>{fallbackInitial}</Text>
                                  )}
                                </View>
                              );
                            })}
                            {overflow > 0 ? (
                              <View style={[styles.aptOccupantAvatarWrap, styles.aptOccupantOverflow]}>
                                <Text style={styles.aptOccupantOverflowText}>+{overflow}</Text>
                              </View>
                            ) : null}
                          </View>
                        );
                      })()}
                    </View>
                  </View>

                  {(() => {
                    const canLeave =
                      !!user?.id &&
                      Array.isArray((myApartment as any).partner_ids) &&
                      (myApartment as any).partner_ids.includes(user.id) &&
                      user.id !== (myApartment as any).owner_id;
                    if (!canLeave) return null;
                    return (
                      <View style={{ alignItems: 'center', marginTop: 10 }}>
                        <TouchableOpacity
                          style={[styles.aptLeaveBtnOuter, isLeavingApartment ? { opacity: 0.75 } : null]}
                          onPress={isLeavingApartment ? undefined : leaveApartment}
                          activeOpacity={0.9}
                          disabled={isLeavingApartment}
                          accessibilityRole="button"
                          accessibilityLabel="עזוב דירה"
                        >
                          <LinearGradient
                            colors={['#EF4444', '#B91C1C']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.aptLeaveBtnInner}
                          >
                            {isLeavingApartment ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <LogOut size={16} color="#FFFFFF" />
                                <Text style={styles.aptLeaveBtnText}>עזוב/י דירה</Text>
                              </>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    );
                  })()}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      )}
      {/* Survey bottom sheet */}
      {showSurveyModal && (
        <Modal
          visible
          transparent
          animationType="none"
          onRequestClose={() => {
            closeSurveyAnimations(() => setShowSurveyModal(false));
          }}
        >
          <Animated.View style={[styles.overlayBottom, { opacity: surveyBackdropOpacity }]}>
            <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: surveyTranslateY }] }]}>
              <View style={styles.sheetHeader}>
                <View style={styles.handleBar} />
                <Text style={styles.sheetTitle}>שאלון העדפות</Text>
                <TouchableOpacity
                  style={styles.sheetClose}
                  onPress={() => {
                    closeSurveyAnimations(() => setShowSurveyModal(false));
                  }}
                >
                  <X size={18} color="#4C1D95" />
                </TouchableOpacity>
              </View>
              <KeyboardAwareScrollView
                contentContainerStyle={styles.editForm}
                keyboardOpeningTime={0}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.editCard}>
                  {/* Section: מגורים */}
                  <Text style={styles.subsectionTitle}>מגורים</Text>
                  <View style={styles.fieldGroup}>
                    <View style={styles.labelRow}>
                      <MapPin size={16} color="#4C1D95" />
                      <Text style={styles.fieldLabel}>עיר מועדפת</Text>
                    </View>
                    <TextInput
                      style={styles.fieldInput}
                      value={surveyCity}
                      onChangeText={setSurveyCity}
                      placeholder="לדוגמה: תל אביב-יפו"
                    />
                  </View>
                  <View style={styles.fieldGroup}>
                    <View style={styles.labelRow}>
                      <FileText size={16} color="#4C1D95" />
                      <Text style={styles.fieldLabel}>שכונות מועדפות (מופרד בפסיקים)</Text>
                    </View>
                    <TextInput
                      style={styles.fieldInput}
                      value={surveyNeighborhoods}
                      onChangeText={setSurveyNeighborhoods}
                      placeholder="לב תל אביב, נווה צדק"
                    />
                    {!!surveyCity.trim() && (
                      <TouchableOpacity
                        style={[styles.chipToggle, { alignSelf: 'flex-end' }]}
                        onPress={() => {
                          try {
                            const all = getNeighborhoodsForCityName(surveyCity.trim());
                            if (!all.length) return;
                            setSurveyNeighborhoods(all.join(', '));
                          } catch {}
                        }}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.chipToggleText}>הכל</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.fieldGroup}>
                    <View style={styles.labelRow}>
                      <Hash size={16} color="#4C1D95" />
                      <Text style={styles.fieldLabel}>תקציב חודשי (₪)</Text>
                    </View>
                    <TextInput
                      style={styles.fieldInput}
                      value={surveyPrice}
                      onChangeText={(t) => setSurveyPrice(t.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="ללא"
                    />
                  </View>
                  <View style={styles.fieldGroup}>
                    <View style={styles.labelRow}>
                      <Calendar size={16} color="#4C1D95" />
                      <Text style={styles.fieldLabel}>חודש כניסה (YYYY-MM)</Text>
                    </View>
                    <TextInput
                      style={styles.fieldInput}
                      value={surveyMoveIn}
                      onChangeText={setSurveyMoveIn}
                      placeholder="2026-01"
                    />
                  </View>
                  <View style={styles.fieldGroup}>
                    <View style={styles.labelRow}>
                      <FileText size={16} color="#4C1D95" />
                      <Text style={styles.fieldLabel}>סאבלט</Text>
                    </View>
                    <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
                      <TouchableOpacity
                        style={[
                          styles.chipToggle,
                          surveyIsSublet && styles.chipToggleActive,
                        ]}
                        onPress={() => setSurveyIsSublet(true)}
                        activeOpacity={0.9}
                      >
                        <Text style={[styles.chipToggleText, surveyIsSublet && styles.chipToggleTextActive]}>כן</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.chipToggle,
                          !surveyIsSublet && styles.chipToggleActive,
                        ]}
                        onPress={() => setSurveyIsSublet(false)}
                        activeOpacity={0.9}
                      >
                        <Text style={[styles.chipToggleText, !surveyIsSublet && styles.chipToggleTextActive]}>לא</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>עם מרפסת / גינה</Text>
                      </View>
                      <View style={{ flexDirection: 'row-reverse', gap: 10, flexWrap: 'wrap' }}>
                        <TouchableOpacity style={[styles.chipToggle, surveyHasBalcony === true && styles.chipToggleActive]} onPress={() => setSurveyHasBalcony(true)}><Text style={[styles.chipToggleText, surveyHasBalcony === true && styles.chipToggleTextActive]}>כן</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, surveyHasBalcony === false && styles.chipToggleActive]} onPress={() => setSurveyHasBalcony(false)}><Text style={[styles.chipToggleText, surveyHasBalcony === false && styles.chipToggleTextActive]}>לא</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, surveyHasBalcony === null && styles.chipToggleActive]} onPress={() => setSurveyHasBalcony(null)}><Text style={[styles.chipToggleText, surveyHasBalcony === null && styles.chipToggleTextActive]}>לא משנה לי</Text></TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>מעלית</Text>
                      </View>
                      <View style={{ flexDirection: 'row-reverse', gap: 10, flexWrap: 'wrap' }}>
                        <TouchableOpacity style={[styles.chipToggle, surveyHasElevator === true && styles.chipToggleActive]} onPress={() => setSurveyHasElevator(true)}><Text style={[styles.chipToggleText, surveyHasElevator === true && styles.chipToggleTextActive]}>כן</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, surveyHasElevator === false && styles.chipToggleActive]} onPress={() => setSurveyHasElevator(false)}><Text style={[styles.chipToggleText, surveyHasElevator === false && styles.chipToggleTextActive]}>לא</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, surveyHasElevator === null && styles.chipToggleActive]} onPress={() => setSurveyHasElevator(null)}><Text style={[styles.chipToggleText, surveyHasElevator === null && styles.chipToggleTextActive]}>לא משנה לי</Text></TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>חדר מאסטר</Text>
                      </View>
                      <View style={{ flexDirection: 'row-reverse', gap: 10, flexWrap: 'wrap' }}>
                        <TouchableOpacity style={[styles.chipToggle, surveyWantsMasterRoom === true && styles.chipToggleActive]} onPress={() => setSurveyWantsMasterRoom(true)}><Text style={[styles.chipToggleText, surveyWantsMasterRoom === true && styles.chipToggleTextActive]}>כן</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, surveyWantsMasterRoom === false && styles.chipToggleActive]} onPress={() => setSurveyWantsMasterRoom(false)}><Text style={[styles.chipToggleText, surveyWantsMasterRoom === false && styles.chipToggleTextActive]}>לא</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, surveyWantsMasterRoom === null && styles.chipToggleActive]} onPress={() => setSurveyWantsMasterRoom(null)}><Text style={[styles.chipToggleText, surveyWantsMasterRoom === null && styles.chipToggleTextActive]}>לא משנה לי</Text></TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>חשבונות כלולים</Text>
                      </View>
                      <View style={{ flexDirection: 'row-reverse', gap: 10, flexWrap: 'wrap' }}>
                        <TouchableOpacity style={[styles.chipToggle, surveyBillsIncluded === true && styles.chipToggleActive]} onPress={() => setSurveyBillsIncluded(true)}><Text style={[styles.chipToggleText, surveyBillsIncluded === true && styles.chipToggleTextActive]}>כן</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, surveyBillsIncluded === false && styles.chipToggleActive]} onPress={() => setSurveyBillsIncluded(false)}><Text style={[styles.chipToggleText, surveyBillsIncluded === false && styles.chipToggleTextActive]}>לא</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, surveyBillsIncluded === null && styles.chipToggleActive]} onPress={() => setSurveyBillsIncluded(null)}><Text style={[styles.chipToggleText, surveyBillsIncluded === null && styles.chipToggleTextActive]}>לא משנה לי</Text></TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  <View style={styles.fieldGroup}>
                    <View style={styles.labelRow}>
                      <FileText size={16} color="#4C1D95" />
                      <Text style={styles.fieldLabel}>תיווך</Text>
                    </View>
                    <View style={{ flexDirection: 'row-reverse', gap: 10, flexWrap: 'wrap' }}>
                      <TouchableOpacity style={[styles.chipToggle, surveyWithBroker === true && styles.chipToggleActive]} onPress={() => setSurveyWithBroker(true)}><Text style={[styles.chipToggleText, surveyWithBroker === true && styles.chipToggleTextActive]}>עם תיווך</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.chipToggle, surveyWithBroker === false && styles.chipToggleActive]} onPress={() => setSurveyWithBroker(false)}><Text style={[styles.chipToggleText, surveyWithBroker === false && styles.chipToggleTextActive]}>בלי תיווך</Text></TouchableOpacity>
                      <TouchableOpacity style={[styles.chipToggle, surveyWithBroker === null && styles.chipToggleActive]} onPress={() => setSurveyWithBroker(null)}><Text style={[styles.chipToggleText, surveyWithBroker === null && styles.chipToggleTextActive]}>לא משנה לי</Text></TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.sectionDivider} />
                  {/* Section: חיים בבית */}
                  <Text style={styles.subsectionTitle}>חיים בבית</Text>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>עבודה מהבית</Text>
                      </View>
                      <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                        <TouchableOpacity style={[styles.chipToggle, surveyWorksFromHome && styles.chipToggleActive]} onPress={() => setSurveyWorksFromHome(true)}><Text style={[styles.chipToggleText, surveyWorksFromHome && styles.chipToggleTextActive]}>כן</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, !surveyWorksFromHome && styles.chipToggleActive]} onPress={() => setSurveyWorksFromHome(false)}><Text style={[styles.chipToggleText, !surveyWorksFromHome && styles.chipToggleTextActive]}>לא</Text></TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>שומר/ת כשרות</Text>
                      </View>
                      <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                        <TouchableOpacity style={[styles.chipToggle, surveyKeepsKosher && styles.chipToggleActive]} onPress={() => setSurveyKeepsKosher(true)}><Text style={[styles.chipToggleText, surveyKeepsKosher && styles.chipToggleTextActive]}>כן</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, !surveyKeepsKosher && styles.chipToggleActive]} onPress={() => setSurveyKeepsKosher(false)}><Text style={[styles.chipToggleText, !surveyKeepsKosher && styles.chipToggleTextActive]}>לא</Text></TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>שומר/ת שבת</Text>
                      </View>
                      <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                        <TouchableOpacity style={[styles.chipToggle, surveyIsShomerShabbat && styles.chipToggleActive]} onPress={() => setSurveyIsShomerShabbat(true)}><Text style={[styles.chipToggleText, surveyIsShomerShabbat && styles.chipToggleTextActive]}>כן</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, !surveyIsShomerShabbat && styles.chipToggleActive]} onPress={() => setSurveyIsShomerShabbat(false)}><Text style={[styles.chipToggleText, !surveyIsShomerShabbat && styles.chipToggleTextActive]}>לא</Text></TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>מעשן/ת</Text>
                      </View>
                      <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                        <TouchableOpacity style={[styles.chipToggle, surveyIsSmoker && styles.chipToggleActive]} onPress={() => setSurveyIsSmoker(true)}><Text style={[styles.chipToggleText, surveyIsSmoker && styles.chipToggleTextActive]}>כן</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, !surveyIsSmoker && styles.chipToggleActive]} onPress={() => setSurveyIsSmoker(false)}><Text style={[styles.chipToggleText, !surveyIsSmoker && styles.chipToggleTextActive]}>לא</Text></TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>חיית מחמד בבית</Text>
                      </View>
                      <View style={{ flexDirection: 'row-reverse', gap: 10 }}>
                        <TouchableOpacity style={[styles.chipToggle, surveyHasPet && styles.chipToggleActive]} onPress={() => setSurveyHasPet(true)}><Text style={[styles.chipToggleText, surveyHasPet && styles.chipToggleTextActive]}>כן</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.chipToggle, !surveyHasPet && styles.chipToggleActive]} onPress={() => setSurveyHasPet(false)}><Text style={[styles.chipToggleText, !surveyHasPet && styles.chipToggleTextActive]}>לא</Text></TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>וייב בבית</Text>
                      </View>
                      <TextInput style={styles.fieldInput} value={surveyHomeVibe} onChangeText={setSurveyHomeVibe} placeholder="רגוע/חברתי..." />
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>חשיבות ניקיון (1‑5)</Text>
                      </View>
                      <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                        {[1,2,3,4,5].map(n => (
                          <TouchableOpacity key={`clean-${n}`} style={[styles.chipToggle, surveyCleanlinessImportance === n && styles.chipToggleActive]} onPress={() => setSurveyCleanlinessImportance(n as any)}><Text style={[styles.chipToggleText, surveyCleanlinessImportance === n && styles.chipToggleTextActive]}>{n}</Text></TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>תדירות ניקיון</Text>
                      </View>
                      <TextInput style={styles.fieldInput} value={surveyCleaningFrequency} onChangeText={setSurveyCleaningFrequency} placeholder="שבועי/דו‑שבועי..." />
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>העדפת אירוח</Text>
                      </View>
                      <TextInput style={styles.fieldInput} value={surveyHostingPreference} onChangeText={setSurveyHostingPreference} placeholder="לעיתים/תדיר/מעט..." />
                    </View>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>סטייל בישול</Text>
                      </View>
                      <TextInput style={styles.fieldInput} value={surveyCookingStyle} onChangeText={setSurveyCookingStyle} placeholder="ביתי/פשוט/גורמה..." />
                    </View>
                  </View>
                  <View style={styles.sectionDivider} />
                  {/* Section: שותפים מועדפים */}
                  <Text style={styles.subsectionTitle}>שותפים מועדפים</Text>
                  <View style={styles.fieldGroup}>
                    <View style={styles.labelRow}>
                      <UserIcon size={16} color="#4C1D95" />
                      <Text style={styles.fieldLabel}>טווח שותפים מועדף</Text>
                    </View>
                    <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                      <TextInput
                        style={[styles.fieldInput, { flex: 1 }]}
                        value={surveyRoommatesMin}
                        onChangeText={(t) => setSurveyRoommatesMin(t.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        placeholder="מינימום"
                      />
                      <TextInput
                        style={[styles.fieldInput, { flex: 1 }]}
                        value={surveyRoommatesMax}
                        onChangeText={(t) => setSurveyRoommatesMax(t.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        placeholder="מקסימום"
                      />
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>טווח גילאים רצוי</Text>
                      </View>
                      <TextInput style={styles.fieldInput} value={surveyPreferredAgeRange} onChangeText={setSurveyPreferredAgeRange} placeholder="23‑30" />
                    </View>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>מגדר שותפים</Text>
                      </View>
                      <TextInput style={styles.fieldInput} value={surveyPreferredGender} onChangeText={setSurveyPreferredGender} placeholder="לא משנה/ז/נ/מעורב" />
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>עיסוק שותפים</Text>
                      </View>
                      <TextInput style={styles.fieldInput} value={surveyPreferredOccupation} onChangeText={setSurveyPreferredOccupation} placeholder="סטודנטים/הייטק..." />
                    </View>
                    <View style={styles.fieldHalf}>
                      <View style={styles.labelRow}>
                        <FileText size={16} color="#4C1D95" />
                        <Text style={styles.fieldLabel}>עיסוק</Text>
                      </View>
                      <TextInput style={styles.fieldInput} value={surveyOccupation} onChangeText={setSurveyOccupation} placeholder="עבודתך כיום" />
                    </View>
                  </View>
                  <View style={styles.fieldGroup}>
                    <View style={styles.labelRow}>
                      <FileText size={16} color="#4C1D95" />
                      <Text style={styles.fieldLabel}>מצב זוגי</Text>
                    </View>
                    <TextInput style={styles.fieldInput} value={surveyRelationshipStatus} onChangeText={setSurveyRelationshipStatus} placeholder="רווק/נשוי/בקשר..." />
                  </View>

                  <View style={styles.editActionsRow}>
                    <TouchableOpacity
                      style={[styles.clearBtn]}
                      onPress={() => setShowSurveyModal(false)}
                      disabled={surveySaving}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.clearText}>ביטול</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.applyBtn, surveySaving && { opacity: 0.7 }]}
                      onPress={async () => {
                        try {
                          if (!user?.id) return;
                          setSurveySaving(true);
                          const priceNum = surveyPrice ? parseInt(surveyPrice) : null;
                          await upsertUserSurvey({
                            user_id: user.id,
                            preferred_city: surveyCity || null,
                            price_range: (priceNum as any) || null,
                            move_in_month: surveyMoveIn || null,
                            is_sublet: surveyIsSublet || false,
                            preferred_neighborhoods: (() => {
                              const raw = (surveyNeighborhoods || '').trim();
                              if (!raw) return null;
                              const arr = raw
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean);
                              return arr.length ? arr : null;
                            })(),
                            preferred_roommates_min: surveyRoommatesMin ? parseInt(surveyRoommatesMin) : null,
                            preferred_roommates_max: surveyRoommatesMax ? parseInt(surveyRoommatesMax) : null,
                            preferred_roommates:
                              (surveyRoommatesMax ? parseInt(surveyRoommatesMax) : null) ??
                              (surveyRoommatesMin ? parseInt(surveyRoommatesMin) : null),
                            bills_included: surveyBillsIncluded,
                            has_balcony: surveyHasBalcony,
                            has_elevator: surveyHasElevator,
                            wants_master_room: surveyWantsMasterRoom,
                            works_from_home: surveyWorksFromHome || false,
                            keeps_kosher: surveyKeepsKosher || false,
                            is_shomer_shabbat: surveyIsShomerShabbat || false,
                            is_smoker: surveyIsSmoker || false,
                            has_pet: surveyHasPet || false,
                            with_broker: surveyWithBroker,
                            home_vibe: surveyHomeVibe || null,
                            occupation: surveyOccupation || null,
                            relationship_status: surveyRelationshipStatus || null,
                            cleanliness_importance: surveyCleanlinessImportance as any,
                            cleaning_frequency: surveyCleaningFrequency || null,
                            hosting_preference: surveyHostingPreference || null,
                            cooking_style: surveyCookingStyle || null,
                            preferred_age_range: surveyPreferredAgeRange || null,
                            preferred_gender: surveyPreferredGender || null,
                            preferred_occupation: surveyPreferredOccupation || null,
                            is_completed: true,
                          } as any);
                          Alert.alert('הצלחה', 'שאלון ההעדפות נשמר');
                          setShowSurveyModal(false);
                        } catch (e: any) {
                          Alert.alert('שגיאה', e?.message || 'לא ניתן לשמור את השאלון');
                        } finally {
                          setSurveySaving(false);
                        }
                      }}
                      disabled={surveySaving}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.applyText}>{surveySaving ? 'שומר...' : 'שמור'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAwareScrollView>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}
      {/* Shared profiles modal */}
      {showSharedModal && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowSharedModal(false)}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>פרופילים משותפים</Text>
                <TouchableOpacity style={styles.sheetClose} onPress={() => setShowSharedModal(false)}>
                  <X size={18} color="#4C1D95" />
                </TouchableOpacity>
              </View>

              {sharedLoading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#5e3f2d" />
                </View>
              ) : sharedGroups.length === 0 ? (
                <Text style={styles.sharedEmptyText}>אין לך פרופילים משותפים פעילים.</Text>
              ) : (
                <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
                  {sharedGroups.map((g) => (
                    <View key={g.id} style={styles.sharedProfileCard}>
                      <View style={styles.sharedMembersGrid}>
                        {g.members.map((m) => (
                          <TouchableOpacity
                            key={m.id}
                            style={styles.sharedMemberTile}
                            activeOpacity={0.9}
                            onPress={() => {
                              try {
                                if (!m?.id) return;
                                setShowSharedModal(false);
                                router.push({ pathname: '/user/[id]', params: { id: m.id } } as any);
                              } catch {}
                            }}
                            disabled={String(user?.id || '') === String(m?.id || '')}
                            accessibilityRole="button"
                            accessibilityLabel={String(user?.id || '') === String(m?.id || '') ? 'זה הפרופיל שלך' : `פתח פרופיל של ${(m.full_name || 'משתמש/ת').toString()}`}
                            accessibilityState={String(user?.id || '') === String(m?.id || '') ? ({ disabled: true } as any) : undefined}
                          >
                            <View style={styles.sharedMemberAvatarWrap}>
                              <Image
                                source={{ uri: m.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
                                style={styles.sharedMemberAvatar}
                              />
                            </View>
                            <Text style={styles.sharedMemberName} numberOfLines={1}>
                              {m.full_name || 'משתמש/ת'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <View style={styles.sharedLeaveBtnRow}>
                        <TouchableOpacity
                          style={[styles.sharedLeaveBtnOuter, leavingGroupId === g.id ? { opacity: 0.75 } : null]}
                          onPress={leavingGroupId ? undefined : () => leaveGroup(g.id)}
                          activeOpacity={0.9}
                          disabled={!!leavingGroupId}
                          accessibilityRole="button"
                          accessibilityLabel="עזוב קבוצה"
                        >
                          <LinearGradient
                            colors={['#EF4444', '#B91C1C']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.sharedLeaveBtnInner}
                          >
                            {leavingGroupId === g.id ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <LogOut size={16} color="#FFFFFF" />
                                <Text style={styles.sharedLeaveBtnTextNew}>עזוב/י קבוצה</Text>
                              </>
                            )}
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      )}
      {/* Edit profile bottom sheet */}
      {showEditModal && (
        <Modal
          visible
          transparent
          animationType="none"
          onRequestClose={() => {
            closeEditAnimations(() => setShowEditModal(false));
          }}
        >
          <Animated.View style={[styles.overlayBottom, { opacity: backdropOpacity }]}>
            <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: sheetTranslateY }] }]}>
              <View style={styles.sheetHeader}>
                <View style={styles.handleBar} />
                <Text style={styles.sheetTitle}>עריכת פרופיל</Text>
                <TouchableOpacity
                  style={styles.sheetClose}
                  onPress={() => {
                    closeEditAnimations(() => setShowEditModal(false));
                  }}
                >
                  <X size={18} color="#4C1D95" />
                </TouchableOpacity>
              </View>
              <KeyboardAwareScrollView
                contentContainerStyle={styles.editForm}
                showsVerticalScrollIndicator={false}
                keyboardOpeningTime={0}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.editCard}>
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <UserIcon size={16} color="#4C1D95" />
                    <Text style={styles.fieldLabel}>שם מלא</Text>
                  </View>
                  <TextInput style={styles.fieldInput} value={editFullName} onChangeText={setEditFullName} editable={!editSaving} />
                </View>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <View style={styles.labelRow}>
                      <Hash size={16} color="#4C1D95" />
                      <Text style={styles.fieldLabel}>גיל</Text>
                    </View>
                    <TextInput
                      style={styles.fieldInput}
                      value={editAge}
                      onChangeText={setEditAge}
                      keyboardType="numeric"
                      placeholder="לא חובה"
                      editable={!editSaving}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <View style={styles.labelRow}>
                      <MapPin size={16} color="#4C1D95" />
                      <Text style={styles.fieldLabel}>עיר</Text>
                    </View>
                    <TextInput
                      style={styles.fieldInput}
                      value={editCity}
                      onChangeText={setEditCity}
                      editable={!editSaving}
                      placeholder="לדוגמה: תל אביב-יפו"
                    />
                  </View>
                </View>
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <Mail size={16} color="#4C1D95" />
                    <Text style={styles.fieldLabel}>אימייל</Text>
                  </View>
                  <TextInput
                    style={styles.fieldInput}
                    value={editEmail}
                    onChangeText={setEditEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!editSaving}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <Phone size={16} color="#4C1D95" />
                    <Text style={styles.fieldLabel}>טלפון</Text>
                  </View>
                  <TextInput
                    style={styles.fieldInput}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    keyboardType="phone-pad"
                    placeholder="05X-XXXXXXX"
                    editable={!editSaving}
                  />
                </View>
                <View style={styles.fieldGroup}>
                  <View style={styles.labelRow}>
                    <FileText size={16} color="#4C1D95" />
                    <Text style={styles.fieldLabel}>אודות</Text>
                  </View>
                  <TextInput
                    style={[styles.fieldInput, styles.fieldTextArea]}
                    value={editBio}
                    onChangeText={setEditBio}
                    multiline
                    numberOfLines={4}
                    placeholder="ספר/י קצת על עצמך..."
                    editable={!editSaving}
                  />
                </View>

                <View style={styles.editActionsRow}>
                  <TouchableOpacity
                    style={[styles.clearBtn]}
                    onPress={() => setShowEditModal(false)}
                    disabled={editSaving}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.clearText}>ביטול</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.applyBtn, editSaving && { opacity: 0.7 }]}
                    onPress={async () => {
                      try {
                        if (!user?.id) return;
                        if (!editFullName.trim()) { Alert.alert('שגיאה', 'שם מלא הוא שדה חובה'); return; }
                        const ageNum = editAge ? parseInt(editAge) : null;
                        if (editAge && (isNaN(ageNum!) || ageNum! <= 0)) { Alert.alert('שגיאה', 'גיל לא תקין'); return; }
                        setEditSaving(true);
                        const { error } = await supabase
                          .from('users')
                          .update({
                            full_name: editFullName,
                            age: ageNum,
                            bio: editBio || null,
                            email: editEmail || null,
                            phone: editPhone || null,
                            city: editCity || null,
                            updated_at: new Date().toISOString(),
                          })
                          .eq('id', user.id);
                        if (error) throw error;
                        Alert.alert('הצלחה', 'הפרופיל עודכן');
                        // refresh local profile view
                        try {
                          const { data } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
                          setProfile((data as any) || null);
                        } catch {}
                        setShowEditModal(false);
                      } catch (e: any) {
                        Alert.alert('שגיאה', e?.message || 'לא ניתן לשמור');
                      } finally {
                        setEditSaving(false);
                      }
                    }}
                    disabled={editSaving}
                    activeOpacity={0.9}
                  >
                    {editSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.applyText}>שמור</Text>}
                  </TouchableOpacity>
                </View>
                </View>
              </KeyboardAwareScrollView>
            </Animated.View>
          </Animated.View>
        </Modal>
      )}
      {/* Terms bottom sheet */}
      {showTermsModal && (
        <Modal
          visible
          transparent
          animationType="none"
          onRequestClose={() => {
            closeTermsAnimations(() => setShowTermsModal(false));
          }}
        >
          <Animated.View style={[styles.overlayBottom, { opacity: termsBackdropOpacity }]}>
            <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: termsTranslateY }] }]}>
              <View style={styles.sheetHeader}>
                <View style={styles.handleBar} />
                <Text style={styles.sheetTitle}>תנאי שימוש</Text>
                <TouchableOpacity
                  style={styles.sheetClose}
                  onPress={() => {
                    closeTermsAnimations(() => setShowTermsModal(false));
                  }}
                >
                  <X size={18} color="#4C1D95" />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 }}>
                <Text style={{ color: '#111827', fontSize: 15, lineHeight: 22, textAlign: 'right' }}>
                  ברוך/ה הבא/ה! זהו עמוד תנאי השימוש של האפליקציה. התוכן המשפטי המלא יופיע כאן.
                  בינתיים, זהו תוכן דמה כדי לאפשר ניווט תקין במסכים. אנא פנה/י למפתח/ת להוספת נוסח מלא.
                </Text>
              </ScrollView>
            </Animated.View>
          </Animated.View>
        </Modal>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  topSpacer: {
    height: 48,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 24,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 12,
    // Make the avatar border clearly visible: create an outer ring
    padding: 2,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  profileName: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 2,
  },
  profileSub: {
    color: '#6B7280',
    fontSize: 13,
  },
  sectionTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 8,
    textAlign: 'right',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  overlayBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  sheet: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    padding: 12,
  },
  bottomSheet: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: '#FAFAFA',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#E5E7EB',
    paddingTop: 12,
    paddingBottom: 0,
    paddingHorizontal: 14,
  },
  editForm: {
    paddingHorizontal: 0,
    paddingTop: 16,
    paddingBottom: 0,
    gap: 12,
  },
  editCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 14,
    paddingBottom: 20,
    gap: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fieldGroup: {
    gap: 8,
  },
  fieldRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  fieldHalf: {
    flex: 1,
    gap: 8,
  },
  fieldLabel: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  labelRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  fieldInput: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 16,
    color: '#111827',
    textAlign: 'right',
    // No shadow – blend with sheet background
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    ...(Platform.OS === 'android' ? { elevation: 0 } : {}),
  },
  fieldTextArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  editActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    gap: 12,
    marginBottom: 8,
  },
  clearBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  clearText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '700',
  },
  applyBtn: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4C1D95',
  },
  applyText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  sheetHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    marginBottom: 8,
    alignSelf: 'center',
  },
  sheetTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  sheetClose: {
    position: 'absolute',
    left: 6,
    top: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  sheetClosePurple: {
    position: 'absolute',
    left: 6,
    top: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4C1D95',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedGroupCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  sharedCardTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  sharedGroupTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  sharedAvatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
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
    textAlign: 'center',
  },
  sharedEmptyText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  sharedProfileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    ...(Platform.OS === 'web' ? ({ boxShadow: 'none' } as any) : null),
  },
  sharedProfileHeaderRow: {
    width: '100%',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  sharedProfileTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
    flex: 1,
  },
  sharedMembersGrid: {
    width: '100%',
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
  },
  sharedLeaveBtnRow: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedMemberTile: {
    width: '31%',
    minWidth: 92,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 0,
    borderColor: 'transparent',
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    shadowColor: 'transparent',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    ...(Platform.OS === 'web' ? ({ boxShadow: '0 10px 22px rgba(0,0,0,0.10)' } as any) : null),
  },
  sharedMemberAvatarWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginBottom: 8,
  },
  sharedMemberAvatar: {
    width: '100%',
    height: '100%',
  },
  sharedMemberName: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 16,
    includeFontPadding: false,
  },
  sharedLeaveBtnOuter: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  sharedLeaveBtnInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sharedLeaveBtnTextNew: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  sharedLeaveBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  sharedLeaveBtnText: {
    color: '#F87171',
    fontWeight: '800',
    fontSize: 12,
  },
  aptCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  aptHeroCard: {
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  aptCoverWrap: {
    width: '100%',
    height: 176,
    backgroundColor: '#F3F4F6',
  },
  aptCoverPressable: {
    width: '100%',
    height: '100%',
  },
  aptCoverImg: {
    width: '100%',
    height: '100%',
  },
  aptCoverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 130,
  },
  aptCoverTextWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
    alignItems: 'flex-end',
    // Force LTR so "end" stays visually right on web RTL screens
    direction: 'ltr',
  },
  aptCoverTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'right',
    writingDirection: 'rtl',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  aptCoverCityRow: {
    marginTop: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  aptCoverCityText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  aptCoverOccupantsRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    direction: 'ltr',
  },
  aptOccupantAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.95)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  aptOccupantOverlap: {
    // overlap avatars
    marginLeft: -8,
  },
  aptOccupantAvatarImg: {
    width: '100%',
    height: '100%',
  },
  aptOccupantFallback: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '800',
  },
  aptOccupantOverflow: {
    borderColor: '#E9D5FF',
    backgroundColor: 'rgba(139,92,246,0.10)',
  },
  aptOccupantOverflowText: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '800',
  },
  aptLeaveBtnOuter: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  aptLeaveBtnInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 170,
  },
  aptLeaveBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  aptCover: {
    width: '100%',
    height: 140,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    marginBottom: 10,
  },
  aptRowCompact: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginBottom: 8,
  },
  aptThumbSmall: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  aptMetaWrap: {
    flex: 1,
    gap: 4,
  },
  aptMetaTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  aptMetaLine: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'right',
  },
  aptMetaPrice: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  aptTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  aptSub: {
    color: '#6B7280',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
  },
  groupItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  itemIcon: {
    // remove square background around icons
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerIcon: {
    backgroundColor: 'rgba(248,113,113,0.10)',
  },
  itemTextWrap: {
    flex: 1,
    gap: 2,
  },
  groupItemTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  groupItemSub: {
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 14,
  },
  dangerText: {
    color: '#F87171',
  },
  // Light gallery styles for edit sheet
  subsectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  subsectionTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  subsectionHint: {
    color: '#6B7280',
    fontSize: 12,
  },
  galleryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  galleryAddLightBtn: {
    backgroundColor: '#4C1D95',
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  galleryAddLightBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  galleryCountText: {
    color: '#6B7280',
    fontWeight: '700',
  },
  galleryGridLight: {
    marginTop: 12,
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
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
  galleryItemLight: {
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
  galleryImg: {
    width: '100%',
    height: '100%',
  },
  removeLightBtn: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipToggle: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  chipToggleActive: {
    borderColor: '#4C1D95',
    backgroundColor: '#EFEAFE',
  },
  chipToggleText: {
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 13,
  },
  chipToggleTextActive: {
    color: '#4C1D95',
  },
});


