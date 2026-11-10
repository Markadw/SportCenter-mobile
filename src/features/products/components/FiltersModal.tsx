import {
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  colors,
  fontSize,
  radius,
  storefront,
  spacing,
} from "../../../constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFilters } from "../../catalog";

const ANIM_MS = 260;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const FiltersModal = ({ visible, onClose }: Props) => {
  const {
    categories,
    sports,
    setSport,
    brands,
    filters,
    setCategory,
    setBrand,
    clearFilters,
    activeCount,
    loading = false,
    loadError,
    retryLoad,
  } = useFilters();

  const { height: SCREEN_H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [openSection, setOpenSection] = useState<"category" | "brand" | "sport" | null>(
    "category",
  );

  const [anim] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(visible);

  // Abrir en este render; al cerrar, conservar el modal hasta terminar la animación.
  if (visible && !mounted) setMounted(true);

  // 2. Ejecutar la animación
  useEffect(() => {
    const animation = Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: ANIM_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== "web", // Evita el warning en web
    });

    animation.start(({ finished }) => {
      if (finished && !visible) {
        setMounted(false); // Se desmonta cuando termina de cerrarse
      }
    });

    return () => animation.stop();
  }, [visible, anim]);

  if (!mounted) return null;

  const allCategories = categories;

  const toggle = (s: "category" | "brand" | "sport") =>
    setOpenSection((prev) => (prev === s ? null : s));

  // Interpolaciones
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H, 0],
  });
  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* Backdrop animado */}
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="box-none"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Sheet animado */}
        <Animated.View accessibilityViewIsModal style={[styles.sheet, { paddingLeft: insets.left, paddingRight: insets.right, transform: [{ translateY }] }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <SlidersHorizontal size={18} color={colors.text} />
              <Text style={styles.headerTitle}>Filtros</Text>
              {activeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Activos</Text>
                </View>
              )}
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Cerrar filtros"
              onPress={onClose}
              hitSlop={8}
            >
              <X size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: spacing.xl }}
            showsVerticalScrollIndicator={false}
          >
            {loading && !loadError && <Text accessibilityLiveRegion="polite" style={styles.loadMessage}>Cargando opciones de filtros…</Text>}
            {loadError && <View style={styles.loadFailure}>
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.loadError}>{loadError}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Reintentar opciones de filtros"
                accessibilityState={{ disabled: loading, busy: loading }} disabled={loading}
                onPress={() => { void retryLoad?.(); }}
                style={({ pressed }) => [styles.retryButton, (pressed || loading) && { opacity: 0.6 }]}>
                <Text style={styles.retryLabel}>{loading ? "Reintentando…" : "Reintentar opciones de filtros"}</Text>
              </Pressable>
            </View>}
            {/* Categorías */}
            <Section
              title="Categoría"
              open={openSection === "category"}
              onToggle={() => toggle("category")}
            >
              <RadioRow
                label="Todas"
                selected={filters.categoryId === null}
                onPress={() => setCategory(null)}
              />
              {allCategories.map((c) => (
                <RadioRow
                  key={c.id}
                  label={c.name}
                  selected={filters.categoryId === c.id}
                  onPress={() => setCategory(c.id)}
                />
              ))}
            </Section>

            {/* Marcas */}
            <Section
              title="Marca"
              open={openSection === "brand"}
              onToggle={() => toggle("brand")}
            >
              <RadioRow
                label="Todas"
                selected={filters.brandId === null}
                onPress={() => setBrand(null)}
              />
              {brands.map((b) => (
                <RadioRow
                  key={b.id}
                  label={b.name}
                  imageUri={b.image}
                  selected={filters.brandId === b.id}
                  onPress={() => setBrand(b.id)}
                />
              ))}
            </Section>
            <Section title="Deporte" open={openSection === "sport"} onToggle={() => toggle("sport")}>
              <RadioRow label="Todos" selected={filters.sportName === null} onPress={() => setSport(null)} />
              {sports.map(s => <RadioRow key={s.id} label={s.name} selected={filters.sportName === s.name} onPress={() => setSport(s.name)} />)}
            </Section>
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom) }]}>
            <Pressable
              style={({ pressed }) => [
                styles.clearBtn,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              onPress={clearFilters}
            >
              <Text style={styles.clearBtnText}>Limpiar</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.applyBtn,
                pressed && { opacity: 0.9 },
              ]}
              accessibilityRole="button"
              onPress={onClose}
            >
              <Text style={styles.applyBtnText}>Aplicar</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

