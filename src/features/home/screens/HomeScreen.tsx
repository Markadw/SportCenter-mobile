// src/features/home/screens/HomeScreen.tsx
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, spacing } from "../../../constants/theme";
import { useFilters } from "../../catalog";
import { useProducts } from "../../products";
import { BannerCarousel } from "../components/BannerCarousel";
import { BrandsRow } from "../components/BrandsRow";
import { FeaturedProducts } from "../components/FeaturedProducts";
import { SectionHeader } from "../components/SectionHeader";
import { SportsRow } from "../components/SportsRow";

export const HomeScreen = () => {
  const router = useRouter();
  const { products, isLoading, error } = useProducts();
  const { filters } = useFilters();

  const featured = products.filter((p) => p.totalStock > 0).slice(0, 8);

  if (isLoading && products.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando SportCenter…</Text>
      </View>
    );
  }

  if (error && products.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>No se pudo cargar la tienda</Text>
        <Text style={styles.loadingText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <BannerCarousel />

      <SectionHeader
        title="Marcas"
        actionLabel="Ver todas"
        onPressAction={() => router.push("/catalog")}
      />
      <BrandsRow />

      <SectionHeader
        title="Deportes"
        actionLabel="Ver todos"
        onPressAction={() =>
          router.push({
            pathname: "/catalog",
            params: filters.sportName ? { sport: filters.sportName } : {},
          })
        }
      />
      <SportsRow />

      <SectionHeader
        title="Destacados"
        actionLabel="Ver todos"
        onPressAction={() => router.push("/catalog")}
      />
      <FeaturedProducts products={featured} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { paddingBottom: spacing.xxl },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: colors.white,
  },
  loadingText: { marginTop: 8, color: colors.textMuted },
  errorTitle: { fontSize: 16, fontWeight: "700", color: colors.error },
});