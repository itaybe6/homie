import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { MapPin, Bed, Bath, DollarSign, Filter, MessageSquare } from 'lucide-react-native';
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
      <View style={styles.imageWrap}>
        <Image
          source={{
            uri:
              (apartment as any).image_urls?.[0] ||
              apartment.image_url ||
              'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg',
          }}
          style={styles.image}
        />

        <TouchableOpacity activeOpacity={0.85} style={styles.overlayButton}>
          <Filter size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {apartment.title}
          </Text>
          <View style={styles.priceContainer}>
            <DollarSign size={16} color="#22C55E" />
            <Text style={styles.price}>{apartment.price}</Text>
            <Text style={styles.priceUnit}>/חודש</Text>
          </View>
        </View>

        <View style={styles.locationRow}>
          <MapPin size={16} color="#9DA4AE" />
          <Text style={styles.location}>{apartment.city}</Text>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detail}>
            <Bed size={16} color="#7C5CFF" />
            <Text style={styles.detailText}>{apartment.bedrooms}</Text>
          </View>

          <View style={styles.detail}>
            <Bath size={16} color="#7C5CFF" />
            <Text style={styles.detailText}>{apartment.bathrooms}</Text>
          </View>
        </View>

        <View style={styles.chipsRow}>
          {['Pets ok', 'Non-smoking', 'Furnished'].map((label) => (
            <View key={label} style={styles.chip}>
              <Text style={styles.chipText}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footerRow}>
          {apartment.description ? (
            <Text style={styles.description} numberOfLines={2}>
              {apartment.description}
            </Text>
          ) : (
            <View />
          )}

          <TouchableOpacity activeOpacity={0.9} style={styles.chatBtn}>
            <MessageSquare size={16} color="#0F0F14" />
            <Text style={styles.chatBtnText}>צ׳אט</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#17171F',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: '#22232E',
  },
  overlayButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,15,20,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  content: {
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
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
    color: '#9DA4AE',
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
    color: '#E5E7EB',
    fontWeight: '700',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  price: {
    fontSize: 18,
    fontWeight: '900',
    color: '#22C55E',
  },
  priceUnit: {
    fontSize: 12,
    color: '#9DA4AE',
    marginLeft: 2,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1F1F29',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chipText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  description: {
    fontSize: 14,
    color: '#C7CBD1',
    lineHeight: 20,
    flex: 1,
  },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#A78BFA',
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 14,
    marginLeft: 12,
  },
  chatBtnText: {
    color: '#0F0F14',
    fontSize: 14,
    fontWeight: '800',
  },
});
