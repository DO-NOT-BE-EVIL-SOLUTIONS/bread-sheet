import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

// Stub screen — will be fully implemented in TICKET-005
export default function ProductScreen() {
  const { barcode } = useLocalSearchParams<{ barcode: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Barcode</Text>
      <Text style={styles.barcode}>{barcode}</Text>
      <Text style={styles.hint}>Product details coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  label: {
    fontSize: 13,
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  barcode: {
    fontSize: 28,
    fontWeight: '700',
  },
  hint: {
    marginTop: 8,
    opacity: 0.4,
    fontSize: 14,
  },
});
