import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity, Alert, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { computeGroupAwareLabel } from '@/lib/group';
import { supabase } from '@/lib/supabase';
import { User } from '@/types/database';
import { ArrowLeft, MapPin, UserPlus2, Cigarette, PawPrint, Utensils, Moon, Users, Home, Calendar, User as UserIcon, Building2, Bed, Heart, Briefcase } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { fetchUserSurvey } from '@/lib/survey';
import { UserSurveyResponse } from '@/types/database';

export default function UserProfileScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams() as { id?: string | string[]; from?: string };
  const routeUserId = React.useMemo(() => {
    if (!id) return undefined;
    if (Array.isArray(id)) return id[0];
    return id;
  }, [id]);
  const insets = useSafeAreaInsets();
  const contentTopPadding = insets.top ;
  const contentBottomPadding = Math.max(180, insets.bottom + 120);

  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteLoading, setInviteLoading] = useState(false);
  const me = useAuthStore((s) => s.user);
  type GroupMember = Pick<User, 'id' | 'full_name' | 'avatar_url'>;
  const [groupContext, setGroupContext] = useState<{ name?: string | null; members: GroupMember[] } | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [galleryWidth, setGalleryWidth] = useState(0);
  const [survey, setSurvey] = useState<UserSurveyResponse | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [hasPendingMergeInvite, setHasPendingMergeInvite] = useState(false);
  const [meInApartment, setMeInApartment] = useState(false);
  const [profileInApartment, setProfileInApartment] = useState(false);
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);
  const [groupRefreshKey, setGroupRefreshKey] = useState(0);
  type ProfileApartment = {
    id: string;
    title?: string | null;
    city?: string | null;
    image_urls?: any;
    bedrooms?: number | null;
    bathrooms?: number | null;
    owner_id?: string | null;
    partner_ids?: (string | null)[] | null;
  };
  const [profileApartments, setProfileApartments] = useState<ProfileApartment[]>([]);
  const [profileAptLoading, setProfileAptLoading] = useState(false);
  const [apartmentOccupants, setApartmentOccupants] = useState<Record<string, GroupMember[]>>({});
  useEffect(() => {
    console.log('[profile-screen] render snapshot', {
      routeUserId,
      profileId: profile?.id,
    });
  }, [routeUserId, profile?.id]);
  const showMergeBlockedAlert = () => {
    const title = 'לא ניתן למזג פרופילים';
    const msg =
      'אי אפשר למזג פרופילים כאשר לשני המשתמשים כבר יש דירה משויכת (כבעלים או כשותפים). כדי למזג, יש להסיר את השיוך לדירה מאחד הצדדים תחילה.';
    try {
      Alert.alert(title, msg);
    } catch {
      try {
        // Fallback for web or environments where Alert fails
        // eslint-disable-next-line no-alert
        (globalThis as any)?.alert ? (globalThis as any).alert(`${title}\n\n${msg}`) : (window as any)?.alert?.(`${title}\n\n${msg}`);
      } catch {}
    }
    // Always also surface an inline notice so the user gets feedback even if popups are blocked
    setMergeNotice(msg);
    // Auto dismiss after 5s
    try {
      setTimeout(() => setMergeNotice((curr) => (curr === msg ? null : curr)), 5000);
    } catch {}
  };

  const APT_IMAGE_PLACEHOLDER =
    'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg';

  const transformSupabaseImageUrl = (value: string): string => {
    if (!value) return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (trimmed.includes('/storage/v1/object/public/')) {
      const [base, query] = trimmed.split('?');
      const transformed = base.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
      const params: string[] = [];
      if (query) {
        params.push(query);
      }
      params.push('width=800', 'quality=85');
      return `${transformed}?${params.join('&')}`;
    }
    return trimmed;
  };

  const ApartmentImageThumb = ({
    uri,
    style,
  }: {
    uri: string;
    style?: any;
  }) => {
    const [failed, setFailed] = useState(false);
    const resolved = failed ? APT_IMAGE_PLACEHOLDER : uri || APT_IMAGE_PLACEHOLDER;
    return (
      <Image
        source={{ uri: resolved }}
        style={style}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  };


  const normalizeImageUrls = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return (value as unknown[])
        .filter((u) => typeof u === 'string' && !!(u as string).trim()) as string[];
    }
    if (typeof value === 'string') {
      // Try JSON first
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.filter((u: any) => typeof u === 'string' && !!u.trim());
        }
      } catch {
        // Not JSON – try Postgres array literal format: {"a","b"} or {a,b}
        try {
          const cleaned = value.replace(/^\s*\{|\}\s*$/g, '');
          if (!cleaned) return [];
          return cleaned
            .split(',')
            .map((s) => s.replace(/^"+|"+$/g, '').trim())
            .filter(Boolean);
        } catch {
          return [];
        }
      }
    }
    return [];
  };

  const normalizePartnerIds = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return (value as unknown[])
        .map((id) => {
          if (typeof id === 'string') return id.trim();
          if (id === null || id === undefined) return '';
          return String(id).trim();
        })
        .filter(Boolean) as string[];
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed
            .map((id: unknown) => {
              if (typeof id === 'string') return id.trim();
              if (id === null || id === undefined) return '';
              return String(id).trim();
            })
            .filter(Boolean) as string[];
        }
      } catch {
        try {
          const cleaned = value.replace(/^\s*\{|\}\s*$/g, '');
          if (!cleaned) return [];
          return cleaned
            .split(',')
            .map((s) => s.replace(/^"+|"+$/g, '').trim())
            .filter(Boolean);
        } catch {
          return [];
        }
      }
    }
    return [];
  };

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        setProfile(data);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]);

  // Re-fetch group context when screen regains focus (after approvals, etc.)
  useFocusEffect(
    React.useCallback(() => {
      setGroupRefreshKey((k) => k + 1);
      return () => {};
    }, [])
  );

  useEffect(() => {
    let cancelled = false;
    const fetchGroupContext = async (userId: string) => {
      setGroupLoading(true);
      try {
        const { data: membershipRows, error: membershipError } = await supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', userId)
          .eq('status', 'ACTIVE');
        if (membershipError) throw membershipError;
        const membership = (membershipRows || [])[0];
        if (!membership?.group_id) {
          if (!cancelled) setGroupContext(null);
          return;
        }
        const groupId = membership.group_id as string;

        const { data: groupRow, error: groupError } = await supabase
          .from('profile_groups')
          .select('id, name')
          .eq('id', groupId)
          .eq('status', 'ACTIVE')
          .maybeSingle();
        if (groupError) throw groupError;
        if (!groupRow) {
          if (!cancelled) setGroupContext(null);
          return;
        }

        const { data: memberRows, error: memberError } = await supabase
          .from('profile_group_members')
          .select('user_id')
          .eq('group_id', groupId)
          .eq('status', 'ACTIVE');
        if (memberError) throw memberError;
        const memberIds = (memberRows || []).map((row: any) => row.user_id).filter(Boolean);
        if (memberIds.length < 2) {
          if (!cancelled) setGroupContext(null);
          return;
        }

        const { data: usersRows, error: usersError } = await supabase
          .from('users')
          .select('id, full_name, avatar_url')
          .in('id', memberIds);
        if (usersError) throw usersError;
        const members = (usersRows || []) as GroupMember[];
        if (members.length < 2) {
          if (!cancelled) setGroupContext(null);
          return;
        }
        const sortedMembers = [...members].sort((a, b) => {
          if (a.id === userId) return -1;
          if (b.id === userId) return 1;
          return (a.full_name || '').localeCompare(b.full_name || '');
        });
        if (!cancelled) setGroupContext({ name: (groupRow as any)?.name, members: sortedMembers });
      } catch (error) {
        console.error('Failed to load group context', error);
        if (!cancelled) setGroupContext(null);
      } finally {
        if (!cancelled) setGroupLoading(false);
      }
    };

    if (profile?.id) {
      fetchGroupContext(profile.id);
    } else {
      setGroupContext(null);
    }

    return () => {
      cancelled = true;
    };
  }, [profile?.id, groupRefreshKey]);

  // Subscribe to realtime changes in group memberships to refresh UI instantly
  useEffect(() => {
    if (!profile?.id) return;
    try {
      const channel = supabase
        .channel(`user-${profile.id}-group-memberships`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'profile_group_members',
            filter: `user_id=eq.${profile.id}`,
          },
          () => {
            setGroupRefreshKey((k) => k + 1);
          }
        )
        .subscribe((status) => {
          // noop; subscription established
        });
      return () => {
        try {
          supabase.removeChannel(channel);
        } catch {}
      };
    } catch {
      // ignore
    }
  }, [profile?.id, routeUserId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!profile?.id) {
        setSurvey(null);
        return;
      }
      try {
        setSurveyLoading(true);
        const s = await fetchUserSurvey(profile.id);
        if (!cancelled) setSurvey(s);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to load survey', e);
        if (!cancelled) setSurvey(null);
      } finally {
        if (!cancelled) setSurveyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  // Detect if I already sent a pending merge invite to this user
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!me?.id || !profile?.id) {
          if (!cancelled) setHasPendingMergeInvite(false);
          return;
        }
        const { data: existing } = await supabase
          .from('profile_group_invites')
          .select('id')
          .eq('inviter_id', me.id)
          .eq('invitee_id', profile.id)
          .eq('status', 'PENDING')
          .maybeSingle();
        if (!cancelled) setHasPendingMergeInvite(!!existing?.id);
      } catch {
        if (!cancelled) setHasPendingMergeInvite(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.id, profile?.id]);

  // Load apartments associated with the viewed profile (owner or partner)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const targetUserId = profile?.id || routeUserId;
      if (!targetUserId) {
        setProfileApartments([]);
        setApartmentOccupants({});
        return;
      }
      // Debug: track profile ID for apartment loading
      console.log('[profile-screen] loading apartments for profile', targetUserId, {
        hasProfileId: !!profile?.id,
        fromRoute: routeUserId,
      });
      try {
        setProfileAptLoading(true);
        const selectColumns =
          'id, title, city, image_urls, bedrooms, bathrooms, owner_id, partner_ids';
        const owned = await supabase
          .from('apartments')
          .select(selectColumns)
          .eq('owner_id', targetUserId);
        if (owned.error) {
          console.error('[profile-screen] owned apartments error', owned.error);
        }
        const partnerFilter = `{${JSON.stringify(targetUserId)}}`;
        const partner = await supabase
          .from('apartments')
          .select(selectColumns)
          .filter('partner_ids', 'cs', partnerFilter);
        if (partner.error) {
          console.error('[profile-screen] partner apartments error', partner.error, {
            filter: partnerFilter,
          });
        }
        console.log('[profile-screen] apartments query result', {
          ownedError: owned.error,
          partnerError: partner.error,
          ownedCount: owned.data?.length,
          partnerCount: partner.data?.length,
          partnerFilter,
        });
        const merged = [...(owned.data || []), ...(partner.data || [])] as ProfileApartment[];
        const unique: Record<string, ProfileApartment> = {};
        merged.forEach((a) => {
          if (a?.id) unique[a.id] = a;
        });
        const uniqueApartments = Object.values(unique);
        console.log('[profile-screen] unique apartments', uniqueApartments);
        if (!cancelled) {
          setProfileApartments(uniqueApartments);
        }
        if (cancelled) return;
        if (!uniqueApartments.length) {
          if (!cancelled) setApartmentOccupants({});
          return;
        }
        try {
          const occupantIdSet = new Set<string>();
          uniqueApartments.forEach((apt) => {
            if (apt.owner_id) {
              occupantIdSet.add(String(apt.owner_id));
            }
            normalizePartnerIds(apt.partner_ids).forEach((pid) => occupantIdSet.add(pid));
          });
          console.log('[profile-screen] occupantIdSet', Array.from(occupantIdSet));
          if (!occupantIdSet.size) {
            if (!cancelled) setApartmentOccupants({});
            return;
          }
          const { data: occupantRows, error: occupantError } = await supabase
            .from('users')
            .select('id, full_name, avatar_url')
            .in('id', Array.from(occupantIdSet));
          if (occupantError) throw occupantError;
          console.log('[profile-screen] occupant rows', occupantRows?.length);
          const userMap = new Map<string, GroupMember>();
          (occupantRows || []).forEach((user) => {
            if (user?.id) {
              userMap.set(user.id, user as GroupMember);
            }
          });
          const occupantMap: Record<string, GroupMember[]> = {};
          uniqueApartments.forEach((apt) => {
            const occupantOrder: string[] = [];
            if (apt.owner_id) {
              occupantOrder.push(String(apt.owner_id));
            }
            const partnerIds = normalizePartnerIds(apt.partner_ids);
            if (partnerIds.length) {
              occupantOrder.push(...partnerIds);
            }
            const seen = new Set<string>();
            occupantMap[apt.id] = occupantOrder
              .filter((occupantId) => {
                if (seen.has(occupantId) || !userMap.has(occupantId)) {
                  return false;
                }
                seen.add(occupantId);
                return true;
              })
              .map((occupantId) => userMap.get(occupantId) as GroupMember);
          });
          console.log('[profile-screen] occupantMap', occupantMap);
          if (!cancelled) setApartmentOccupants(occupantMap);
        } catch (loadOccupantsError) {
          console.error('Failed to load apartment occupants', loadOccupantsError);
          if (!cancelled) setApartmentOccupants({});
        }
      } catch {
        if (!cancelled) {
          setProfileApartments([]);
          setApartmentOccupants({});
        }
      } finally {
        if (!cancelled) setProfileAptLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const handleMergeHeaderPress = () => {
    if (inviteLoading) return;
    if (!me?.id || !profile?.id) return;
    if (me.id === profile.id) {
      Alert.alert('שגיאה', 'לא ניתן לשלוח בקשה לעצמך.');
      return;
    }
    if (hasPendingMergeInvite) {
      Alert.alert('כבר שלחת', 'כבר קיימת בקשת מיזוג בהמתנה עבור משתמש זה.');
      return;
    }
    // Prefer showing the message immediately: verify live from DB to avoid stale state
    (async () => {
      try {
        const [
          meOwned,
          mePartner,
          profOwned,
          profPartner,
        ] = await Promise.all([
          supabase.from('apartments').select('id').eq('owner_id', me.id).limit(1),
          supabase.from('apartments').select('id').contains('partner_ids', [me.id] as any).limit(1),
          supabase.from('apartments').select('id').eq('owner_id', profile.id).limit(1),
          supabase.from('apartments').select('id').contains('partner_ids', [profile.id] as any).limit(1),
        ]);
        const isMeLinkedNow = ((meOwned.data || []).length + (mePartner.data || []).length) > 0;
        const isProfileLinkedNow = ((profOwned.data || []).length + (profPartner.data || []).length) > 0;
        if (isMeLinkedNow && isProfileLinkedNow) {
          showMergeBlockedAlert();
          return;
        }
      } catch (e) {
        // If the live check fails for any reason, fall back to state values
        if (meInApartment && profileInApartment) {
          showMergeBlockedAlert();
          return;
        }
      }
      // Otherwise proceed with invite flow
      ensureGroupAndInvite();
    })();
  };

  // Determine if both users are already associated with an apartment (owner or partner)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (me?.id) {
          const [owned, partner] = await Promise.all([
            supabase.from('apartments').select('id').eq('owner_id', me.id).limit(1),
            supabase.from('apartments').select('id').contains('partner_ids', [me.id] as any).limit(1),
          ]);
          if (!cancelled) {
            const any = ((owned.data || []).length + (partner.data || []).length) > 0;
            setMeInApartment(any);
          }
        } else if (!cancelled) {
          setMeInApartment(false);
        }
        if (profile?.id) {
          const [owned, partner] = await Promise.all([
            supabase.from('apartments').select('id').eq('owner_id', profile.id).limit(1),
            supabase.from('apartments').select('id').contains('partner_ids', [profile.id] as any).limit(1),
          ]);
          if (!cancelled) {
            const any = ((owned.data || []).length + (partner.data || []).length) > 0;
            setProfileInApartment(any);
          }
        } else if (!cancelled) {
          setProfileInApartment(false);
        }
      } catch {
        if (!cancelled) {
          setMeInApartment(false);
          setProfileInApartment(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.id, profile?.id]);

  const ensureGroupAndInvite = async () => {
    if (!me?.id) {
      Alert.alert('חיבור נדרש', 'כדי לשלוח בקשה למיזוג פרופילים יש להתחבר לחשבון.');
      return;
    }
    if (!profile?.id) return;
    if (me.id === profile.id) {
      Alert.alert('שגיאה', 'לא ניתן לשלוח בקשה לעצמך.');
      return;
    }
    try {
      setInviteLoading(true);
      // Double-check on press (in addition to state) that both users are associated with an apartment.
      // This prevents a race where the state hasn't updated yet.
      try {
        const [
          meOwned,
          mePartner,
          profOwned,
          profPartner,
        ] = await Promise.all([
          supabase.from('apartments').select('id').eq('owner_id', me.id).limit(1),
          supabase.from('apartments').select('id').contains('partner_ids', [me.id] as any).limit(1),
          supabase.from('apartments').select('id').eq('owner_id', profile.id).limit(1),
          supabase.from('apartments').select('id').contains('partner_ids', [profile.id] as any).limit(1),
        ]);
        const isMeLinked = ((meOwned.data || []).length + (mePartner.data || []).length) > 0;
        const isProfileLinked = ((profOwned.data || []).length + (profPartner.data || []).length) > 0;
        if (isMeLinked && isProfileLinked) {
          showMergeBlockedAlert();
          setInviteLoading(false);
          return;
        }
      } catch (e) {
        // If verification failed, continue with local state fallback (handled by button handler too)
      }
      // Prefer an existing ACTIVE group that I'm a member of; if none, fallback to a group I created; else create new
      const [{ data: myActiveMembership }, { data: createdByMeGroup, error: gErr }] = await Promise.all([
        supabase
          .from('profile_group_members')
          .select('group_id')
          .eq('user_id', me.id)
          .eq('status', 'ACTIVE')
          .maybeSingle(),
        supabase
          .from('profile_groups')
          .select('*')
          .eq('created_by', me.id)
          .in('status', ['PENDING', 'ACTIVE'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (gErr) throw gErr;

      let groupId = (myActiveMembership as any)?.group_id as string | undefined;
      if (!groupId) {
        groupId = (createdByMeGroup as any)?.id as string | undefined;
      }
      // Create group if none found
      if (!groupId) {
        // Try RPC first to bypass RLS safely
        let createdId: string | undefined;
        try {
          const { data: rpcGroup, error: rpcErr } = await supabase.rpc('create_profile_group_self', {
            p_name: 'שותפים',
            p_status: 'ACTIVE',
          });
          if (rpcErr) {
            // eslint-disable-next-line no-console
            console.error('[merge] RPC create_profile_group_self failed', {
              code: (rpcErr as any)?.code,
              message: (rpcErr as any)?.message,
              details: (rpcErr as any)?.details,
              hint: (rpcErr as any)?.hint,
            });
          } else {
            createdId = (rpcGroup as any)?.id || (rpcGroup as any)?.group_id || (rpcGroup as any);
          }
        } catch (e: any) {
          // eslint-disable-next-line no-console
          console.error('[merge] RPC create_profile_group_self exception', e?.message || e);
        }
        if (!createdId) {
          const { data: newGroup, error: cErr } = await supabase
            .from('profile_groups')
            .insert({
              created_by: me.id,
              name: 'שותפים',
              status: 'ACTIVE',
            })
            .select('*')
            .single();
          if (cErr) {
            // eslint-disable-next-line no-console
            console.error('[merge] direct insert profile_groups failed', {
              code: (cErr as any)?.code,
              message: (cErr as any)?.message,
              details: (cErr as any)?.details,
              hint: (cErr as any)?.hint,
              meId: me.id,
            });
            throw cErr;
          }
          createdId = (newGroup as any)?.id;
        }
        groupId = createdId;
      }
      // If we reused a group I created that is still PENDING, activate it now
      try {
        if ((createdByMeGroup as any)?.id && (createdByMeGroup as any)?.status && String((createdByMeGroup as any).status).toUpperCase() !== 'ACTIVE') {
          await supabase
            .from('profile_groups')
            .update({ status: 'ACTIVE' })
            .eq('id', (createdByMeGroup as any).id);
        }
      } catch {}

      // Ensure I (the inviter) am ACTIVE in this group before inviting anyone
      try {
        // Prefer SECURITY DEFINER RPC to bypass RLS safely
        const { error: rpcErr } = await supabase.rpc('add_self_to_group', { p_group_id: groupId });
        if (rpcErr) {
          // Fallback to client-side upsert if RPC not available
          const insertMe = await supabase
            .from('profile_group_members')
            .insert([{ group_id: groupId, user_id: me.id, status: 'ACTIVE' } as any], {
              onConflict: 'group_id,user_id',
              ignoreDuplicates: true,
            } as any);
          // If the row already exists (or insert ignored), force status to ACTIVE (best-effort)
          if ((insertMe as any)?.error || (insertMe as any)?.status === 409) {
            await supabase
              .from('profile_group_members')
              .update({ status: 'ACTIVE' })
              .eq('group_id', groupId as string)
              .eq('user_id', me.id);
          }
        }
      } catch {
        // ignore; worst case the invite still gets created and approver will join
      }

      // Prevent duplicate pending invite for same user in same group
      const { data: pendingInvite } = await supabase
        .from('profile_group_invites')
        .select('id,status')
        .eq('group_id', groupId)
        .eq('invitee_id', profile.id)
        .eq('status', 'PENDING')
        .maybeSingle();
      if (pendingInvite?.id) {
        Alert.alert('כבר שלחת', 'כבר קיימת בקשה בהמתנה עבור המשתמש הזה.');
        return;
      }

      // Create invite
      const { error: iErr } = await supabase.from('profile_group_invites').insert({
        group_id: groupId,
        inviter_id: me.id,
        invitee_id: profile.id,
      });
      if (iErr) throw iErr;

      // Create notification for recipient (use group-aware label)
      const inviterName = await computeGroupAwareLabel(me.id);

      const title = 'בקשת מיזוג פרופילים חדשה';
      const desc = `${inviterName} מזמין/ה אותך להצטרף לקבוצת שותפים ולהציג פרופיל ממוזג יחד`;
      await supabase.from('notifications').insert({
        sender_id: me.id,
        recipient_id: profile.id,
        title,
        description: desc,
      });

      Alert.alert('נשלח', 'הבקשה נשלחה ונשלחה התראה למשתמש/ת.');
      setHasPendingMergeInvite(true);
    } catch (e: any) {
      console.error('send merge invite failed', e);
      Alert.alert('שגיאה', e?.message || 'לא ניתן לשלוח את הבקשה כעת');
    } finally {
      setInviteLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4C1D95" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#FFFFFF' }}>לא נמצא משתמש</Text>
      </View>
    );
  }

  const galleryUrls = normalizeImageUrls((profile as any).image_urls);
  const gap = 6;
  const defaultItemSize = Math.floor((Dimensions.get('window').width - 16 * 2 - gap * 2) / 3);
  const galleryItemSize = galleryWidth
    ? Math.floor((galleryWidth - gap * 2) / 3)
    : defaultItemSize;
  const isMeInViewedGroup =
    !!me?.id && !!groupContext?.members?.some((m) => m.id === me.id);

  const SurveyPill = ({
    children,
    icon,
    lines = 1,
  }: {
    children: React.ReactNode;
    icon: React.ReactNode;
    lines?: number;
  }) => (
    <View style={styles.pill}>
      {icon}
      <Text style={styles.pillText} numberOfLines={lines}>{children}</Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: contentTopPadding,
        paddingBottom: contentBottomPadding,
      }}>
      {!!mergeNotice ? (
        <View style={styles.noticeWrap}>
          <Text style={styles.noticeText} numberOfLines={3}>{mergeNotice}</Text>
          <TouchableOpacity style={styles.noticeClose} onPress={() => setMergeNotice(null)} activeOpacity={0.85}>
            <Text style={styles.noticeCloseText}>סגור</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            try {
              if (from === 'partners') {
                router.replace('/(tabs)/partners');
                return;
              }
              // Prefer real back when available to preserve position
              // @ts-ignore - canGoBack exists on Expo Router
              if (typeof (router as any).canGoBack === 'function' && (router as any).canGoBack()) {
                router.back();
              } else {
                router.replace('/(tabs)/home');
              }
            } catch {
              router.replace('/(tabs)/home');
            }
          }}
        >
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        {groupLoading ? null : groupContext && groupContext.members.length >= 2 ? (
          <TouchableOpacity style={styles.mergedChip} activeOpacity={0.9}>
            <View style={styles.mergedAvatarsRow}>
              {groupContext.members
                .filter((m) => m.id !== profile.id)
                .slice(0, 3)
                .map((m, idx) => (
                <View
                  key={m.id}
                  style={[styles.mergedAvatarWrap, idx !== 0 && styles.mergedAvatarOverlap]}
                >
                  {m.avatar_url ? (
                    <Image source={{ uri: m.avatar_url }} style={styles.mergedAvatarImg} />
                  ) : (
                    <View style={styles.mergedAvatarFallback} />
                  )}
                </View>
              ))}
            </View>
          </TouchableOpacity>
        ) : null}
        {!groupLoading && me?.id && me.id !== profile.id && !isMeInViewedGroup ? (
          <TouchableOpacity
            style={[
              styles.mergeHeaderBtn,
              (inviteLoading || hasPendingMergeInvite || (meInApartment && profileInApartment)) ? styles.mergeBtnDisabled : null,
            ]}
            activeOpacity={0.9}
            onPress={handleMergeHeaderPress}
          >
            <UserPlus2 size={16} color="#FFFFFF" />
            <Text style={styles.mergeHeaderText}>{inviteLoading ? 'שולח...' : hasPendingMergeInvite ? 'נשלחה בקשה' : 'מיזוג'}</Text>
          </TouchableOpacity>
        ) : null}
        <Image
          source={{ uri: profile.avatar_url || 'https://cdn-icons-png.flaticon.com/512/847/847969.png' }}
          style={styles.avatar}
        />
        <Text style={styles.name}>
          {profile.full_name}{profile.age ? `, ${profile.age}` : ''}
        </Text>
        {!!profile.city && (
          <View style={styles.locationRow}>
            <MapPin size={14} color="#C9CDD6" />
            <Text style={styles.locationText}>{profile.city}</Text>
          </View>
        )}
      </View>

      {!!profile.bio && (
        <Text style={styles.headerBio} numberOfLines={6}>
          {profile.bio}
        </Text>
      )}

      {/* Viewed user's apartment(s) */}
      {!profileAptLoading && profileApartments.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            הדירה של {profile.full_name?.split(' ')?.[0] || 'המשתמש/ת'}
          </Text>
          {profileApartments.map((apt) => {
            const rawImages = normalizeImageUrls(apt.image_urls);
            const aptImages = rawImages
              .map(transformSupabaseImageUrl)
              .filter((url): url is string => !!url);
            const firstImg = aptImages.length > 0 ? aptImages[0] : APT_IMAGE_PLACEHOLDER;
            const occupantMembers = apartmentOccupants[apt.id] || [];
            const visibleOccupants = occupantMembers.slice(0, 4);
            const overflowCount = occupantMembers.length - visibleOccupants.length;
            return (
              <TouchableOpacity
                key={apt.id}
                style={styles.aptCard}
                activeOpacity={0.9}
                onPress={() => router.push({ pathname: '/apartment/[id]', params: { id: apt.id } })}
              >
                <View style={styles.aptThumbWrap}>
                  <ApartmentImageThumb uri={firstImg} style={styles.aptThumbImg} />
                </View>
                <View style={styles.aptInfo}>
                  <Text style={styles.aptTitle} numberOfLines={1}>
                    {apt.title || 'דירה'}
                  </Text>
                  {!!apt.city ? (
                    <Text style={styles.aptMeta} numberOfLines={1}>
                      {apt.city}
                    </Text>
                  ) : null}
                  {!!visibleOccupants.length ? (
                    <View style={styles.aptOccupantsRow}>
                      {visibleOccupants.map((member, idx) => {
                        const fallbackInitial = ((member.full_name || '').trim().charAt(0) || '?').toUpperCase();
                        return (
                          <View
                            key={member.id}
                            style={[
                              styles.aptOccupantAvatarWrap,
                              idx !== 0 && styles.aptOccupantOverlap,
                            ]}
                          >
                            {member.avatar_url ? (
                              <Image source={{ uri: member.avatar_url }} style={styles.aptOccupantAvatarImg} />
                            ) : (
                              <Text style={styles.aptOccupantFallback}>{fallbackInitial}</Text>
                            )}
                          </View>
                        );
                      })}
                      {overflowCount > 0 ? (
                        <View style={[styles.aptOccupantAvatarWrap, styles.aptOccupantOverflow]}>
                          <Text style={styles.aptOccupantOverflowText}>+{overflowCount}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {!!aptImages.length ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.aptImagesScroll}
                      contentContainerStyle={styles.aptImagesContent}
                    >
                      {aptImages.map((url, idx) => {
                        const isLast = idx === aptImages.length - 1;
                        return (
                          <ApartmentImageThumb
                            key={`${apt.id}-img-${idx}`}
                            uri={url}
                            style={[styles.aptImageThumb, !isLast ? styles.aptImageThumbSpacing : null]}
                          />
                        );
                      })}
                    </ScrollView>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Survey Preview - Personal */}
      {!surveyLoading && survey ? (
        <View style={styles.section}>
          <View style={styles.surveyCard}>
            <View style={styles.surveyBadgeRow}>
              <UserIcon size={14} color="#FFFFFF" />
              <Text style={[styles.surveyBadgeText, { color: '#FFFFFF' }]}>עליו</Text>
            </View>
            <View style={styles.pillsRow}>
              {'is_smoker' in survey && survey.is_smoker !== undefined && survey.is_smoker !== null ? (
                <SurveyPill icon={<Cigarette size={14} color="#FFFFFF" />}>
                  {survey.is_smoker ? 'מעשנ/ית' : 'לא מעשנ/ית'}
                </SurveyPill>
              ) : null}
              {'has_pet' in survey && survey.has_pet !== undefined && survey.has_pet !== null ? (
                <SurveyPill icon={<PawPrint size={14} color="#FFFFFF" />}>
                  {survey.has_pet ? 'עם חיית מחמד' : 'בלי חיית מחמד'}
                </SurveyPill>
              ) : null}
              {'is_shomer_shabbat' in survey && survey.is_shomer_shabbat !== undefined && survey.is_shomer_shabbat !== null ? (
                <SurveyPill icon={<Moon size={14} color="#FFFFFF" />}>
                  {survey.is_shomer_shabbat ? 'שומר/ת שבת' : 'לא שומר/ת שבת'}
                </SurveyPill>
              ) : null}
              {'keeps_kosher' in survey && survey.keeps_kosher !== undefined && survey.keeps_kosher !== null ? (
                <SurveyPill icon={<Utensils size={14} color="#FFFFFF" />}>
                  {survey.keeps_kosher ? 'כשר/ה' : 'גמיש/ה בכשרות'}
                </SurveyPill>
              ) : null}
              {survey.diet_type ? (
                <SurveyPill icon={<Utensils size={14} color="#FFFFFF" />}>
                  {survey.diet_type}
                </SurveyPill>
              ) : null}
              {survey.lifestyle ? (
                <SurveyPill icon={<Users size={14} color="#FFFFFF" />}>
                  {survey.lifestyle}
                </SurveyPill>
              ) : null}
              {Number.isFinite(survey.cleanliness_importance as number) ? (
                <SurveyPill icon={<Home size={14} color="#FFFFFF" />}>
                  נקיון: {String(survey.cleanliness_importance)}/5
                </SurveyPill>
              ) : null}
              {survey.cleaning_frequency ? (
                <SurveyPill icon={<Home size={14} color="#FFFFFF" />}>
                  {survey.cleaning_frequency}
                </SurveyPill>
              ) : null}
              {survey.hosting_preference ? (
                <SurveyPill icon={<Users size={14} color="#FFFFFF" />}>
                  אירוח: {survey.hosting_preference}
                </SurveyPill>
              ) : null}
              {survey.cooking_style ? (
                <SurveyPill icon={<Utensils size={14} color="#FFFFFF" />}>
                  {survey.cooking_style}
                </SurveyPill>
              ) : null}
              {survey.home_vibe ? (
                <SurveyPill icon={<Home size={14} color="#FFFFFF" />}>
                  {survey.home_vibe}
                </SurveyPill>
              ) : null}
            </View>

            {survey.is_sublet ? (
              <View style={styles.subletTag}>
                <Calendar size={14} color="#FFFFFF" />
                <Text style={[styles.subletTagText, { color: '#FFFFFF' }]}>
                  סאבלט{survey.sublet_month_from || survey.sublet_month_to ? ': ' : ''}
                  {survey.sublet_month_from ? survey.sublet_month_from : ''}
                  {survey.sublet_month_from && survey.sublet_month_to ? ' – ' : ''}
                  {survey.sublet_month_to ? survey.sublet_month_to : ''}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Apartment preferences */}
      {!surveyLoading && survey ? (
        <View style={styles.section}>
          <View style={styles.surveyCard}>
            <View style={styles.surveyBadgeRow}>
              <Home size={14} color="#FFFFFF" />
              <Text style={[styles.surveyBadgeText, { color: '#FFFFFF' }]}>על הדירה</Text>
            </View>
            {/* עיר */}
            {survey.preferred_city ? (
              <View style={styles.apGroupSection}>
                <Text style={styles.apGroupLabel}>עיר</Text>
                <View style={styles.apGroupRow}>
                  <SurveyPill icon={<MapPin size={14} color="#FFFFFF" />}>
                    {survey.preferred_city}
                  </SurveyPill>
                </View>
              </View>
            ) : null}

            {/* שכונות */}
            {Array.isArray(survey.preferred_neighborhoods) && survey.preferred_neighborhoods.filter(Boolean).length > 0 ? (
              <View style={styles.apGroupSection}>
                <Text style={styles.apGroupLabel}>שכונות</Text>
                <View style={styles.apGroupRow}>
                  {!!survey.preferred_city ? (
                    <SurveyPill icon={<MapPin size={14} color="#FFFFFF" />}>
                      {`ב־${survey.preferred_city}`}
                    </SurveyPill>
                  ) : null}
                  {survey.preferred_neighborhoods.filter(Boolean).map((n, idx) => (
                    <SurveyPill key={`neigh-${idx}-${n}`} icon={<MapPin size={14} color="#FFFFFF" />}>
                      {n}
                    </SurveyPill>
                  ))}
                </View>
              </View>
            ) : null}

            {/* תקציב */}
            {Number.isFinite(survey.price_range as number) || (survey.bills_included !== undefined && survey.bills_included !== null) ? (
              <View style={styles.apGroupSection}>
                <Text style={styles.apGroupLabel}>תקציב</Text>
                <View style={styles.apGroupRow}>
                  {Number.isFinite(survey.price_range as number) ? (
                    <SurveyPill icon={<Text style={styles.currencyIcon}>₪</Text>}>
                      {`₪${Number(survey.price_range).toLocaleString('he-IL')}`}
                    </SurveyPill>
                  ) : null}
                  {survey.bills_included !== undefined && survey.bills_included !== null ? (
                    <SurveyPill icon={<Text style={styles.currencyIcon}>₪</Text>}>
                      {survey.bills_included ? 'כולל חשבונות' : 'בלי חשבונות'}
                    </SurveyPill>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* קומה / מעלית / מרפסת */}
            {survey.floor_preference || (survey.has_elevator !== undefined && survey.has_elevator !== null) || (survey.has_balcony !== undefined && survey.has_balcony !== null) ? (
              <View style={styles.apGroupSection}>
                <Text style={styles.apGroupLabel}>קומה / מעלית / מרפסת</Text>
                <View style={styles.apGroupRow}>
                  {survey.floor_preference ? (
                    <SurveyPill icon={<Building2 size={14} color="#FFFFFF" />}>
                      קומה: {survey.floor_preference}
                    </SurveyPill>
                  ) : null}
                  {survey.has_elevator !== undefined && survey.has_elevator !== null ? (
                    <SurveyPill icon={<Building2 size={14} color="#FFFFFF" />}>
                      {survey.has_elevator ? 'עם מעלית' : 'בלי מעלית'}
                    </SurveyPill>
                  ) : null}
                  {survey.has_balcony !== undefined && survey.has_balcony !== null ? (
                    <SurveyPill icon={<Home size={14} color="#FFFFFF" />}>
                      {survey.has_balcony ? 'עם מרפסת' : 'בלי מרפסת'}
                    </SurveyPill>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* כניסה */}
            {survey.move_in_month ? (
              <View style={styles.apGroupSection}>
                <Text style={styles.apGroupLabel}>כניסה</Text>
                <View style={styles.apGroupRow}>
                  <SurveyPill icon={<Calendar size={14} color="#FFFFFF" />}>
                    {survey.move_in_month}
                  </SurveyPill>
                </View>
              </View>
            ) : null}

            {/* מספר שותפים */}
            {Number.isFinite(survey.preferred_roommates as number) ? (
              <View style={styles.apGroupSection}>
                <Text style={styles.apGroupLabel}>מספר שותפים</Text>
                <View style={styles.apGroupRow}>
                  <SurveyPill icon={<Users size={14} color="#FFFFFF" />}>
                    {survey.preferred_roommates}
                  </SurveyPill>
                </View>
              </View>
            ) : null}

            {/* כללי/נוסף */}
            {(survey.pets_allowed !== undefined && survey.pets_allowed !== null) || (survey.with_broker !== undefined && survey.with_broker !== null) || (survey.wants_master_room !== undefined && survey.wants_master_room !== null) ? (
              <View style={styles.apGroupSection}>
                <Text style={styles.apGroupLabel}>תוספות</Text>
                <View style={styles.apGroupRow}>
                  {survey.pets_allowed !== undefined && survey.pets_allowed !== null ? (
                    <SurveyPill icon={<PawPrint size={14} color="#FFFFFF" />}>
                      חיות בדירה: {survey.pets_allowed ? 'מותר' : 'לא מותר'}
                    </SurveyPill>
                  ) : null}
                  {survey.with_broker !== undefined && survey.with_broker !== null ? (
                    <SurveyPill icon={<Briefcase size={14} color="#FFFFFF" />}>
                      {survey.with_broker ? 'עם מתווך/ת' : 'ללא מתווך/ת'}
                    </SurveyPill>
                  ) : null}
                  {survey.wants_master_room !== undefined && survey.wants_master_room !== null ? (
                    <SurveyPill icon={<Bed size={14} color="#FFFFFF" />}>
                      {survey.wants_master_room ? 'מחפש/ת מאסטר' : 'לא חובה מאסטר'}
                    </SurveyPill>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Partner preferences */}
      {!surveyLoading && survey ? (
        <View style={styles.section}>
          <View style={styles.surveyCard}>
            <View style={styles.surveyBadgeRow}>
              <Heart size={14} color="#FFFFFF" />
              <Text style={[styles.surveyBadgeText, { color: '#FFFFFF' }]}>על השותף</Text>
            </View>
            <View style={styles.pillsRow}>
              {Number.isFinite((survey as any).preferred_age_min as number) || Number.isFinite((survey as any).preferred_age_max as number) ? (
                <SurveyPill icon={<Users size={14} color="#FFFFFF" />}>
                  גיל מועדף: {Number.isFinite((survey as any).preferred_age_min as number) ? (survey as any).preferred_age_min : '?'}
                  {' – '}
                  {Number.isFinite((survey as any).preferred_age_max as number) ? (survey as any).preferred_age_max : '?'}
                </SurveyPill>
              ) : null}
              {survey.preferred_gender ? (
                <SurveyPill icon={<Users size={14} color="#FFFFFF" />}>
                  מגדר מועדף: {survey.preferred_gender}
                </SurveyPill>
              ) : null}
              {survey.preferred_occupation ? (
                <SurveyPill icon={<Briefcase size={14} color="#FFFFFF" />}>
                  עיסוק מועדף: {survey.preferred_occupation}
                </SurveyPill>
              ) : null}
              {survey.partner_shabbat_preference ? (
                <SurveyPill icon={<Moon size={14} color="#FFFFFF" />}>
                  שבת: {survey.partner_shabbat_preference}
                </SurveyPill>
              ) : null}
              {survey.partner_diet_preference ? (
                <SurveyPill icon={<Utensils size={14} color="#FFFFFF" />}>
                  תזונה: {survey.partner_diet_preference}
                </SurveyPill>
              ) : null}
              {survey.partner_smoking_preference ? (
                <SurveyPill icon={<Cigarette size={14} color="#FFFFFF" />}>
                  עישון: {survey.partner_smoking_preference}
                </SurveyPill>
              ) : null}
              {survey.partner_pets_preference ? (
                <SurveyPill icon={<PawPrint size={14} color="#FFFFFF" />}>
                  חיות: {survey.partner_pets_preference}
                </SurveyPill>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      {galleryUrls.length ? (
        <View style={[styles.section, { paddingHorizontal: 12 }]}>
          <Text style={styles.sectionTitle}>גלריה</Text>
          <View
            style={styles.gallery}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w && Math.abs(w - galleryWidth) > 1) setGalleryWidth(w);
            }}
          >
            {galleryUrls.map((url, idx) => (
              <Image
                key={url + idx}
                source={{ uri: url }}
                style={[
                  styles.galleryImg,
                  {
                    width: galleryItemSize,
                    height: galleryItemSize,
                    marginRight: idx % 3 === 2 ? 0 : gap,
                    marginBottom: gap,
                  },
                ]}
              />
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
    direction: 'rtl',
    writingDirection: 'rtl',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F0F14',
  },
  header: {
    alignItems: 'center',
    paddingTop: 104,
    paddingBottom: 12,
  },
  headerBio: {
    color: '#C7CBD1',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 52,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mergedChip: {
    position: 'absolute',
    left: 60,
    top: 52,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  mergedChipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  mergedAvatarsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  mergedAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#1F1F29',
  },
  mergedAvatarOverlap: {
    marginRight: -12,
  },
  mergedAvatarImg: {
    width: '100%',
    height: '100%',
  },
  mergedAvatarFallback: {
    flex: 1,
    backgroundColor: '#2B2141',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1F1F29',
    marginBottom: 12,
  },
  name: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  locationText: {
    color: '#C9CDD6',
    fontSize: 13,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'right',
    alignSelf: 'flex-end',
  },
  surveyCard: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: '#17171F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  surveyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 14,
  },
  surveyBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  apGroupSection: {
    marginBottom: 10,
  },
  apGroupLabel: {
    color: '#C7CBD1',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'right',
    opacity: 0.9,
    writingDirection: 'rtl',
    alignSelf: 'flex-end',
  },
  apGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'transparent',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E5E7EB',
    flexShrink: 1,
    flexGrow: 1,
    textAlign: 'right',
  },
  currencyIcon: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 1,
  },
  subletTag: {
    marginTop: 16,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'transparent',
  },
  subletTagText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionText: {
    color: '#C7CBD1',
    fontSize: 15,
    lineHeight: 22,
  },
  mergeBtn: {
    marginTop: 4,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#4C1D95',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#4C1D95',
    shadowOpacity: 0.26,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  mergeBtnDisabled: {
    opacity: 0.75,
  },
  mergeBtnText: {
    color: '#0F0F14',
    fontSize: 15,
    fontWeight: '900',
  },
  mergeHeaderBtn: {
    position: 'absolute',
    right: 16,
    top: 52,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mergeHeaderText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  groupSection: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#17171F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    alignItems: 'center',
  },
  groupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#4C1D95',
    marginBottom: 12,
  },
  groupBadgeText: {
    color: '#0F0F14',
    fontSize: 13,
    fontWeight: '800',
  },
  groupTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  groupAvatars: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  groupAvatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#0F0F14',
    overflow: 'hidden',
    backgroundColor: '#1F1F29',
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupAvatarOverlap: {
    marginRight: -14,
  },
  groupAvatarHighlighted: {
    borderColor: '#4C1D95',
    borderWidth: 3,
  },
  groupAvatarImg: {
    width: '100%',
    height: '100%',
  },
  groupAvatarFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2B2141',
  },
  groupAvatarFallbackText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '800',
  },
  noticeWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    alignItems: 'flex-end',
    gap: 8,
  },
  noticeText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
  },
  noticeClose: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
  },
  noticeCloseText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '800',
  },
  groupNames: {
    color: '#C7CBD1',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  gallery: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    // gaps handled via per-item margins to ensure precise 3-per-row layout
    justifyContent: 'flex-start',
  },
  galleryImg: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#1F1F29',
  },
  aptCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  aptThumbWrap: {
    width: 84,
    height: 84,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1F1F29',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  aptThumbImg: {
    width: '100%',
    height: '100%',
  },
  aptInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  aptTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
  },
  aptMeta: {
    marginTop: 4,
    color: '#C9CDD6',
    fontSize: 12,
    textAlign: 'right',
  },
  aptCta: {
    color: '#4C1D95',
    fontSize: 13,
    fontWeight: '800',
  },
  aptOccupantsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 10,
  },
  aptOccupantAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: '#1F1F29',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  aptOccupantOverlap: {
    marginRight: -12,
  },
  aptOccupantAvatarImg: {
    width: '100%',
    height: '100%',
  },
  aptOccupantFallback: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '800',
  },
  aptOccupantOverflow: {
    borderColor: '#4C1D95',
    backgroundColor: 'rgba(124,92,255,0.12)',
  },
  aptOccupantOverflowText: {
    color: '#4C1D95',
    fontSize: 12,
    fontWeight: '800',
  },
  aptImagesScroll: {
    marginTop: 12,
    width: '100%',
    alignSelf: 'stretch',
  },
  aptImagesContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 4,
  },
  aptImageThumb: {
    width: 92,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#1F1F29',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  aptImageThumbSpacing: {
    marginLeft: 8,
  },
});




