// src/features/products/screens/CatalogScreen.tsx
import { useRouter } from "expo-router";
import { ChevronRight, Home, SlidersHorizontal } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, fontSize, radius, spacing } from "../../../constants/theme";
import { useFilters } from "../../catalog";
import { FiltersModal } from "../components/FiltersModal";
import { ProductCard } from "../components/ProductCard";
import { useProducts } from "../context/ProductsContext";

const PAGE_SIZE = 20;
const NUM_COLUMNS = 2;
const MAX_VISIBLE_PAGES = 5;

export const CatalogScreen = () => {
  const router = useRouter();
  const { products, isLoading, error, refresh } = useProducts();
  const { filters, categories, brands, activeCount } = useFilters();

  const [visibleFilters, setVisibleFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // --- Filtrado ---
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Filtro categoría
      if (filters.categoryId !== null) {
        const cat = categories.find((c) => c.id === filters.categoryId);
        if (cat) {
          const isParent = p.parentCategory === cat.name;
          const isExact = p.category === cat.name;
          if (!isParent && !isExact) return false;
        }
      }

      // Filtro marca
      if (filters.brandId !== null) {
        const brand = brands.find((b) => b.id === filters.brandId);
        if (brand && p.brand !== brand.name) return false;
      }

      return true;
    });
  }, [products, filters, categories, brands]);

  // --- Paginación sobre filtrados ---
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;

  const pageProducts = useMemo(
    () => filteredProducts.slice(start, end),
    [filteredProducts, start, end]
  );

  // Si al filtrar, la página actual ya no existe, regresa a la 1
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1);
  }

  const goToPage = useCallback(
    (page: number) => {
      const safe = Math.min(Math.max(1, page), totalPages);
      setCurrentPage(safe);
    },
    [totalPages]
  );

  const handleRefresh = useCallback(async () => {
    setCurrentPage(1);
    await refresh();
  }, [refresh]);

  // --- Estados ---
  if (isLoading && products.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.mutedText}>Cargando productos…</Text>
      </View>
    );
  }

  if (error && products.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>No se pudo cargar el catálogo</Text>
        <Text style={styles.mutedText}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={refresh}>
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  // --- Lista ---
  return (
    <>
      <FlatList
        data={pageProducts}
        keyExtractor={(item) => item.id.toString()}
        numColumns={NUM_COLUMNS}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <ProductCard
              product={item}
              onPress={(p) => router.push(`/product/${p.id}`)}
              onShare={(p) => console.log("Compartir:", p.name)}
            />
          </View>
        )}
        columnWrapperStyle={styles.columnWrap}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Catálogo de Productos</Text>
            <Text style={styles.heroSubtitle}>
              Encuentra todo lo que necesitas para tu deporte favorito
            </Text>

            <View style={styles.heroActions}>
              <View style={styles.resultsPill}>
                <Text style={styles.resultsText}>
                  {filteredProducts.length} resultados
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.filtersBtn,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => setVisibleFilters(true)}
              >
                <SlidersHorizontal size={16} color={colors.white} />
                <Text style={styles.filtersText}>Filtros</Text>
                {activeCount > 0 && (
                  <View style={styles.filtersBadge}>
                    <Text style={styles.filtersBadgeText}>{activeCount}</Text>
                  </View>
                )}
              </Pressable>
            </View>

            {/* Migas de pan */}
            <View style={styles.breadcrumb}>
              <Pressable
                onPress={() => router.push("/")}
                style={({ pressed }) => [
                  styles.breadcrumbItem,
                  pressed && { opacity: 0.7 },
                ]}
                hitSlop={6}
              >
                <Home size={14} color={colors.white} />
                <Text style={styles.breadcrumbText}>Inicio</Text>
              </Pressable>

              <ChevronRight size={14} color="rgba(255,255,255,0.7)" />

              <View style={styles.breadcrumbItem}>
                <Text
                  style={[styles.breadcrumbText, { color: colors.white }]}
                >
                  Catálogo
                </Text>
              </View>
            </View>
          </View>
        }
        ListFooterComponent={
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onChange={goToPage}
          />
        }
        ListEmptyComponent={
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <Text style={styles.mutedText}>No hay productos con esos filtros.</Text>
          </View>
        }
      />

      <FiltersModal
        visible={visibleFilters}
        onClose={() => setVisibleFilters(false)}
      />
    </>
  );
};

