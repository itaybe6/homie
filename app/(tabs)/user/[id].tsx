import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { User } from '@/types/database';
import { ArrowLeft, MapPin } from 'lucide-react-native';

export default function UserProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();

  const [profile, setProfile] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7C5CFF" />
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 16 }}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
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

      {profile.bio ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>אודות</Text>
          <Text style={styles.sectionText}>{profile.bio}</Text>
        </View>
      ) : null}

      {!!profile.image_urls?.length && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>גלריה</Text>
          <View style={styles.gallery}>
            {profile.image_urls.map((url, idx) => (
              <Image key={url + idx} source={{ uri: url }} style={styles.galleryImg} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F14',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F0F14',
  },
  header: {
    alignItems: 'center',
    paddingTop: 52,
    paddingBottom: 12,
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
  },
  sectionText: {
    color: '#C7CBD1',
    fontSize: 15,
    lineHeight: 22,
  },
  gallery: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  galleryImg: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#1F1F29',
  },
});



