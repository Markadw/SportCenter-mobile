import { useRouter } from "expo-router";
// src/features/home/components/SportsRow.tsx
import { Activity, Bike, CircleDot, Dumbbell, Trophy, Zap } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing, storefront } from "../../../constants/theme";
import { useFilters } from "../../catalog";

// Mapeo nombre del deporte → icono Lucide
const SPORT_ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  Futbol: CircleDot,
  Basquetbol: Trophy,
  Running: Zap,
  Ciclismo: Bike,
  Gym: Dumbbell,
};

export const SportsRow = () => {
  const { sports, setSport, filters, clearFilters, requestCatalog } = useFilters();
  const router = useRouter();

  if (sports.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
    >
      {sports.map((s) => {
        const Icon = SPORT_ICONS[s.name] ?? Activity;
        const active = filters.sportName === s.name;

        return (
          <Pressable
            key={s.id}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityState={{ selected: active }} accessibilityRole="button" accessibilityLabel={`Ver productos de ${s.name}`}
            onPress={() => { clearFilters(); requestCatalog(); setSport(s.name); router.push({ pathname: "/catalog", params: { q: "" } }); }}
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Icon size={22} color={active ? colors.white : colors.primary} />
            </View>
            <Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>
              {s.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  // Cápsula: icono en círculo a la izquierda y nombre a la derecha.
  chip: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 52, paddingLeft: 6, paddingRight: spacing.lg, paddingVertical: 6, backgroundColor: colors.white, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  iconWrap: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandChipBg, alignItems: "center", justifyContent: "center" },
  iconWrapActive: { backgroundColor: "rgba(255,255,255,0.15)" },
  label: { fontSize: fontSize.sm, lineHeight: 20, fontWeight: "600", color: colors.text },
  labelActive: { color: colors.white },
});
