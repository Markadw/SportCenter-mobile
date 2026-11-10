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
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {actionLabel && (
        <Pressable
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          onPress={onPressAction}
          hitSlop={6}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <ChevronRight size={14} color={colors.secondary} />
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.md },
  title: { flexShrink: 1, fontSize: fontSize.xl, lineHeight: 29, fontWeight: "700", color: colors.text, letterSpacing: -0.4 },
  action: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm },
  actionText: { fontSize: fontSize.sm, lineHeight: 20, color: colors.secondary, fontWeight: "700" },
});
