import { Redirect, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "../../../components/ScreenState";
import { colors, fontSize, radius, spacing } from "../../../constants/theme";
import { useSession } from "../context/SessionContext";

export function AccountScreen() {
  const { session, signOut, notice, isRestoring } = useSession();
  const router = useRouter();
  if (isRestoring) return <ScreenState title="Restaurando sesión" loading />;
  if (!session) return <Redirect href="/login" />;
  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>Mi cuenta</Text>
          <Text style={styles.description}>Has iniciado sesión en Sport Center.</Text>
          {notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
          <Pressable accessibilityRole="button" onPress={() => router.push("/profile")} style={styles.menuItem}>
            <Text style={styles.link}>Mi perfil</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/orders")} style={styles.menuItem}>
            <Text style={styles.link}>Mis pedidos</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push("/privacy")} style={styles.menuItem}>
            <Text style={styles.link}>Privacidad y términos</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/privacy", params: { section: "deletion" } })}
            style={styles.menuItem}>
            <Text style={styles.link}>Solicitar eliminación de cuenta</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.replace("/catalog")} style={styles.button}>
            <Text style={styles.buttonLabel}>Explorar productos</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.secondary}
            onPress={() => { void signOut(); router.replace("/login"); }}>
            <Text style={styles.link}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  scroll: { padding: spacing.xl },
  content: { width: "100%", maxWidth: 480, alignSelf: "center", gap: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text },
  description: { fontSize: fontSize.md, color: colors.textMuted },
  notice: { padding: spacing.md, borderRadius: radius.sm, color: colors.text, backgroundColor: colors.lightBg,
    fontSize: fontSize.md, lineHeight: 23 },
  menuItem: { minHeight: 48, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.brandChipBg,
    justifyContent: "center" },
  button: { minHeight: 48, padding: spacing.md, borderRadius: radius.sm,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  buttonLabel: { color: colors.white, fontSize: fontSize.md, fontWeight: "600" },
  secondary: { minHeight: 48, padding: spacing.md, alignItems: "center", justifyContent: "center" },
  link: { color: colors.secondary, fontSize: fontSize.md, fontWeight: "600" },
});
