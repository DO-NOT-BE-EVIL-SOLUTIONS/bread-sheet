import { useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

// Stub screen — will be fully implemented in TICKET-005
export default function ProductScreen() {
  const { barcode } = useLocalSearchParams<{ barcode: string }>();

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.label}>Barcode</ThemedText>
      <ThemedText style={styles.barcode}>{barcode}</ThemedText>
      <ThemedText style={styles.hint}>Product details coming soon.</ThemedText>
    </ThemedView>
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