import { Redirect, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing } from "../../../constants/theme";
import { useSession } from "../context/SessionContext";

export function AccountScreen() {
  const { session, signOut } = useSession();
  const router = useRouter();
  if (!session) return <Redirect href="/login" />;
  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Mi cuenta</Text>
        <Text style={styles.description}>Has iniciado sesión en Sport Center.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace("/catalog")} style={styles.button}>
          <Text style={styles.buttonLabel}>Explorar productos</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.secondary}
          onPress={() => { void signOut(); router.replace("/login"); }}>
          <Text style={styles.link}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, padding: spacing.xl },
  content: { width: "100%", maxWidth: 480, alignSelf: "center", gap: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text },
  description: { fontSize: fontSize.md, color: colors.textMuted },
  button: { minHeight: 48, padding: spacing.md, borderRadius: radius.sm,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  buttonLabel: { color: colors.white, fontSize: fontSize.md, fontWeight: "600" },
  secondary: { minHeight: 48, padding: spacing.md, alignItems: "center", justifyContent: "center" },
  link: { color: colors.secondary, fontSize: fontSize.md, fontWeight: "600" },
});
