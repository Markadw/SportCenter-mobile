// src/features/home/components/SportsRow.tsx
import { Activity, Bike, CircleDot, Dumbbell, Trophy, Zap } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, radius, spacing } from "../../../constants/theme";
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
  const { sports, setSport, filters } = useFilters();

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
            onPress={() => setSport(active ? null : s.name)}
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Icon size={18} color={active ? colors.white : colors.primary} />
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>
              {s.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E8F1F8",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: { backgroundColor: "rgba(255,255,255,0.2)" },
  label: {
    fontSize: fontSize.sm,
    fontWeight: "700",
    color: colors.text,
  },
  labelActive: { color: colors.white },
});