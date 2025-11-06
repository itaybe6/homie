import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function PartnersScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}> 
        <Text style={styles.title}>שותפים</Text>
        <Text style={styles.subtitle}>כאן תופיע רשימת השותפים שלך</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#212121',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
  },
});


