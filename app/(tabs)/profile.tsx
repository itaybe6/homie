import { useEffect, useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut, Edit, Save, X } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { authService } from '@/lib/auth';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import { User, Apartment } from '@/types/database';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const apartments = useApartmentStore((state) => state.apartments);

  const [profile, setProfile] = useState<User | null>(null);
  const [userApartments, setUserApartments] = useState<Apartment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState('');

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

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
        setInterests(profileData.interests || '');
      }

      const { data: aptData, error: aptError } = await supabase
        .from('apartments')
        .select('*')
        .eq('owner_id', user.id);

      if (aptError) throw aptError;
      setUserApartments(aptData || []);
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
          interests: interests || null,
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
      setInterests(profile.interests || '');
    }
    setIsEditing(false);
  };

  const handleSignOut = async () => {
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
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00BCD4" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>הפרופיל שלי</Text>
          <View style={styles.headerActions}>
            {isEditing ? (
              <>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={handleCancelEdit}
                  disabled={isSaving}>
                  <X size={20} color="#757575" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveProfile}
                  disabled={isSaving}>
                  {isSaving ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Save size={20} color="#FFF" />
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setIsEditing(true)}>
                <Edit size={20} color="#00BCD4" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>פרטים אישיים</Text>

            {isEditing ? (
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>שם מלא</Text>
                  <TextInput
                    style={styles.input}
                    value={fullName}
                    onChangeText={setFullName}
                    editable={!isSaving}
                  />
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
                    placeholder="ספר קצת על עצמך..."
                    editable={!isSaving}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>תחומי עניין</Text>
                  <TextInput
                    style={styles.input}
                    value={interests}
                    onChangeText={setInterests}
                    placeholder="ספורט, מוזיקה, קולנוע..."
                    editable={!isSaving}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>שם מלא:</Text>
                  <Text style={styles.infoValue}>{profile?.full_name}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>אימייל:</Text>
                  <Text style={styles.infoValue}>{profile?.email}</Text>
                </View>

                {profile?.age && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>גיל:</Text>
                    <Text style={styles.infoValue}>{profile.age}</Text>
                  </View>
                )}

                {profile?.bio && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>אודות:</Text>
                    <Text style={styles.infoValue}>{profile.bio}</Text>
                  </View>
                )}

                {profile?.interests && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>תחומי עניין:</Text>
                    <Text style={styles.infoValue}>{profile.interests}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>הדירות שלי</Text>
            {userApartments.length > 0 ? (
              userApartments.map((apt) => (
                <TouchableOpacity
                  key={apt.id}
                  style={styles.apartmentCard}
                  onPress={() => router.push(`/apartment/${apt.id}`)}>
                  <Text style={styles.apartmentTitle}>{apt.title}</Text>
                  <Text style={styles.apartmentLocation}>
                    {apt.city} • ₪{apt.price}/חודש
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyText}>אין לך דירות</Text>
            )}
          </View>

          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <LogOut size={20} color="#F44336" />
            <Text style={styles.signOutText}>התנתק</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    padding: 8,
  },
  cancelButton: {
    padding: 8,
  },
  saveButton: {
    backgroundColor: '#00BCD4',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  infoRow: {
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: '#757575',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 16,
    color: '#212121',
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
  },
  input: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  apartmentCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  apartmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  apartmentLocation: {
    fontSize: 14,
    color: '#757575',
  },
  emptyText: {
    fontSize: 14,
    color: '#9E9E9E',
    textAlign: 'center',
    paddingVertical: 20,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    marginTop: 16,
  },
  signOutText: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: '600',
  },
});
