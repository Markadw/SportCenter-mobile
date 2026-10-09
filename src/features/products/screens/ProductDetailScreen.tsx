// src/features/products/screens/ProductDetailScreen.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronRight,
  Heart,
  Minus,
  Package,
  Plus,
  Share2,
  ShoppingCart,
  Truck,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { productsApi, type Product } from "../../../api";
import {
  colors,
  fontSize,
  radius,
  shadow,
  spacing,
} from "../../../constants/theme";

const { width: SCREEN_W } = Dimensions.get("window");
const IMG_H = SCREEN_W * 0.9;

export const ProductDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await productsApi.getById(id);
        if (!mounted) return;
        if (!data) {
          setError("Producto no encontrado");
        } else {
          setProduct(data);
        }
      } catch (e: any) {
        if (mounted) setError(e?.message ?? "Error al cargar producto");
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // --- Estados ---
  if (isLoading) {
    return <ProductDetailSkeleton />;
  }
  if (error || !product) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>
          {error ?? "Producto no encontrado"}
        </Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  const images = product.variants[0]?.images ?? [];
  const hasImages = images.length > 0;
  const outOfStock = product.totalStock === 0;

  const onImageScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (i !== imageIndex) setImageIndex(i);
  };

  const increment = () =>
    setQuantity((q) => Math.min(q + 1, product.totalStock || 1));
  const decrement = () => setQuantity((q) => Math.max(1, q - 1));

  return (
    <View style={styles.root}>
      {/* Header flotante */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [
            styles.headerBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>

        <View style={styles.headerRight}>
          <Pressable
            style={({ pressed }) => [
              styles.headerBtn,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => setLiked((v) => !v)}>
            <Heart
              size={20}
              color={liked ? colors.error : colors.text}
              fill={liked ? colors.error : "transparent"}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.headerBtn,
              pressed && { opacity: 0.7 },
            ]}>
            <Share2 size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}>
        {/* Galería */}
        <View style={styles.galleryWrap}>
          {hasImages ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={onImageScroll}
                scrollEventThrottle={16}>
                {images.map((uri, i) => (
                  <Image
                    key={i}
                    source={{ uri }}
                    style={styles.image}
                    resizeMode="contain"
                  />
                ))}
              </ScrollView>

              {images.length > 1 && (
                <View style={styles.dots}>
                  {images.map((_, i) => (
                    <View
                      key={i}
                      style={[styles.dot, i === imageIndex && styles.dotActive]}
                    />
                  ))}
                </View>
              )}

              {product.brandImage && (
                <View style={styles.brandFloating}>
                  <Image
                    source={{ uri: product.brandImage }}
                    style={styles.brandImg}
                    resizeMode="contain"
                  />
                </View>
              )}
            </>
          ) : (
            <View style={[styles.image, styles.imageEmpty]}>
              <Package size={48} color={colors.neutral} />
            </View>
          )}
        </View>

        {/* Bloque info principal */}
        <View style={styles.infoBlock}>
          <View style={styles.brandRow}>
            <View style={styles.brandChip}>
              <Text style={styles.brandChipText}>{product.brand}</Text>
            </View>
            <Text style={styles.skuText}>SKU: {product.variants[0]?.sku}</Text>
          </View>

          <Text style={styles.title}>{product.name}</Text>

          {outOfStock ? (
            <View style={styles.outOfStockPill}>
              <Text style={styles.outOfStockText}>Agotado</Text>
            </View>
          ) : (
            <View style={styles.stockPill}>
              <View style={styles.stockDot} />
              <Text style={styles.stockText}>
                {product.totalStock} disponibles
              </Text>
            </View>
          )}

          <Text style={styles.price}>${product.price.toFixed(2)}</Text>
        </View>

        {/* Atributos (Color, Talla, etc.) */}
        {Object.keys(product.attributes).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Características</Text>
            <View style={styles.attrsWrap}>
              {Object.entries(product.attributes).map(([k, v]) => (
                <View key={k} style={styles.attrItem}>
                  <Text style={styles.attrKey}>{k}</Text>
                  <Text style={styles.attrVal}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Deportes */}
        {product.sports.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Deportes</Text>
            <View style={styles.tagsRow}>
              {product.sports.map((s) => (
                <View key={s} style={styles.sportTag}>
                  <Text style={styles.sportTagText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Categoría */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Categoría</Text>
          <View style={styles.breadcrumb}>
            <Text style={styles.breadcrumbText}>{product.parentCategory}</Text>
            <ChevronRight size={14} color={colors.neutral} />
            <Text style={[styles.breadcrumbText, { color: colors.text }]}>
              {product.category}
            </Text>
          </View>
        </View>

        {/* Descripción */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Descripción</Text>
          <Text style={styles.description}>{product.description}</Text>
        </View>

        {/* Beneficios */}
        <View style={styles.benefits}>
          <View style={styles.benefitItem}>
            <Truck size={18} color={colors.primary} />
            <Text style={styles.benefitText}>Envío a todo el país</Text>
          </View>
          <View style={styles.benefitItem}>
            <Package size={18} color={colors.primary} />
            <Text style={styles.benefitText}>Devolución gratis 30 días</Text>
          </View>
        </View>
      </ScrollView>

      {/* Barra inferior fija */}
      <View style={styles.bottomBar}>
        <View style={styles.qtyBox}>
          <Pressable
            style={({ pressed }) => [
              styles.qtyBtn,
              pressed && { opacity: 0.6 },
            ]}
            onPress={decrement}
            disabled={quantity <= 1 || outOfStock}>
            <Minus
              size={16}
              color={
                quantity <= 1 || outOfStock ? colors.neutral : colors.primary
              }
            />
          </Pressable>

          <Text style={styles.qtyText}>{quantity}</Text>

          <Pressable
            style={({ pressed }) => [
              styles.qtyBtn,
              pressed && { opacity: 0.6 },
            ]}
            onPress={increment}
            disabled={quantity >= product.totalStock || outOfStock}>
            <Plus
              size={16}
              color={
                quantity >= product.totalStock || outOfStock
                  ? colors.neutral
                  : colors.primary
              }
            />
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            outOfStock && styles.addBtnDisabled,
            pressed && !outOfStock && { opacity: 0.9 },
          ]}
          disabled={outOfStock}
          onPress={() => {
            console.log("Agregar al carrito:", product.id, "x", quantity);
          }}>
          <ShoppingCart size={18} color={colors.white} />
          <Text style={styles.addBtnText}>
            {outOfStock ? "Agotado" : "Agregar"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1 },

  // Header flotante
  header: {
    position: "absolute",
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  headerRight: { flexDirection: "row", gap: spacing.sm },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },

  // Galería
  galleryWrap: {
    position: "relative",
    backgroundColor: colors.lightBg,
  },
  image: {
    width: SCREEN_W,
    height: IMG_H,
    backgroundColor: colors.white,
  },
  imageEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  dots: {
    position: "absolute",
    bottom: spacing.md,
    alignSelf: "center",
    flexDirection: "row",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.neutral,
    opacity: 0.5,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.primary,
    opacity: 1,
  },
  brandFloating: {
    position: "absolute",
    top: spacing.lg,
    right: spacing.lg,
    width: 44,
    height: 44,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    ...shadow.card,
  },
  brandImg: { width: "100%", height: "100%" },

  // Info
  infoBlock: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandChip: {
    alignSelf: "flex-start",
    backgroundColor: colors.brandChipBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  brandChipText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "700",
  },
  skuText: { fontSize: fontSize.xs, color: colors.neutral },
  title: {
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 28,
  },
  stockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  stockText: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: "600",
  },
  outOfStockPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(239,68,68,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  outOfStockText: {
    color: colors.error,
    fontWeight: "700",
    fontSize: fontSize.xs,
  },
  price: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.primary,
    marginTop: spacing.sm,
  },

  // Secciones
  section: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },

  // Atributos
  attrsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  attrItem: {
    backgroundColor: colors.lightBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minWidth: 100,
  },
  attrKey: {
    fontSize: fontSize.xs,
    color: colors.neutral,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  attrVal: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: "700",
    marginTop: 2,
  },

  // Deportes
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  sportTag: {
    backgroundColor: colors.brandChipBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  sportTagText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "700",
  },

  // Breadcrumb
  breadcrumb: { flexDirection: "row", alignItems: "center", gap: 4 },
  breadcrumbText: { fontSize: fontSize.sm, color: colors.textMuted },

  // Descripción
  description: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },

  // Beneficios
  benefits: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  benefitItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  benefitText: { fontSize: fontSize.sm, color: colors.textMuted },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.card,
  },
  qtyBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.lightBg,
    borderRadius: radius.md,
    paddingHorizontal: 4,
  },
  qtyBtn: {
    width: 36,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    minWidth: 24,
    textAlign: "center",
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.text,
  },
  addBtn: {
    flex: 1,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  addBtnDisabled: { backgroundColor: colors.neutral },
  addBtnText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: fontSize.md,
  },

  // Estados
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: colors.white,
  },
  errorTitle: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.error,
    marginBottom: spacing.lg,
  },
  backBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  backBtnText: {
    color: colors.white,
    fontWeight: "600",
    fontSize: fontSize.sm,
  },
});

