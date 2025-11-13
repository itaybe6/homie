import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Edit, FileText, LogOut, Trash2, ChevronLeft, Pencil } from 'lucide-react-native';
import { useAuthStore } from '@/stores/authStore';
import { authService } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { User } from '@/types/database';

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [profile, setProfile] = useState<User | null>(null);

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
      const { error: deleteError } = await supabase.from('users').delete().eq('id', user.id);
      if (deleteError) throw deleteError;

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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>הגדרות</Text>
      </View>

      <View style={styles.content}>
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
            <TouchableOpacity
              onPress={() => router.push('/profile/edit')}
              style={styles.avatarEditBtn}
              activeOpacity={0.9}
            >
              <Pencil size={14} color="#0F0F14" />
            </TouchableOpacity>
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
            onPress={() => router.push('/profile/edit')}
            activeOpacity={0.9}
          >
            <View style={styles.itemIcon}>
              <Edit size={18} color="#E5E7EB" />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={styles.groupItemTitle}>עריכת פרופיל</Text>
              <Text style={styles.groupItemSub}>עדכון פרטים ותמונות</Text>
            </View>
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.groupItem}
            onPress={() => router.push('/terms')}
            activeOpacity={0.9}
          >
            <View style={styles.itemIcon}>
              <FileText size={18} color="#E5E7EB" />
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={styles.groupItemTitle}>תנאי שימוש</Text>
              <Text style={styles.groupItemSub}>קריאת התקנון והמדיניות</Text>
            </View>
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>אבטחה וחשבון</Text>
        <View style={styles.groupCard}>
          <TouchableOpacity
            style={styles.groupItem}
            onPress={isSigningOut ? undefined : handleSignOut}
            activeOpacity={0.9}
          >
            <View style={[styles.itemIcon, styles.dangerIcon]}>
              {isSigningOut ? (
                <ActivityIndicator size="small" color="#FCA5A5" />
              ) : (
                <LogOut size={18} color="#FCA5A5" />
              )}
            </View>
            <View style={styles.itemTextWrap}>
              <Text style={[styles.groupItemTitle, styles.dangerText]}>
                {isSigningOut ? 'מתנתק...' : 'התנתק'}
              </Text>
              <Text style={styles.groupItemSub}>יציאה מהחשבון</Text>
            </View>
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>

          <View style={styles.divider} />

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
            <ChevronLeft size={18} color="#9DA4AE" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  profileCard: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    padding: 18,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#1F1F29',
  },
  avatarEditBtn: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#A78BFA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0F0F14',
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 2,
  },
  profileSub: {
    color: '#9DA4AE',
    fontSize: 13,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 8,
  },
  groupCard: {
    backgroundColor: '#15151C',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerIcon: {
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  itemTextWrap: {
    flex: 1,
    gap: 2,
  },
  groupItemTitle: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  groupItemSub: {
    color: '#9DA4AE',
    fontSize: 12,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 14,
  },
  dangerText: {
    color: '#F87171',
  },
});


