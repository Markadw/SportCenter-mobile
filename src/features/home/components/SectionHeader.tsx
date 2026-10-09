// src/features/home/components/SectionHeader.tsx
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, spacing } from "../../../constants/theme";

interface Props {
  title: string;
  actionLabel?: string;
  onPressAction?: () => void;
}

export const SectionHeader = ({ title, actionLabel, onPressAction }: Props) => {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {actionLabel && (
        <Pressable
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
          onPress={onPressAction}
          hitSlop={6}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <ChevronRight size={14} color={colors.accent} />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
  },
  action: { flexDirection: "row", alignItems: "center", gap: 2 },
  actionText: {
    fontSize: fontSize.xs,
    color: colors.accent,
    fontWeight: "700",
  },
});