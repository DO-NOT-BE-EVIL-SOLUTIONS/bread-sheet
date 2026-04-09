import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { api } from '@/lib/api';
import { useRecentProducts } from '@/hooks/use-recent-products';

interface Product {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  image: string | null;
  description: string | null;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={starStyles.row}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)} hitSlop={8}>
          <Text style={[starStyles.star, star <= value && starStyles.filled]}>
            {star <= value ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const starStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  star: { fontSize: 30, color: '#ccc' },
  filled: { color: '#f5a623' },
});

export default function ProductScreen() {
  const { barcode } = useLocalSearchParams<{ barcode: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();

  const { addRecentProduct } = useRecentProducts();

  const [product, setProduct] = useState<Product | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [taste, setTaste] = useState(3);
  const [texture, setTexture] = useState(3);
  const [value, setValue] = useState(3);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get<Product>(`/api/products/${barcode}`)
      .then((data) => {
        if (!cancelled) {
          setProduct(data);
          addRecentProduct({ barcode: data.barcode, name: data.name, brand: data.brand, image: data.image });
        }
      })
      .catch((err: Error) => { if (!cancelled) setLoadError(err.message ?? 'Failed to load product'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [barcode]);

  const handleSubmit = useCallback(async () => {
    if (!product || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await api.post('/api/ratings', {
        barcode: product.barcode,
        taste,
        texture,
        value,
        comment: comment.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit rating');
    } finally {
      setSubmitting(false);
    }
  }, [product, taste, texture, value, comment, submitting]);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={colors.tint} />
      </ThemedView>
    );
  }

  if (loadError) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText style={styles.errorText}>{loadError}</ThemedText>
      </ThemedView>
    );
  }

  if (submitted) {
    return (
      <ThemedView style={styles.center}>
        <Text style={[styles.successIcon]}>🎉</Text>
        <ThemedText type="title" style={styles.successTitle}>Rating Submitted!</ThemedText>
        <ThemedText style={styles.successSubtitle}>Thanks for your review.</ThemedText>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.buttonText, { color: colors.background }]}>Go Back</Text>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scrollContent}
    >
      {product?.image ? (
        <Image source={{ uri: product.image }} style={styles.heroImage} resizeMode="cover" />
      ) : (
        <View style={[styles.heroPlaceholder, { backgroundColor: colors.icon + '22' }]}>
          <Text style={styles.placeholderIcon}>🍞</Text>
        </View>
      )}

      <View style={styles.infoSection}>
        <ThemedText type="title" style={styles.productName}>{product?.name}</ThemedText>
        {product?.brand ? (
          <ThemedText style={styles.brand}>{product.brand}</ThemedText>
        ) : null}
        {product?.description ? (
          <ThemedText style={styles.description}>{product.description}</ThemedText>
        ) : null}
        <ThemedText style={styles.barcodeChip}>{barcode}</ThemedText>
      </View>

      <View style={[styles.divider, { backgroundColor: colors.icon + '33' }]} />

      <View style={styles.ratingSection}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>Rate This Product</ThemedText>

        <View style={styles.ratingRow}>
          <ThemedText style={styles.ratingLabel}>Taste</ThemedText>
          <StarPicker value={taste} onChange={setTaste} />
        </View>
        <View style={styles.ratingRow}>
          <ThemedText style={styles.ratingLabel}>Texture</ThemedText>
          <StarPicker value={texture} onChange={setTexture} />
        </View>
        <View style={styles.ratingRow}>
          <ThemedText style={styles.ratingLabel}>Value</ThemedText>
          <StarPicker value={value} onChange={setValue} />
        </View>

        <TextInput
          style={[
            styles.commentInput,
            {
              color: colors.text,
              borderColor: colors.icon + '55',
              backgroundColor: colors.icon + '11',
            },
          ]}
          placeholder="Add a comment (optional)"
          placeholderTextColor={colors.icon}
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={3}
          maxLength={500}
          textAlignVertical="top"
        />

        {submitError ? (
          <ThemedText style={styles.errorText}>{submitError}</ThemedText>
        ) : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.tint }, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.background} size="small" />
          ) : (
            <Text style={[styles.buttonText, { color: colors.background }]}>Submit Rating</Text>
          )}
        </TouchableOpacity>
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
  heroImage: {
    width: '100%',
    height: 260,
  },
  heroPlaceholder: {
    width: '100%',
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 80,
  },
  infoSection: {
    padding: 20,
    gap: 6,
  },
  productName: {
    marginBottom: 2,
  },
  brand: {
    fontSize: 16,
    opacity: 0.6,
  },
  description: {
    fontSize: 14,
    opacity: 0.7,
    lineHeight: 20,
    marginTop: 4,
  },
  barcodeChip: {
    fontSize: 12,
    opacity: 0.4,
    marginTop: 6,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    marginHorizontal: 20,
  },
  ratingSection: {
    padding: 20,
    gap: 4,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginTop: 8,
    minHeight: 80,
  },
  button: {
    marginTop: 20,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#e05c5c',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  successIcon: {
    fontSize: 60,
  },
  successTitle: {
    textAlign: 'center',
  },
  successSubtitle: {
    opacity: 0.6,
    textAlign: 'center',
  },
});
