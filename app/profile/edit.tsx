import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Save, X } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (!user?.id) { setLoading(false); return; }
        const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
        if (error) throw error;
        if (data) {
          setFullName(data.full_name || '');
          setAge(data.age ? String(data.age) : '');
          setBio(data.bio || '');
          setPhone(data.phone || '');
          setEmail(data.email || '');
          setCity(data.city || '');
        }
      } catch (e) {
        Alert.alert('שגיאה', 'לא ניתן לטעון את פרטי המשתמש');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    if (!fullName.trim()) {
      Alert.alert('שגיאה', 'שם מלא הוא שדה חובה');
      return;
    }
    const ageNum = age ? parseInt(age) : null;
    if (age && (isNaN(ageNum!) || ageNum! <= 0)) {
      Alert.alert('שגיאה', 'גיל לא תקין');
      return;
    }
    try {
      setSaving(true);
      const { error } = await supabase
        .from('users')
        .update({
          full_name: fullName,
          age: ageNum,
          bio: bio || null,
          phone: phone || null,
          email: email || null,
          city: city || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      Alert.alert('הצלחה', 'הפרטים נשמרו');
      router.back();
    } catch (e: any) {
      Alert.alert('שגיאה', e.message || 'לא ניתן לשמור');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7C5CFF" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>עריכת פרופיל</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>שם מלא</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} editable={!saving} />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>גיל</Text>
          <TextInput style={styles.input} value={age} onChangeText={setAge} keyboardType="numeric" editable={!saving} placeholder="לא חובה" />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>אימייל</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>טלפון</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="05X-XXXXXXX"
            editable={!saving}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>עיר</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            editable={!saving}
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
            editable={!saving}
          />
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.cancelBtn, saving && { opacity: 0.6 }]} onPress={() => router.back()} disabled={saving}>
            <X size={18} color="#9DA4AE" />
            <Text style={styles.cancelText}>ביטול</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#0F0F14" /> : <Save size={18} color="#0F0F14" />}
            <Text style={styles.saveText}>שמור</Text>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F0F14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  form: {
    marginTop: 8,
    paddingHorizontal: 16,
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  input: {
    backgroundColor: '#1B1C27',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    color: '#FFFFFF',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cancelText: {
    color: '#9DA4AE',
    fontWeight: '800',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#7C5CFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  saveText: {
    color: '#0F0F14',
    fontWeight: '900',
  },
});

