import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  PanResponder,
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

// ─── Taste Score Colour ───────────────────────────────────────────────────────
// Interpolates amber → green as score rises 0 → 10
function scoreColor(score: number): string {
  const t = score / 10; // 0..1
  if (t < 0.5) {
    // amber (#f5a623) → yellow (#f0d060)
    const r = Math.round(245 + (240 - 245) * (t / 0.5));
    const g = Math.round(166 + (208 - 166) * (t / 0.5));
    const b = Math.round(35 + (96 - 35) * (t / 0.5));
    return `rgb(${r},${g},${b})`;
  } else {
    // yellow → green (#4caf50)
    const u = (t - 0.5) / 0.5;
    const r = Math.round(240 + (76 - 240) * u);
    const g = Math.round(208 + (175 - 208) * u);
    const b = Math.round(96 + (80 - 96) * u);
    return `rgb(${r},${g},${b})`;
  }
}

// ─── TasteSlider ──────────────────────────────────────────────────────────────
//
// UX design:
//   • Large score badge front and centre
//   • Horizontal draggable track (snaps to 0.5)
//   • –0.5 / +0.5 stepper buttons for fine control
//   • Filled track colour transitions amber → green
//   • Tick marks at whole numbers
//
function TasteSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const TRACK_WIDTH = 280;
  const MIN = 0;
  const MAX = 10;
  const STEP = 0.5;
  const STEPS = (MAX - MIN) / STEP; // 20 intervals

  const trackRef = useRef<View>(null);
  const trackX = useRef(0);
  const startX = useRef(0);
  const startVal = useRef(value);

  const thumbAnim = useRef(new Animated.Value((value / MAX) * TRACK_WIDTH)).current;

  // Keep thumb position in sync when value changes via stepper
  useEffect(() => {
    Animated.spring(thumbAnim, {
      toValue: (value / MAX) * TRACK_WIDTH,
      useNativeDriver: false,
      speed: 30,
      bounciness: 4,
    }).start();
  }, [value]);

  const snap = (raw: number) => {
    const clamped = Math.max(MIN, Math.min(MAX, raw));
    return Math.round(clamped / STEP) * STEP;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        startX.current = evt.nativeEvent.pageX;
        startVal.current = value;
      },
      onPanResponderMove: (evt) => {
        const dx = evt.nativeEvent.pageX - startX.current;
        const delta = (dx / TRACK_WIDTH) * MAX;
        const snapped = snap(startVal.current + delta);
        onChange(snapped);
      },
    })
  ).current;

  const step = (dir: 1 | -1) => {
    onChange(snap(value + dir * STEP));
  };

  const color = scoreColor(value);
  const fillWidth = thumbAnim.interpolate({
    inputRange: [0, TRACK_WIDTH],
    outputRange: [0, TRACK_WIDTH],
    extrapolate: 'clamp',
  });

  return (
    <View style={sliderStyles.container}>
      {/* Score badge */}
      <View style={[sliderStyles.badge, { borderColor: color }]}>
        <Text style={[sliderStyles.scoreText, { color }]}>
          {value % 1 === 0 ? value.toFixed(1) : value.toString()}
        </Text>
        <Text style={sliderStyles.outOfText}>/10</Text>
      </View>

      {/* Stepper row */}
      <View style={sliderStyles.stepperRow}>
        <TouchableOpacity
          style={[sliderStyles.stepBtn, value <= MIN && sliderStyles.stepBtnDisabled]}
          onPress={() => step(-1)}
          disabled={value <= MIN}
          hitSlop={12}
        >
          <Text style={[sliderStyles.stepBtnText, value <= MIN && sliderStyles.stepBtnTextDisabled]}>−</Text>
        </TouchableOpacity>

        {/* Draggable track */}
        <View
          ref={trackRef}
          style={sliderStyles.track}
          {...panResponder.panHandlers}
        >
          {/* Fill */}
          <Animated.View
            style={[sliderStyles.trackFill, { width: fillWidth, backgroundColor: color }]}
            pointerEvents="none"
          />
          {/* Tick marks at whole numbers */}
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <View
              key={n}
              style={[
                sliderStyles.tick,
                { left: (n / MAX) * TRACK_WIDTH - 1 },
                n <= value && sliderStyles.tickFilled,
              ]}
            />
          ))}
          {/* Thumb */}
          <Animated.View
            style={[
              sliderStyles.thumb,
              { left: thumbAnim, backgroundColor: color },
            ]}
            pointerEvents="none"
          />
        </View>

        <TouchableOpacity
          style={[sliderStyles.stepBtn, value >= MAX && sliderStyles.stepBtnDisabled]}
          onPress={() => step(1)}
          disabled={value >= MAX}
          hitSlop={12}
        >
          <Text style={[sliderStyles.stepBtnText, value >= MAX && sliderStyles.stepBtnTextDisabled]}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Scale labels */}
      <View style={sliderStyles.labelsRow}>
        <Text style={sliderStyles.labelText}>0</Text>
        <Text style={sliderStyles.labelText}>5</Text>
        <Text style={sliderStyles.labelText}>10</Text>
      </View>
    </View>
  );
}

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 8;

const sliderStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 20,
    paddingVertical: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 3,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 4,
  },
  scoreText: {
    fontSize: 52,
    fontWeight: '800',
    lineHeight: 56,
    letterSpacing: -1,
  },
  outOfText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#999',
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0ece4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: {
    opacity: 0.35,
  },
  stepBtnText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#555',
    lineHeight: 28,
  },
  stepBtnTextDisabled: {
    color: '#aaa',
  },
  track: {
    width: 280,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: '#e0ddd8',
    justifyContent: 'center',
    overflow: 'visible',
  },
  trackFill: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    left: 0,
  },
  tick: {
    position: 'absolute',
    width: 2,
    height: TRACK_HEIGHT + 4,
    borderRadius: 1,
    backgroundColor: '#c8c4bc',
    top: -2,
  },
  tickFilled: {
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    marginLeft: -(THUMB_SIZE / 2),
    top: -(THUMB_SIZE - TRACK_HEIGHT) / 2,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 280,
    marginTop: -8,
  },
  labelText: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: '500',
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProductScreen() {
  const { barcode } = useLocalSearchParams<{ barcode: string }>();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();

  const { addRecentProduct } = useRecentProducts();

  const [product, setProduct] = useState<Product | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [taste, setTaste] = useState(5);
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
        comment: comment.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit rating');
    } finally {
      setSubmitting(false);
    }
  }, [product, taste, comment, submitting]);

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
        <Text style={styles.successIcon}>🎉</Text>
        <ThemedText type="title" style={styles.successTitle}>Rating Submitted!</ThemedText>
        <ThemedText style={styles.successSubtitle}>
          You gave it a {taste % 1 === 0 ? taste.toFixed(1) : taste}/10 for taste.
        </ThemedText>
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
        <ThemedText type="subtitle" style={styles.sectionTitle}>How does it taste?</ThemedText>
        <ThemedText style={styles.sectionHint}>Drag the slider or use − / + to set your score.</ThemedText>

        <TasteSlider value={taste} onChange={setTaste} />

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
    alignItems: 'center',
  },
  sectionTitle: {
    marginBottom: 2,
    textAlign: 'center',
  },
  sectionHint: {
    fontSize: 13,
    opacity: 0.5,
    textAlign: 'center',
    marginBottom: 12,
  },
  commentInput: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    marginTop: 24,
    minHeight: 80,
  },
  button: {
    alignSelf: 'stretch',
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
