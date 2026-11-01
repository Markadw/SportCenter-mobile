import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../constants/theme";

export function ScreenState({ title, message, loading = false, action, onAction }: {
  title: string; message?: string; loading?: boolean; action?: string; onAction?: () => void;
}) {
  return <View style={styles.root}>
    {loading && <ActivityIndicator size="large" color={colors.primary} />}
    <Text accessibilityRole={loading ? "header" : "alert"} style={styles.title}>{title}</Text>
    {!!message && <Text style={styles.message}>{message}</Text>}
    {action && onAction && <Pressable accessibilityRole="button" style={styles.button} onPress={onAction}>
      <Text style={styles.label}>{action}</Text>
    </Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl, backgroundColor: colors.white },
  title: { color: colors.text, fontSize: 20, fontWeight: "700", textAlign: "center" },
  message: { color: colors.textMuted, fontSize: 15, lineHeight: 23, textAlign: "center" },
  button: { minHeight: 48, paddingHorizontal: spacing.xl, justifyContent: "center", backgroundColor: colors.primary, borderRadius: radius.md },
  label: { color: colors.white, fontWeight: "700", fontSize: 15 },
});
