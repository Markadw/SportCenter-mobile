// src/features/home/components/BannerCarousel.tsx
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { colors, radius, shadow, spacing } from "../../../constants/theme";
import { useBanners, type Banner } from "../../banners";

const { width: SCREEN_W } = Dimensions.get("window");

// 👇 Card MÁS grande, con peek lateral marcado
const CARD_W = SCREEN_W * 0.88;
const CARD_H = CARD_W * (300 / 800);
const GAP = spacing.sm;
const SNAP = CARD_W + GAP;
const SIDE_PEEK = (SCREEN_W - CARD_W) / 2;
const AUTO_PLAY_MS = 4000;

export const BannerCarousel = () => {
  const router = useRouter();
  const { banners, isLoading } = useBanners();

  // Clonamos: [último, ...banners, primero] para loop infinito
  const loopedBanners = useMemo(() => {
    if (banners.length === 0) return [];
    return [banners[banners.length - 1], ...banners, banners[0]];
  }, [banners]);

  const listRef = useRef<FlatList<Banner>>(null);
  const [index, setIndex] = useState(1); // arrancamos en el "1" real
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAnimating = useRef(false);

  const stopAutoPlay = useCallback(() => {
    if (autoPlayRef.current) {
      clearInterval(autoPlayRef.current);
      autoPlayRef.current = null;
    }
  }, []);

  const startAutoPlay = useCallback(() => {
    if (banners.length < 2) return;
    stopAutoPlay();
    autoPlayRef.current = setInterval(() => {
      if (isAnimating.current) return;
      isAnimating.current = true;

      setIndex((prev) => {
        const next = prev + 1;
        listRef.current?.scrollToOffset({
          offset: next * SNAP,
          animated: true,
        });
        return next;
      });
    }, AUTO_PLAY_MS);
  }, [banners.length, stopAutoPlay]);

  useEffect(() => {
    if (banners.length < 2) return;
    // Posiciona en el primer banner "real"
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: SNAP, animated: false });
    });
    startAutoPlay();
    return stopAutoPlay;
  }, [banners.length, startAutoPlay, stopAutoPlay]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    isAnimating.current = false;
    const offset = e.nativeEvent.contentOffset.x;
    const currentIndex = Math.round(offset / SNAP);
    const realCount = banners.length;

    // Si llegamos al clon final → saltar al primer real sin animación
    if (currentIndex === realCount + 1) {
      listRef.current?.scrollToOffset({
        offset: SNAP * 1,
        animated: false,
      });
      setIndex(1);
      return;
    }

    // Si llegamos al clon inicial (por scroll manual hacia atrás)
    if (currentIndex === 0) {
      listRef.current?.scrollToOffset({
        offset: SNAP * realCount,
        animated: false,
      });
      setIndex(realCount);
      return;
    }

    setIndex(currentIndex);
  };

  if (isLoading && banners.length === 0) {
    return (
      <View style={[styles.wrap, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (banners.length === 0) return null;

  // Índice "real" para los dots (0..realCount-1)
  const realIndex = ((index - 1) % banners.length + banners.length) % banners.length;

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={loopedBanners}
        keyExtractor={(item, i) => `${item.id}-${i}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP}
        decelerationRate="fast"
        bounces={false}
        contentContainerStyle={{ paddingHorizontal: SIDE_PEEK }}
        ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
        onScrollBeginDrag={stopAutoPlay}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollEndDrag={onMomentumScrollEnd}
        getItemLayout={(_, i) => ({
          length: SNAP,
          offset: SNAP * i,
          index: i,
        })}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.96 }]}
            onPress={() => router.push("/catalog")}
          >
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.image}
              resizeMode="cover"
              accessibilityLabel={item.altText}
            />
          </Pressable>
        )}
      />

      {banners.length > 1 && (
        <View style={styles.dots}>
          {banners.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === realIndex && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  center: { height: CARD_H, alignItems: "center", justifyContent: "center" },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: colors.white,
    ...shadow.card,
  },
  image: { width: "100%", height: "100%" },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neutral,
    opacity: 0.4,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.primary,
    opacity: 1,
  },
});