import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft,
  MapPin,
  Bed,
  Bath,
  DollarSign,
  Users,
  Trash2,
} from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';
import { Apartment, User, ApartmentMember } from '@/types/database';

export default function ApartmentDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { user } = useAuthStore();
  const removeApartment = useApartmentStore((state) => state.removeApartment);

  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [owner, setOwner] = useState<User | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    fetchApartmentDetails();
  }, [id]);

  const fetchApartmentDetails = async () => {
    try {
      const { data: aptData, error: aptError } = await supabase
        .from('apartments')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (aptError) throw aptError;
      if (!aptData) {
        Alert.alert('שגיאה', 'דירה לא נמצאה');
        router.back();
        return;
      }

      setApartment(aptData);

      const { data: ownerData, error: ownerError } = await supabase
        .from('users')
        .select('*')
        .eq('id', aptData.owner_id)
        .maybeSingle();

      if (ownerError) throw ownerError;
      setOwner(ownerData);

      const { data: membersData, error: membersError } = await supabase
        .from('apartment_members')
        .select('user_id')
        .eq('apartment_id', id);

      if (membersError) throw membersError;

      if (membersData && membersData.length > 0) {
        const userIds = membersData.map((m) => m.user_id);
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('*')
          .in('id', userIds);

        if (usersError) throw usersError;
        setMembers(usersData || []);

        const currentUserMember = membersData.find(
          (m) => m.user_id === user?.id
        );
        setIsMember(!!currentUserMember);
      }
    } catch (error) {
      console.error('Error fetching apartment:', error);
      Alert.alert('שגיאה', 'לא ניתן לטעון את פרטי הדירה');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinApartment = async () => {
    if (!user || !apartment) return;

    try {
      const { error } = await supabase.from('apartment_members').insert({
        apartment_id: apartment.id,
        user_id: user.id,
        role: 'roommate',
      });

      if (error) throw error;

      Alert.alert('הצלחה', 'הצטרפת לדירה בהצלחה');
      fetchApartmentDetails();
    } catch (error: any) {
      Alert.alert('שגיאה', error.message || 'לא ניתן להצטרף לדירה');
    }
  };

  const handleLeaveApartment = async () => {
    if (!user || !apartment) return;

    Alert.alert('עזיבת הדירה', 'האם אתה בטוח שברצונך לעזוב את הדירה?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'עזוב',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('apartment_members')
              .delete()
              .eq('apartment_id', apartment.id)
              .eq('user_id', user.id);

            if (error) throw error;

            Alert.alert('הצלחה', 'עזבת את הדירה');
            fetchApartmentDetails();
          } catch (error: any) {
            Alert.alert('שגיאה', error.message || 'לא ניתן לעזוב את הדירה');
          }
        },
      },
    ]);
  };

  const handleDeleteApartment = async () => {
    if (!apartment) return;

    Alert.alert('מחיקת דירה', 'האם אתה בטוח שברצונך למחוק את הדירה?', [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחק',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('apartments')
              .delete()
              .eq('id', apartment.id);

            if (error) throw error;

            removeApartment(apartment.id);
            Alert.alert('הצלחה', 'הדירה נמחקה בהצלחה');
            router.back();
          } catch (error: any) {
            Alert.alert('שגיאה', error.message || 'לא ניתן למחוק את הדירה');
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

  if (!apartment) {
    return null;
  }

  const isOwner = user?.id === apartment.owner_id;

  return (
    <View style={styles.container}>
      <ScrollView>
        <View style={styles.imageContainer}>
          <Image
            source={{
              uri:
                apartment.image_url ||
                'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',
            }}
            style={styles.image}
          />
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}>
            <ArrowLeft size={24} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.headerSection}>
            <Text style={styles.title}>{apartment.title}</Text>
            <View style={styles.priceRow}>
              <DollarSign size={24} color="#4CAF50" />
              <Text style={styles.price}>{apartment.price}</Text>
              <Text style={styles.priceUnit}>/חודש</Text>
            </View>
          </View>

          <View style={styles.locationRow}>
            <MapPin size={20} color="#757575" />
            <Text style={styles.locationText}>{apartment.address}</Text>
          </View>

          <View style={styles.detailsRow}>
            <View style={styles.detailBox}>
              <Bed size={24} color="#00BCD4" />
              <Text style={styles.detailLabel}>חדרי שינה</Text>
              <Text style={styles.detailValue}>{apartment.bedrooms}</Text>
            </View>

            <View style={styles.detailBox}>
              <Bath size={24} color="#00BCD4" />
              <Text style={styles.detailLabel}>חדרי אמבטיה</Text>
              <Text style={styles.detailValue}>{apartment.bathrooms}</Text>
            </View>

            <View style={styles.detailBox}>
              <Users size={24} color="#00BCD4" />
              <Text style={styles.detailLabel}>שותפים</Text>
              <Text style={styles.detailValue}>{members.length}</Text>
            </View>
          </View>

          {apartment.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>תיאור</Text>
              <Text style={styles.description}>{apartment.description}</Text>
            </View>
          ) : null}

          {owner && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>בעל הדירה</Text>
              <View style={styles.ownerCard}>
                <Text style={styles.ownerName}>{owner.full_name}</Text>
                <Text style={styles.ownerEmail}>{owner.email}</Text>
              </View>
            </View>
          )}

          {members.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>שותפים</Text>
              {members.map((member) => (
                <View key={member.id} style={styles.memberCard}>
                  <Text style={styles.memberName}>{member.full_name}</Text>
                  {member.age && (
                    <Text style={styles.memberDetail}>גיל: {member.age}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {isOwner ? (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteApartment}>
            <Trash2 size={20} color="#FFF" />
            <Text style={styles.deleteButtonText}>מחק דירה</Text>
          </TouchableOpacity>
        ) : isMember ? (
          <TouchableOpacity
            style={styles.leaveButton}
            onPress={handleLeaveApartment}>
            <Text style={styles.leaveButtonText}>עזוב דירה</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.joinButton}
            onPress={handleJoinApartment}>
            <Text style={styles.joinButtonText}>הצטרף לדירה</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 300,
    backgroundColor: '#E0E0E0',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4CAF50',
    marginLeft: 4,
  },
  priceUnit: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  locationText: {
    fontSize: 16,
    color: '#757575',
    flex: 1,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  detailBox: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: '#757575',
    marginTop: 8,
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginTop: 4,
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
  description: {
    fontSize: 16,
    color: '#424242',
    lineHeight: 24,
  },
  ownerCard: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
  },
  ownerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  ownerEmail: {
    fontSize: 14,
    color: '#757575',
  },
  memberCard: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  memberDetail: {
    fontSize: 14,
    color: '#757575',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FFF',
  },
  joinButton: {
    backgroundColor: '#00BCD4',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  joinButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  leaveButton: {
    backgroundColor: '#FF9800',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  leaveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#F44336',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  deleteButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