/* --- Subcomponentes --- */

const Section = ({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <View style={styles.section}>
    <Pressable
      style={({ pressed }) => [
        styles.sectionHeader,
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onToggle}
    >
      <Text style={styles.sectionTitle}>{title}</Text>
      {open ? (
        <ChevronUp size={18} color={colors.textMuted} />
      ) : (
        <ChevronDown size={18} color={colors.textMuted} />
      )}
    </Pressable>
    {open && <View style={styles.sectionBody}>{children}</View>}
  </View>
);

const RadioRow = ({
  label,
  selected,
  onPress,
  imageUri,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  imageUri?: string;
}) => (
  <Pressable
    style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    accessibilityRole="radio"
    accessibilityState={{ checked: selected }}
    onPress={onPress}
  >
    <View style={[styles.radio, selected && styles.radioSelected]}>
      {selected && <View style={styles.radioDot} />}
    </View>

    {imageUri && (
      <Image
        source={{ uri: imageUri }}
        style={styles.brandLogo}
        resizeMode="contain"
      />
    )}

    <Text style={[styles.rowLabel, selected && { fontWeight: "700" }]}>
      {label}
    </Text>
  </Pressable>
);

/* --- Estilos --- */

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "#000" },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "88%", paddingBottom: spacing.sm, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: storefront.border, gap: spacing.sm },
  headerLeft: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  headerTitle: { fontSize: fontSize.xl, lineHeight: 30, fontWeight: "700", color: colors.text },
  badge: { backgroundColor: colors.brandChipBg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill },
  badgeText: { fontSize: fontSize.xs, lineHeight: 17, color: colors.secondary, fontWeight: "700" },
  closeBtn: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: storefront.background },
  loadMessage: { margin: spacing.lg, color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 21 },
  loadFailure: { marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  loadError: { color: storefront.errorText, fontSize: fontSize.sm, lineHeight: 21 },
  retryButton: { minHeight: 48, padding: spacing.md, backgroundColor: colors.brandChipBg, borderRadius: radius.md, justifyContent: "center", alignItems: "center" },
  retryLabel: { color: colors.secondary, fontWeight: "700", fontSize: fontSize.sm, lineHeight: 21, textAlign: "center" },
  section: { marginHorizontal: spacing.lg, marginTop: spacing.md, borderWidth: 1, borderColor: storefront.border, borderRadius: radius.lg, overflow: "hidden" },
  sectionHeader: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: storefront.background },
  sectionTitle: { flex: 1, fontSize: fontSize.md, lineHeight: 23, fontWeight: "700", color: colors.text },
  sectionBody: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.white },
  row: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.neutral, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  brandLogo: { width: 24, height: 24, borderRadius: radius.sm },
  rowLabel: { fontSize: fontSize.md, lineHeight: 23, color: colors.text, flex: 1 },
  footer: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: storefront.border },
  clearBtn: { flex: 1, minHeight: 52, padding: spacing.md, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: storefront.border },
  clearBtnText: { color: colors.secondary, fontWeight: "700", fontSize: fontSize.sm, lineHeight: 21, textAlign: "center" },
  applyBtn: { flex: 2, minHeight: 52, padding: spacing.md, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.primary },
  applyBtnText: { color: colors.white, fontWeight: "700", fontSize: fontSize.md, lineHeight: 23, textAlign: "center" },
});
