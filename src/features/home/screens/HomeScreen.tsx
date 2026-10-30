import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../../components/AppHeader";
import { ScreenState } from "../../../components/ScreenState";
import { colors } from "../../../constants/theme";
import { useHomeViewModel } from "../hooks/useHomeViewModel";
import { BrandsRow } from "../components/BrandsRow";
import { FeaturedProducts } from "../components/FeaturedProducts";
import { SectionHeader } from "../components/SectionHeader";
import { SportsRow } from "../components/SportsRow";

export function HomeScreen() {
  const vm = useHomeViewModel();
  const router = useRouter();
  const browse = () => { vm.browseAll(); router.push({ pathname: "/catalog", params: { q: "" } }); };
  if (vm.isLoading && !vm.products.length) return <ScreenState loading title="Cargando Sport Center…" />;
  if (vm.error && !vm.products.length) return <ScreenState title="No se pudo cargar la tienda" message={vm.error} action="Reintentar" onAction={() => void vm.refresh()} />;
  return <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
    <AppHeader onSearch={vm.search} />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={vm.isLoading} onRefresh={() => void vm.refresh()} colors={[colors.primary]} tintColor={colors.primary} />}>
      <SectionHeader title="Explora por deporte" /><SportsRow />
      <SectionHeader title="Más recientes" actionLabel="Ver todos" onPressAction={browse} />
      <FeaturedProducts products={vm.recent} />
      <SectionHeader title="Marcas" /><BrandsRow />
      <View style={{ height: 16 }} />
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.white }, content: { paddingBottom: 24 } });
