import { Pressable, StyleSheet, Text, View } from "react-native";
import { ProductImage } from "../../../components/ProductImage";
import { colors } from "../../../constants/theme";
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
      <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
      <Text style={styles.price}>{productPriceRange(product) ?? "Sin precio disponible"}</Text>
    </View>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: "hidden", backgroundColor: colors.white },
  imageWrap: { position: "relative", padding: 12, backgroundColor: colors.white },
  image: { width: "100%", aspectRatio: 1 },
  badge: { position: "absolute", top: 8, left: 8, backgroundColor: colors.lightBg, color: colors.textMuted, borderRadius: 8, padding: 6, fontSize: 12, fontWeight: "600" },
  info: { padding: 12, gap: 6 }, brand: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  name: { fontSize: 14, lineHeight: 20, fontWeight: "600", minHeight: 40, color: colors.text },
  price: { fontSize: 15, lineHeight: 21, fontWeight: "700", color: colors.primary },
});