/* ============ Skeleton ============ */

const SkeletonBlock = ({
  width,
  height,
  borderRadius = 8,
  style,
  pulse,
}: {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: any;
  pulse: Animated.Value;
}) => (
  <Animated.View
    style={[
      {
        width,
        height,
        borderRadius,
        backgroundColor: "#E1E8EE",
        opacity: pulse,
      },
      style,
    ]}
  />
);

const ProductDetailSkeleton = () => {
  const [pulse] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.root}>
      {/* Header flotante (botones reales, no skeleton) */}
      <View style={styles.header}>
        <View style={styles.headerBtn} />
        <View style={styles.headerRight}>
          <View style={styles.headerBtn} />
          <View style={styles.headerBtn} />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}>
        {/* Imagen grande */}
        <SkeletonBlock
          width="100%"
          height={IMG_H}
          borderRadius={0}
          pulse={pulse}
        />

        {/* Bloque info */}
        <View style={styles.infoBlock}>
          <View style={styles.brandRow}>
            <SkeletonBlock
              width={60}
              height={22}
              borderRadius={999}
              pulse={pulse}
            />
            <SkeletonBlock width={80} height={14} pulse={pulse} />
          </View>

          <SkeletonBlock
            width="90%"
            height={26}
            pulse={pulse}
            style={{ marginTop: 8 }}
          />
          <SkeletonBlock
            width="70%"
            height={26}
            pulse={pulse}
            style={{ marginTop: 6 }}
          />

          <SkeletonBlock
            width={120}
            height={16}
            pulse={pulse}
            style={{ marginTop: 10 }}
          />

          <SkeletonBlock
            width={140}
            height={36}
            pulse={pulse}
            style={{ marginTop: 10 }}
          />
        </View>

        {/* Sección Características */}
        <View style={styles.section}>
          <SkeletonBlock width={120} height={14} pulse={pulse} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <SkeletonBlock width={100} height={52} pulse={pulse} />
            <SkeletonBlock width={100} height={52} pulse={pulse} />
          </View>
        </View>

        {/* Sección Deportes */}
        <View style={styles.section}>
          <SkeletonBlock width={90} height={14} pulse={pulse} />
          <SkeletonBlock
            width={80}
            height={28}
            borderRadius={999}
            pulse={pulse}
            style={{ marginTop: 10 }}
          />
        </View>

        {/* Descripción */}
        <View style={styles.section}>
          <SkeletonBlock width={110} height={14} pulse={pulse} />
          <SkeletonBlock
            width="100%"
            height={14}
            pulse={pulse}
            style={{ marginTop: 10 }}
          />
          <SkeletonBlock
            width="95%"
            height={14}
            pulse={pulse}
            style={{ marginTop: 6 }}
          />
          <SkeletonBlock
            width="60%"
            height={14}
            pulse={pulse}
            style={{ marginTop: 6 }}
          />
        </View>
      </ScrollView>

      {/* Bottom bar skeleton */}
      <View style={styles.bottomBar}>
        <SkeletonBlock
          width={110}
          height={48}
          borderRadius={12}
          pulse={pulse}
        />
        <SkeletonBlock
          width="100%"
          height={48}
          borderRadius={12}
          pulse={pulse}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
};
