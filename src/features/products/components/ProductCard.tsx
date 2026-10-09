// src/features/products/components/ProductCard.tsx
import { Share2 } from "lucide-react-native";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "../../../constants/theme";
import type { Product } from "../types";

interface Props {
  product: Product;
  onPress?: (product: Product) => void;
  onShare?: (product: Product) => void;
}

const PLACEHOLDER = "https://via.placeholder.com/300x300?text=SportCenter";

export const ProductCard = ({ product, onPress, onShare }: Props) => {
  const outOfStock = product.totalStock === 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
      onPress={() => onPress?.(product)}
    >
      {/* Imagen (fondo blanco) */}
      <View style={styles.imageWrap}>
        <Image
          source={{ uri: product.mainImage ?? PLACEHOLDER }}
          style={styles.image}
          resizeMode="contain"
        />

        <Pressable
          style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.7 }]}
          onPress={(e) => {
            e.stopPropagation?.();
            onShare?.(product);
          }}
          hitSlop={8}
        >
          <Share2 size={16} color={colors.text} />
        </Pressable>

        {outOfStock && (
          <View style={styles.outOfStockBadge}>
            <Text style={styles.outOfStockText}>Agotado</Text>
          </View>
        )}
      </View>

      {/* Info (fondo gris-azulado claro) */}
      <View style={styles.info}>
        <View style={styles.brandChip}>
          <Text style={styles.brandChipText} numberOfLines={1}>
            {product.brand}
          </Text>
        </View>

        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>

        <View style={styles.bottomRow}>
          <Text style={styles.price}>
            ${product.price.toFixed(2).replace(/\.00$/, "")}
          </Text>

          {!outOfStock && (
            <View style={styles.stockPill}>
              <View style={styles.stockDot} />
              <Text style={styles.stockText}>Disp</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: "hidden",
    // 👇 Sombra más marcada y con tinte azulado
    shadowColor: "#0367A6",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    boxShadow: "0 6px 14px rgba(3,103,166,0.15)",
    elevation: 5,
  },

  // --- Imagen (blanca) ---
  imageWrap: {
    position: "relative",
    backgroundColor: colors.white,
    height: 150,
    padding: spacing.md,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  shareBtn: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    // sombra suave del botón
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    elevation: 1,
  },
  outOfStockBadge: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.error,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  outOfStockText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: "700",
  },

  // --- Info (fondo gris-azulado claro) ---
  info: {
    backgroundColor: "#E8EFF5", // 👈 gris-azulado claro, como el mockup
    padding: spacing.md,
    paddingTop: spacing.md,
    gap: 8,
    minHeight: 130, // fija altura para que todas las cards queden parejas
  },
  brandChip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(3,103,166,0.12)", // azul translúcido
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  brandChipText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "700",
  },
  name: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 18,
    minHeight: 36,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "auto",
  },
  price: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: colors.primary,
  },
  stockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  stockDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  stockText: {
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: "700",
  },
});