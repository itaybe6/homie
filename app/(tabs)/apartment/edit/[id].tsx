import { useLocalSearchParams } from 'expo-router';
import AddApartmentScreen from '../../add-apartment';

export default function EditApartmentScreen() {
  const { id } = useLocalSearchParams();
  return <AddApartmentScreen mode="edit" apartmentId={String(id || '')} />;
}