/* ============ Paginador ============ */

const Pagination = ({
  currentPage,
  totalPages,
  onChange,
}: {
  currentPage: number;
  totalPages: number;
  onChange: (p: number) => void;
}) => {
  if (totalPages <= 1) return null;
  const pages = getVisiblePages(currentPage, totalPages, MAX_VISIBLE_PAGES);

  return (
    <View style={styles.paginationWrap}>
      <Pressable
        style={({ pressed }) => [
          styles.pageBtn,
          currentPage === 1 && styles.pageBtnDisabled,
          pressed && currentPage !== 1 && { opacity: 0.7 },
        ]}
        onPress={() => onChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        <ChevronRight
          size={18}
          color={currentPage === 1 ? colors.neutral : colors.primary}
          style={{ transform: [{ rotate: "180deg" }] }}
        />
      </Pressable>

      {pages.map((p, i) =>
        p === "..." ? (
          <Text key={`d-${i}`} style={styles.dots}>
            …
          </Text>
        ) : (
          <Pressable
            key={p}
            style={({ pressed }) => [
              styles.pageBtn,
              p === currentPage && styles.pageBtnActive,
              pressed && p !== currentPage && { opacity: 0.7 },
            ]}
            onPress={() => onChange(p)}
          >
            <Text
              style={[
                styles.pageBtnText,
                p === currentPage && styles.pageBtnTextActive,
              ]}
            >
              {p}
            </Text>
          </Pressable>
        )
      )}

      <Pressable
        style={({ pressed }) => [
          styles.pageBtn,
          currentPage === totalPages && styles.pageBtnDisabled,
          pressed && currentPage !== totalPages && { opacity: 0.7 },
        ]}
        onPress={() => onChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        <ChevronRight
          size={18}
          color={currentPage === totalPages ? colors.neutral : colors.primary}
        />
      </Pressable>
    </View>
  );
};

const getVisiblePages = (
  current: number,
  total: number,
  maxVisible: number
): (number | "...")[] => {
  if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i + 1);
  const side = Math.floor((maxVisible - 1) / 2);
  let start = Math.max(1, current - side);
  const end = Math.min(total, start + maxVisible - 1);
  if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);

  const pages: (number | "...")[] = [];
  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push("...");
  }
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total) {
    if (end < total - 1) pages.push("...");
    pages.push(total);
  }
  return pages;
};

/* ============ Estilos ============ */

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.white,
  },
  columnWrap: { gap: spacing.lg, marginBottom: spacing.lg },
  cardWrap: { flex: 1 },

  hero: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroTitle: { color: colors.white, fontSize: fontSize.xl, fontWeight: "800" },
  heroSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: fontSize.sm,
    marginTop: 4,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  resultsPill: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  resultsText: { color: colors.white, fontSize: fontSize.sm, fontWeight: "600" },
  filtersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  filtersText: { color: colors.white, fontSize: fontSize.sm, fontWeight: "600" },
  filtersBadge: {
    marginLeft: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  filtersBadgeText: { color: colors.white, fontSize: 11, fontWeight: "800" },

  // Breadcrumb
  breadcrumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing.md,
  },
  breadcrumbItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  breadcrumbText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: fontSize.xs,
    fontWeight: "600",
  },

  // Estados
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
    backgroundColor: colors.white,
  },
  mutedText: { marginTop: spacing.sm, color: colors.textMuted, fontSize: fontSize.sm },
  errorTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.error },
  retryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
  },
  retryText: { color: colors.white, fontWeight: "600", fontSize: fontSize.sm },

  // Paginador
  paginationWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingTop: spacing.lg,
  },
  pageBtn: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  pageBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pageBtnDisabled: {
    backgroundColor: colors.lightBg,
    borderColor: colors.border,
    opacity: 0.6,
  },
  pageBtnText: { fontSize: fontSize.sm, fontWeight: "700", color: colors.primary },
  pageBtnTextActive: { color: colors.white },
  dots: { color: colors.neutral, fontSize: fontSize.md, paddingHorizontal: 4 },
});