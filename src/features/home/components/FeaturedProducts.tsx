// src/features/home/components/FeaturedProducts.tsx
import { useRouter } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "../../../constants/theme";
import { ProductCard } from "../../products/components/ProductCard";
import type { Product } from "../../products/types";

interface Props {
  products: Product[];
}

export const FeaturedProducts = ({ products }: Props) => {
  const router = useRouter();

  if (products.length === 0) {
    return <Text style={styles.empty}>Aún no hay productos destacados.</Text>;
  }

  return (
    <FlatList
      data={products}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => (
        <View style={styles.cardWrap}>
          <ProductCard
            product={item}
            onPress={(p) => router.push(`/product/${p.id}`)}
          />
        </View>
      )}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
    />
  );
};

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  cardWrap: {
    width: 200,
  },
  empty: {
    paddingHorizontal: spacing.lg,
    color: colors.textMuted,
    fontStyle: "italic",
    fontSize: fontSize.sm,
  },
});