import { useRouter } from "expo-router";
// src/features/home/components/BrandsRow.tsx
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, shadow, spacing } from "../../../constants/theme";
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
          <Text style={styles.name} numberOfLines={1}>
            {b.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  card: {
    width: 88,
    alignItems: "center",
    gap: 6,
  },
  logoWrap: {
    width: 76,
    height: 76,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    ...shadow.card,
  },
  logo: { width: "100%", height: "100%" },
  name: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontWeight: "600",
    textAlign: "center",
  },
});