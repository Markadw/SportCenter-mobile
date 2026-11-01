import { useRouter } from "expo-router";
import { Search, SlidersHorizontal, X } from "lucide-react-native";
import { useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "../../../components/ScreenState";
import { colors } from "../../../constants/theme";
import { SORT_LABELS, useCatalogViewModel, type CatalogSort } from "../../catalog/hooks/useCatalogViewModel";
import { FiltersModal } from "../components/FiltersModal";
import { ProductCard } from "../components/ProductCard";

export function CatalogScreen() {
  const vm = useCatalogViewModel();
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  if (vm.isLoading && !vm.products.length) return <ScreenState loading title="Cargando productos…" />;
  if (vm.error && !vm.products.length) return <ScreenState title="No se pudo cargar el catálogo" message={vm.error} action="Reintentar" onAction={() => void vm.refresh()} />;
  return <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">Catálogo</Text>
      <View style={styles.search}>
        <Search size={20} color={colors.textMuted} />
        <TextInput style={styles.input} accessibilityLabel="Buscar en el catálogo" placeholder="Producto, marca o deporte" placeholderTextColor={colors.textMuted}
          value={vm.query} onChangeText={vm.setQuery} returnKeyType="search" maxLength={100} />
        {!!vm.query && <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" style={styles.icon} onPress={() => vm.setQuery("")}><X size={18} color={colors.textMuted} /></Pressable>}
      </View>
      <View style={styles.toolbar}>
        <Pressable accessibilityRole="button" style={styles.control} onPress={() => setFiltersOpen(true)}>
          <SlidersHorizontal size={18} color={colors.primary} /><Text style={styles.controlLabel}>Filtros{vm.activeCount ? ` (${vm.activeCount})` : ""}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ordenar productos" style={[styles.control, styles.sort]} onPress={() => setSortOpen(true)}>
          <Text style={styles.controlLabel}>{SORT_LABELS[vm.sort]}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {vm.filters.sportName && <Pressable accessibilityRole="button" accessibilityLabel="Quitar filtro de deporte" style={styles.chip} onPress={() => vm.setSport(null)}><Text style={styles.controlLabel}>{vm.filters.sportName} ×</Text></Pressable>}
        {(vm.activeCount > 0 || vm.query || vm.minPrice || vm.maxPrice) && <Pressable accessibilityRole="button" style={styles.chip} onPress={vm.clear}><Text style={styles.controlLabel}>Limpiar búsqueda y filtros</Text></Pressable>}
      </ScrollView>
    </View>
    <FlatList testID="catalog-list" data={vm.visibleProducts} keyExtractor={p => String(p.id)} numColumns={2}
      contentContainerStyle={styles.list} columnWrapperStyle={styles.columns} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={vm.isLoading} onRefresh={() => void vm.refresh()} tintColor={colors.primary} colors={[colors.primary]} />}
      renderItem={({ item }) => <View style={styles.card}><ProductCard product={item} onPress={p => router.push(`/product/${p.id}`)} /></View>}
      ListHeaderComponent={<View style={styles.result}>
        <Text style={styles.muted}>{vm.filtered.length} resultados</Text>
        {!!vm.error && <Text accessibilityRole="alert" style={styles.muted}>No se pudo actualizar. Se muestran los productos cargados.</Text>}
      </View>}
      ListEmptyComponent={<ScreenState title="No hay productos con esos filtros." message="Prueba otra búsqueda o elimina los filtros seleccionados." action="Limpiar" onAction={vm.clear} />}
      ListFooterComponent={vm.hasMore ? <Pressable accessibilityRole="button" style={styles.more} onPress={vm.loadMore}><Text style={styles.controlLabel}>Ver más productos</Text></Pressable> : null} />
    <FiltersModal visible={filtersOpen} onClose={() => setFiltersOpen(false)} />
    <Modal visible={sortOpen} transparent animationType="slide" onRequestClose={() => setSortOpen(false)}>
      <View style={styles.modal}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar orden y precios" style={styles.backdrop} onPress={() => setSortOpen(false)} />
        <SafeAreaView style={styles.sheet} edges={["bottom"]} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetTitle}>Ordenar y precio</Text>
            {(Object.entries(SORT_LABELS) as [CatalogSort, string][]).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: vm.sort === value }}
              style={styles.option} onPress={() => vm.setSort(value)}><Text style={[styles.optionText, vm.sort === value && styles.selected]}>{vm.sort === value ? "✓  " : ""}{label}</Text></Pressable>)}
            <View style={styles.prices}>
              <View style={styles.priceField}><Text style={styles.muted}>Precio mínimo</Text><TextInput accessibilityLabel="Precio mínimo" keyboardType="decimal-pad" style={styles.priceInput} placeholder="$0" value={vm.minPrice} onChangeText={vm.setMinPrice} maxLength={10} /></View>
              <View style={styles.priceField}><Text style={styles.muted}>Precio máximo</Text><TextInput accessibilityLabel="Precio máximo" keyboardType="decimal-pad" style={styles.priceInput} placeholder="Sin límite" value={vm.maxPrice} onChangeText={vm.setMaxPrice} maxLength={10} /></View>
            </View>
            {!!vm.priceError && <Text accessibilityRole="alert" style={styles.error}>{vm.priceError}</Text>}
            <Pressable accessibilityRole="button" disabled={!!vm.priceError} style={[styles.apply, !!vm.priceError && { opacity: 0.5 }]} onPress={() => setSortOpen(false)}><Text style={styles.applyLabel}>Ver resultados</Text></Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white }, header: { paddingHorizontal: 16, gap: 12, paddingTop: 16 },
  title: { fontSize: 28, fontWeight: "700", color: colors.text }, search: { flexDirection: "row", alignItems: "center", paddingLeft: 14, paddingRight: 4, gap: 10, backgroundColor: colors.lightBg, borderRadius: 12 },
  input: { flex: 1, minHeight: 48, fontSize: 15, color: colors.text }, icon: { minWidth: 44, minHeight: 48, alignItems: "center", justifyContent: "center" },
  toolbar: { flexDirection: "row", gap: 12 }, control: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10 },
  sort: { flex: 1 }, controlLabel: { fontSize: 14, color: colors.primary, fontWeight: "600" }, chips: { gap: 8 },
  chip: { minHeight: 44, borderRadius: 22, backgroundColor: colors.brandChipBg, justifyContent: "center", paddingHorizontal: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 24 }, columns: { gap: 12, marginBottom: 12 }, card: { flex: 1, maxWidth: "50%" },
  result: { gap: 8, paddingVertical: 16 }, muted: { color: colors.textMuted, fontSize: 14 }, more: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: "center", justifyContent: "center", marginVertical: 12 },
  modal: { flex: 1, justifyContent: "flex-end" }, backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { maxHeight: "85%", backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  sheetTitle: { color: colors.text, fontSize: 22, fontWeight: "700", marginBottom: 12 }, option: { minHeight: 48, justifyContent: "center" }, optionText: { fontSize: 16, color: colors.text }, selected: { color: colors.primary, fontWeight: "700" },
  prices: { flexDirection: "row", gap: 12, paddingVertical: 16 }, priceField: { flex: 1, gap: 8 }, priceInput: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, color: colors.text },
  error: { color: colors.error, marginBottom: 12 }, apply: { minHeight: 48, backgroundColor: colors.primary, borderRadius: 12, alignItems: "center", justifyContent: "center" }, applyLabel: { color: colors.white, fontWeight: "700", fontSize: 16 },
});
