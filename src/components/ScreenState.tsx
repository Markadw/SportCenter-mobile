import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, storefront } from "../constants/theme";

export function ScreenState({ title, message, loading = false, action, onAction, appearance = "default" }: {
  title: string; message?: string; loading?: boolean; action?: string; onAction?: () => void; appearance?: "default" | "storefront";
}) {
  return <View style={[styles.root, appearance === "storefront" && styles.storefront]}>
    {loading && <ActivityIndicator size="large" color={colors.primary} />}
    <Text accessibilityRole={loading ? "header" : "alert"} style={styles.title}>{title}</Text>
    {!!message && <Text style={styles.message}>{message}</Text>}
    {action && onAction && <Pressable accessibilityRole="button" style={({ pressed }) => [styles.button, appearance === "storefront" && styles.storefrontButton, appearance === "storefront" && pressed && { opacity: 0.7 }]} onPress={onAction}>
      <Text style={[styles.label, appearance === "storefront" && styles.storefrontLabel]}>{action}</Text>
    </Pressable>}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl, backgroundColor: colors.white },
  title: { color: colors.text, fontSize: 20, fontWeight: "700", textAlign: "center" },
  message: { color: colors.textMuted, fontSize: 15, lineHeight: 23, textAlign: "center" },
  button: { minHeight: 48, paddingHorizontal: spacing.xl, justifyContent: "center", backgroundColor: colors.primary, borderRadius: radius.md },
  storefront: { backgroundColor: storefront.background, minHeight: 240, gap: spacing.lg },
  storefrontButton: { paddingVertical: spacing.md, alignItems: "center" },
  storefrontLabel: { textAlign: "center", lineHeight: 22 },
  label: { color: colors.white, fontWeight: "700", fontSize: 15 },
});
