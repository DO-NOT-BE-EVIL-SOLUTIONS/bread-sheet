import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/hooks/use-session';

/**
 * Entry point for the Add Product flow. The full multi-step capture + OCR +
 * AI-structuring experience is tracked in TICKET-P5-002; this placeholder
 * ships alongside TICKET-P5-001 so the "Add this product" CTA from the
 * product-not-found screen has a valid destination.
 *
 * This screen is only reachable by registered users. As a safety net, if an
 * anonymous user lands here via a deep link we show a dedicated prompt rather
 * than rendering the form.
 */
export default function AddProductScreen() {
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const router = useRouter();
  const { isAnonymous, session } = useSession();

  // Defence-in-depth for the access-control rule from P5-002 spec: anonymous
  // users who reach this route directly must be prompted to sign up rather
  // than seeing the add form.
  if (!session || isAnonymous) {
    return (
      <ThemedView style={styles.center}>
        <Text style={styles.icon}>🔒</Text>
        <ThemedText type="title" style={styles.title}>
          Sign up to add products
        </ThemedText>
        <ThemedText style={styles.body}>
          You need an account to contribute missing products.
        </ThemedText>
        <TouchableOpacity
          testID="add-product-signup"
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={() =>
            router.push({
              pathname: '/(auth)/signup',
              params: barcode
                ? { returnTo: `/product/${barcode}` }
                : {},
            })
          }
        >
          <Text style={[styles.buttonText, { color: colors.background }]}>
            Sign up
          </Text>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scrollContent}
      testID="add-product-screen"
    >
      <View style={styles.infoSection}>
        <ThemedText type="title">Add a product</ThemedText>
        <ThemedText style={styles.body}>
          Help others discover new products by submitting one we don&apos;t have yet.
        </ThemedText>
        {barcode ? (
          <View style={styles.barcodeRow}>
            <ThemedText style={styles.label}>Barcode</ThemedText>
            <ThemedText style={styles.barcodeValue} testID="add-product-barcode">
              {barcode}
            </ThemedText>
          </View>
        ) : null}
        <ThemedText style={styles.placeholderNote}>
          The full capture, OCR and review flow is coming in the next release.
          Thanks for scouting a missing product!
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  infoSection: {
    padding: 24,
    gap: 12,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    opacity: 0.75,
    textAlign: 'center',
    lineHeight: 22,
  },
  label: {
    fontSize: 13,
    opacity: 0.5,
    letterSpacing: 0.5,
  },
  barcodeRow: {
    marginTop: 12,
    gap: 4,
  },
  barcodeValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  placeholderNote: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 12,
    lineHeight: 20,
  },
  button: {
    alignSelf: 'stretch',
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
