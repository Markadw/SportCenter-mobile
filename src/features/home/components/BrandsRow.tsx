import { useRouter } from "expo-router";
// src/features/home/components/BrandsRow.tsx
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing, storefront } from "../../../constants/theme";
import { useFilters } from "../../catalog";

export const BrandsRow = () => {
  const { brands, setBrand, clearFilters, requestCatalog } = useFilters();
  const router = useRouter();

  if (brands.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
    >
      {brands.map((b) => (
        <Pressable
          key={b.id}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
          accessibilityRole="button" accessibilityLabel={`Ver productos de ${b.name}`}
          onPress={() => { clearFilters(); requestCatalog(); setBrand(b.id); router.push({ pathname: "/catalog", params: { q: "" } }); }}
        >
          <View style={styles.logoWrap}>
            <Image source={{ uri: b.image }} style={styles.logo} resizeMode="contain" />
          </View>
          <Text numberOfLines={1} style={styles.name}>
            {b.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, gap: spacing.md, alignItems: "flex-start" },
  card: { width: 100, alignItems: "center", gap: spacing.xs },
  // Cuadrado de 100 × 100: 5 px de margen interior dejan el logotipo en ~88 % del espacio.
  logoWrap: { width: 100, height: 100, alignItems: "center", justifyContent: "center", padding: 5, borderWidth: 1, borderColor: storefront.border, borderRadius: radius.lg, backgroundColor: colors.white },
  logo: { width: "100%", height: "100%" },
  name: { fontSize: fontSize.sm, lineHeight: 20, color: colors.text, fontWeight: "600", textAlign: "center" },
});
