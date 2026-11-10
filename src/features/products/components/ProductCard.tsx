import { Pressable, StyleSheet, Text, View } from "react-native";
import { ProductImage } from "../../../components/ProductImage";
import { colors, radius, spacing, storefront } from "../../../constants/theme";
import { productPriceRange } from "../presentation";
import type { Product } from "../types";

export function ProductCard({ product, onPress }: { product: Product; onPress?: (product: Product) => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={product.name}
    accessibilityHint={`${productPriceRange(product) ?? "Sin precio disponible"}. Abrir detalle del producto.`}
    onPress={() => onPress?.(product)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}>
    <View style={styles.imageWrap}>
      <ProductImage uri={product.mainImage} label={product.name} style={styles.image} />
      {product.totalStock <= 0 && <Text style={styles.badge}>Agotado</Text>}
    </View>
    <View style={styles.info}>
      <Text style={styles.brand} numberOfLines={1}>{product.brand}</Text>
      <Text style={styles.name} numberOfLines={3}>{product.name}</Text>
      <Text style={styles.price}>{productPriceRange(product) ?? "Sin precio disponible"}</Text>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderColor: storefront.border, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.white },
  imageWrap: { position: "relative", padding: spacing.md, backgroundColor: storefront.imageBackground },
  image: { width: "100%", aspectRatio: 1, backgroundColor: storefront.imageBackground },
  badge: { position: "absolute", top: spacing.sm, left: spacing.sm, backgroundColor: colors.white, color: colors.textMuted, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  info: { flex: 1, padding: spacing.md, gap: spacing.xs },
  brand: { fontSize: 11, lineHeight: 17, letterSpacing: 0.5, fontWeight: "600", color: colors.textMuted, textTransform: "uppercase" },
  name: { fontSize: 15, lineHeight: 22, fontWeight: "600", minHeight: 44, color: colors.text },
  price: { marginTop: "auto", paddingTop: spacing.sm, fontSize: 16, lineHeight: 23, fontWeight: "700", color: colors.secondary },
});
