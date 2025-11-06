import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useApartmentStore } from '@/stores/apartmentStore';

export default function AddApartmentScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const addApartment = useApartmentStore((state) => state.addApartment);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [price, setPrice] = useState('');
  const [roomType, setRoomType] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (
      !title ||
      !address ||
      !city ||
      !price ||
      !roomType ||
      !bedrooms ||
      !bathrooms
    ) {
      setError('אנא מלא את כל השדות החובה');
      return;
    }

    const priceNum = parseFloat(price);
    const bedroomsNum = parseInt(bedrooms);
    const bathroomsNum = parseInt(bathrooms);

    if (isNaN(priceNum) || priceNum <= 0) {
      setError('מחיר לא תקין');
      return;
    }

    if (isNaN(bedroomsNum) || bedroomsNum <= 0) {
      setError('מספר חדרי שינה לא תקין');
      return;
    }

    if (isNaN(bathroomsNum) || bathroomsNum <= 0) {
      setError('מספר חדרי אמבטיה לא תקין');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const { data, error: insertError } = await supabase
        .from('apartments')
        .insert({
          owner_id: user!.id,
          title,
          description: description || null,
          address,
          city,
          price: priceNum,
          room_type: roomType,
          bedrooms: bedroomsNum,
          bathrooms: bathroomsNum,
          image_url: imageUrl || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      await supabase.from('apartment_members').insert({
        apartment_id: data.id,
        user_id: user!.id,
        role: 'owner',
      });

      addApartment(data);
      Alert.alert('הצלחה', 'הדירה נוספה בהצלחה');
      router.replace('/(tabs)/home');
    } catch (err: any) {
      setError(err.message || 'שגיאה בהוספת דירה');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setAddress('');
    setCity('');
    setPrice('');
    setRoomType('');
    setBedrooms('');
    setBathrooms('');
    setImageUrl('');
    setError('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>הוסף דירה חדשה</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                כותרת <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="לדוגמה: דירת 3 חדרים בתל אביב"
                value={title}
                onChangeText={setTitle}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>תיאור</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="תאר את הדירה בקצרה..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                כתובת <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="רחוב ומספר בית"
                value={address}
                onChangeText={setAddress}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                עיר <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="לדוגמה: תל אביב"
                value={city}
                onChangeText={setCity}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                מחיר לחודש (₪) <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="3000"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                סוג חדר <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="לדוגמה: פרטי, משותף"
                value={roomType}
                onChangeText={setRoomType}
                editable={!isLoading}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>
                  חדרי שינה <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="3"
                  value={bedrooms}
                  onChangeText={setBedrooms}
                  keyboardType="numeric"
                  editable={!isLoading}
                />
              </View>

              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>
                  חדרי אמבטיה <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="2"
                  value={bathrooms}
                  onChangeText={setBathrooms}
                  keyboardType="numeric"
                  editable={!isLoading}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>קישור לתמונה</Text>
              <TextInput
                style={styles.input}
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChangeText={setImageUrl}
                autoCapitalize="none"
                editable={!isLoading}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>הוסף דירה</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resetButton}
              onPress={resetForm}
              disabled={isLoading}>
              <Text style={styles.resetButtonText}>נקה טופס</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
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
  required: {
    color: '#F44336',
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  button: {
    backgroundColor: '#00BCD4',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: '#FFF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  resetButtonText: {
    color: '#757575',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    backgroundColor: '#FFEBEE',
    color: '#C62828',
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
    marginBottom: 16,
  },
});
