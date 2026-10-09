// src/features/products/components/FiltersModal.tsx
import { ChevronDown, ChevronUp, SlidersHorizontal, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
    Animated,
    Dimensions,
    Easing,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { colors, fontSize, radius, shadow, spacing } from "../../../constants/theme";
import { useFilters } from "../../catalog";

const { height: SCREEN_H } = Dimensions.get("window");
const ANIM_MS = 260;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const FiltersModal = ({ visible, onClose }: Props) => {
  const {
    categories,
    brands,
    filters,
    setCategory,
    setBrand,
    clearFilters,
    activeCount,
  } = useFilters();

  const [openSection, setOpenSection] = useState<"category" | "brand" | null>(
    "category"
  );

  // Estado interno para controlar montaje/desmontaje
  const [mounted, setMounted] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current; // 0 = cerrado, 1 = abierto

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: ANIM_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: ANIM_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, anim]);

  if (!mounted) return null;

  const allCategories = categories;

  const toggle = (s: "category" | "brand") =>
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
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* Backdrop animado (cubre TODA la pantalla) */}
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents="box-none"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Sheet animado */}
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
        >
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
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
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
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable
              style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.7 }]}
              onPress={clearFilters}
            >
              <Text style={styles.clearBtnText}>Limpiar</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.applyBtn, pressed && { opacity: 0.9 }]}
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
      style={({ pressed }) => [styles.sectionHeader, pressed && { opacity: 0.7 }]}
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
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "88%",
    paddingBottom: spacing.sm,
    ...shadow.card,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerTitle: { fontSize: fontSize.lg, fontWeight: "800", color: colors.text },
  badge: {
    backgroundColor: "#DCE9F5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: fontSize.xs, color: colors.primary, fontWeight: "700" },
  closeBtn: { padding: 4 },

  // Secciones
  section: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
  },
  sectionTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  sectionBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.white,
  },

  // Rows
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.neutral,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  brandLogo: { width: 22, height: 22, borderRadius: 4 },
  rowLabel: { fontSize: fontSize.sm, color: colors.text, flex: 1 },

  // Footer
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  clearBtn: {
    flex: 1,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearBtnText: { color: colors.text, fontWeight: "700", fontSize: fontSize.sm },
  applyBtn: {
    flex: 2,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  applyBtnText: { color: colors.white, fontWeight: "700", fontSize: fontSize.md },
});