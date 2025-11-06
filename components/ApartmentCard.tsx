import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { MapPin, Bed, Bath, DollarSign } from 'lucide-react-native';
import { Apartment } from '@/types/database';

interface ApartmentCardProps {
  apartment: Apartment;
  onPress: () => void;
}

export default function ApartmentCard({
  apartment,
  onPress,
}: ApartmentCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <Image
        source={{
          uri:
            apartment.image_url ||
            'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',
        }}
        style={styles.image}
      />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {apartment.title}
        </Text>

        <View style={styles.locationRow}>
          <MapPin size={16} color="#757575" />
          <Text style={styles.location}>{apartment.city}</Text>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detail}>
            <Bed size={16} color="#00BCD4" />
            <Text style={styles.detailText}>{apartment.bedrooms}</Text>
          </View>

          <View style={styles.detail}>
            <Bath size={16} color="#00BCD4" />
            <Text style={styles.detailText}>{apartment.bathrooms}</Text>
          </View>

          <View style={styles.priceContainer}>
            <DollarSign size={16} color="#4CAF50" />
            <Text style={styles.price}>{apartment.price}</Text>
            <Text style={styles.priceUnit}>/חודש</Text>
          </View>
        </View>

        {apartment.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {apartment.description}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: '#E0E0E0',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  location: {
    fontSize: 14,
    color: '#757575',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 14,
    color: '#424242',
    fontWeight: '600',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
  },
  priceUnit: {
    fontSize: 12,
    color: '#757575',
    marginLeft: 2,
  },
  description: {
    fontSize: 14,
    color: '#616161',
    lineHeight: 20,
  },
});
