import { useRouter } from "expo-router";
import { ArrowUpDown, ChevronLeft, ChevronRight, SlidersHorizontal, X } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { Animated, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppHeader } from "../../../components/AppHeader";
import { ScreenState } from "../../../components/ScreenState";
import { colors, radius, spacing, storefront } from "../../../constants/theme";
import { SORT_LABELS, useCatalogViewModel, type CatalogSort } from "../../catalog/hooks/useCatalogViewModel";
import { FiltersModal } from "../components/FiltersModal";
import { ProductCard } from "../components/ProductCard";
import type { Product } from "../types";

export const CATALOG_PAGE_SIZE = 20;

/** Hasta 5 posiciones: primera, última, actual y vecinas, con «…» donde se omiten páginas. */
export function pageSlots(page: number, count: number): (number | "gap")[] {
  if (count <= 5) return Array.from({ length: count }, (_, i) => i + 1);
  if (page <= 2) return [1, 2, 3, "gap", count];
  if (page >= count - 1) return [1, "gap", count - 2, count - 1, count];
  return [1, "gap", page, "gap", count];
}

export function CatalogScreen() {
  const vm = useCatalogViewModel();
  const router = useRouter();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const listRef = useRef<FlatList<Product>>(null);
  // Paginación local: la API entrega el catálogo completo. Cualquier cambio de búsqueda, filtros u orden vuelve a la página 1.
  const signature = JSON.stringify([vm.catalogRequest?.key ?? 0, vm.query, vm.filters, vm.sort, vm.minPrice, vm.maxPrice]);
  const [paging, setPaging] = useState({ signature, page: 1 });
  if (paging.signature !== signature) setPaging({ signature, page: 1 });
  const pageCount = Math.max(1, Math.ceil(vm.filtered.length / CATALOG_PAGE_SIZE));
  const page = paging.signature === signature ? Math.min(paging.page, pageCount) : 1;
  const pageItems = vm.filtered.slice((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE);
  const goToPage = (next: number) => {
    setPaging({ signature, page: Math.min(Math.max(1, next), pageCount) });
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };
  // Encabezado que se oculta al bajar y reaparece al subir, sin alterar el layout de la lista.
  const [headerHeight, setHeaderHeight] = useState(0);
  const [scrollY] = useState(() => new Animated.Value(0));
  const translateY = useMemo(() => {
    const range = Math.max(headerHeight, 1);
    const offset = scrollY.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: "clamp" });
    return Animated.diffClamp(offset, 0, range).interpolate({ inputRange: [0, range], outputRange: [0, -range] });
  }, [scrollY, headerHeight]);
  if (vm.isLoading && !vm.products.length) return <ScreenState appearance="storefront" loading title="Cargando productos…" />;
  if (vm.error && !vm.products.length) return <ScreenState appearance="storefront" title="No se pudo cargar el catálogo" message={vm.error} action="Reintentar" onAction={() => void vm.refresh()} />;
  const hasReset = !!(vm.activeCount > 0 || vm.query || vm.minPrice || vm.maxPrice);
  return <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
    <View style={styles.body}>
      <Animated.FlatList ref={listRef} testID="catalog-list" data={pageItems} keyExtractor={p => String(p.id)} numColumns={2}
        contentContainerStyle={[styles.list, { paddingTop: headerHeight }]} columnWrapperStyle={styles.columns} keyboardShouldPersistTaps="handled"
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })} scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={vm.isLoading} onRefresh={() => void vm.refresh()} progressViewOffset={headerHeight} tintColor={colors.primary} colors={[colors.primary]} />}
        renderItem={({ item }) => <View style={styles.card}><ProductCard product={item} onPress={p => router.push(`/product/${p.id}`)} /></View>}
        ListHeaderComponent={<View style={styles.result}>
          <Text style={styles.muted}>{vm.filtered.length} {vm.filtered.length === 1 ? "resultado" : "resultados"}{pageCount > 1 ? ` · Página ${page} de ${pageCount}` : ""}</Text>
          {!!vm.error && <Text accessibilityRole="alert" style={styles.muted}>No se pudo actualizar. Se muestran los productos cargados.</Text>}
        </View>}
        ListEmptyComponent={<ScreenState appearance="storefront" title="No hay productos con esos filtros." message="Prueba otra búsqueda o elimina los filtros seleccionados." action="Limpiar" onAction={vm.clear} />}
        ListFooterComponent={pageCount > 1 ? <View style={styles.pagination} accessibilityLabel={`Paginación, página ${page} de ${pageCount}`}>
          <Pressable accessibilityRole="button" accessibilityLabel="Página anterior" accessibilityState={{ disabled: page === 1 }} disabled={page === 1} hitSlop={5}
            style={({ pressed }) => [styles.pageButton, page === 1 && styles.pageDisabled, pressed && styles.pressed]} onPress={() => goToPage(page - 1)}>
            <ChevronLeft size={18} color={colors.secondary} />
          </Pressable>
          {pageSlots(page, pageCount).map((slot, i) => slot === "gap"
            ? <Text key={`gap-${i}`} style={styles.pageGap} importantForAccessibility="no">…</Text>
            : <Pressable key={slot} accessibilityRole="button" accessibilityLabel={`Página ${slot}`} accessibilityState={{ selected: slot === page }} hitSlop={5}
              style={({ pressed }) => [styles.pageButton, slot === page && styles.pageActive, pressed && styles.pressed]} onPress={() => slot !== page && goToPage(slot)}>
              <Text style={[styles.pageLabel, slot === page && styles.pageLabelActive]}>{slot}</Text>
            </Pressable>)}
          <Pressable accessibilityRole="button" accessibilityLabel="Página siguiente" accessibilityState={{ disabled: page === pageCount }} disabled={page === pageCount} hitSlop={5}
            style={({ pressed }) => [styles.pageButton, page === pageCount && styles.pageDisabled, pressed && styles.pressed]} onPress={() => goToPage(page + 1)}>
            <ChevronRight size={18} color={colors.secondary} />
          </Pressable>
        </View> : null} />
      <Animated.View style={[styles.header, { transform: [{ translateY }] }]} onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}>
        <AppHeader leading="back" search={{ value: vm.query, onChange: vm.setQuery, label: "Buscar en el catálogo" }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.toolbar}>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.control, vm.activeCount > 0 && styles.controlActive, pressed && styles.pressed]} onPress={() => setFiltersOpen(true)}>
            <SlidersHorizontal size={16} color={colors.primary} /><Text style={styles.controlLabel}>Filtros{vm.activeCount ? ` (${vm.activeCount})` : ""}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Ordenar productos" style={({ pressed }) => [styles.control, pressed && styles.pressed]} onPress={() => setSortOpen(true)}>
            <ArrowUpDown size={16} color={colors.primary} /><Text style={styles.controlLabel}>{SORT_LABELS[vm.sort]}</Text>
          </Pressable>
          {vm.filters.sportName && <Pressable accessibilityRole="button" accessibilityLabel="Quitar filtro de deporte" style={[styles.control, styles.chip]} onPress={() => vm.setSport(null)}><Text style={styles.controlLabel}>{vm.filters.sportName} ×</Text></Pressable>}
          {hasReset && <Pressable accessibilityRole="button" style={[styles.control, styles.chip]} onPress={vm.clear}><Text style={styles.controlLabel}>Limpiar búsqueda y filtros</Text></Pressable>}
        </ScrollView>
      </Animated.View>
    </View>
    <FiltersModal visible={filtersOpen} onClose={() => setFiltersOpen(false)} />
    <Modal visible={sortOpen} transparent animationType="slide" onRequestClose={() => setSortOpen(false)}>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar orden y precios" style={styles.backdrop} onPress={() => setSortOpen(false)} />
        <SafeAreaView style={styles.sheet} edges={["bottom", "left", "right"]} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHeader}><Text accessibilityRole="header" style={styles.sheetTitle}>Ordenar y precio</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar orden y precios" style={styles.icon} onPress={() => setSortOpen(false)}><X size={22} color={colors.text} /></Pressable>
            </View>
            {(Object.entries(SORT_LABELS) as [CatalogSort, string][]).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: vm.sort === value }}
              style={styles.option} onPress={() => vm.setSort(value)}><Text style={[styles.optionText, vm.sort === value && styles.selected]}>{vm.sort === value ? "✓  " : ""}{label}</Text></Pressable>)}
            <View style={styles.prices}>
              <View style={styles.priceField}><Text style={styles.muted}>Precio mínimo</Text><TextInput accessibilityLabel="Precio mínimo" keyboardType="decimal-pad" style={styles.priceInput} placeholder="$0" value={vm.minPrice} onChangeText={vm.setMinPrice} maxLength={10} /></View>
              <View style={styles.priceField}><Text style={styles.muted}>Precio máximo</Text><TextInput accessibilityLabel="Precio máximo" keyboardType="decimal-pad" style={styles.priceInput} placeholder="Sin límite" value={vm.maxPrice} onChangeText={vm.setMaxPrice} maxLength={10} /></View>
            </View>
            {!!vm.priceError && <Text accessibilityRole="alert" style={styles.error}>{vm.priceError}</Text>}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!vm.priceError }} disabled={!!vm.priceError} style={[styles.apply, !!vm.priceError && { opacity: 0.5 }]} onPress={() => setSortOpen(false)}><Text style={styles.applyLabel}>Ver resultados</Text></Pressable>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: storefront.background },
  body: { flex: 1, overflow: "hidden" },
  header: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 1, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: storefront.border },
  icon: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md },
  toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  control: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, height: 40, paddingVertical: 0, borderWidth: 1, borderColor: storefront.border, borderRadius: radius.pill, backgroundColor: colors.white, paddingHorizontal: spacing.md },
  controlActive: { borderColor: colors.primary, backgroundColor: colors.brandChipBg },
  chip: { backgroundColor: colors.brandChipBg, borderColor: colors.brandChipBg },
  pressed: { opacity: 0.65 },
  controlLabel: { fontSize: 14, lineHeight: 20, color: colors.secondary, fontWeight: "600", includeFontPadding: false, textAlignVertical: "center" },
  list: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  columns: { gap: spacing.md, marginBottom: spacing.md },
  card: { flex: 1, maxWidth: "50%", minWidth: 0 },
  result: { gap: spacing.sm, paddingVertical: spacing.md },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  // Botones de 38 px + hitSlop de 5 px = 48 px táctiles.
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  pageButton: { width: 38, height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  pageActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pageDisabled: { opacity: 0.4 },
  pageLabel: { fontSize: 14, lineHeight: 20, fontWeight: "600", color: colors.secondary },
  pageLabelActive: { color: colors.white },
  pageGap: { width: 20, textAlign: "center", color: colors.textMuted, fontSize: 14 },
  modal: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { maxHeight: "85%", backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  sheetTitle: { flex: 1, color: colors.text, fontSize: 22, lineHeight: 30, fontWeight: "700" },
  option: { minHeight: 52, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: storefront.border, justifyContent: "center" },
  optionText: { fontSize: 16, lineHeight: 24, color: colors.text },
  selected: { color: colors.secondary, fontWeight: "700" },
  prices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, paddingVertical: spacing.lg },
  priceField: { flexGrow: 1, flexShrink: 1, flexBasis: 120, gap: spacing.sm },
  priceInput: { minHeight: 52, borderWidth: 1, borderColor: colors.neutral, borderRadius: radius.md, padding: spacing.md, fontSize: 16, color: colors.text, backgroundColor: storefront.background },
  error: { color: storefront.errorText, lineHeight: 22, marginBottom: spacing.md },
  apply: { minHeight: 52, padding: spacing.md, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  applyLabel: { color: colors.white, fontWeight: "700", fontSize: 16, lineHeight: 24, textAlign: "center" },
});
