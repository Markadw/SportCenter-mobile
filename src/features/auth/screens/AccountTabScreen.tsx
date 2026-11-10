import { useRouter } from "expo-router";
import { FileText, ShieldCheck, User } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "../../../components/ScreenState";
import { colors, radius, spacing, storefront } from "../../../constants/theme";
import { useSession } from "../context/SessionContext";
import { AccountScreen, MenuRow, menuStyles } from "./AccountScreen";

export function AccountTabScreen() {
  const { session, isRestoring, notice } = useSession();
  const router = useRouter();
  if (isRestoring) return <SafeAreaView style={styles.root} edges={["top"]}><ScreenState title="Restaurando sesión" loading /></SafeAreaView>;
  if (session) return <SafeAreaView style={styles.root} edges={["top"]}><AccountScreen /></SafeAreaView>;
  return <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.icon}><User size={32} color={colors.primary} /></View>
      <Text accessibilityRole="header" style={styles.title}>Tu cuenta Sport Center</Text>
      <Text style={styles.description}>Inicia sesión con tu cuenta verificada o regístrate para comenzar.</Text>
      {notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.description}>{notice}</Text>}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Iniciar sesión" onPress={() => router.push("/login")}
          style={({ pressed }) => [styles.primary, pressed && menuStyles.pressed]}><Text style={styles.primaryLabel}>Iniciar sesión</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Crear cuenta" onPress={() => router.push("/register")}
          style={({ pressed }) => [styles.secondary, pressed && menuStyles.pressed]}><Text style={styles.secondaryLabel}>Crear cuenta</Text></Pressable>
      </View>
      <View style={[menuStyles.group, styles.privacy]}>
        <MenuRow icon={FileText} label="Términos y condiciones" onPress={() => router.push("/legal/terms")} />
        <MenuRow icon={ShieldCheck} label="Política de privacidad" onPress={() => router.push("/legal/privacy")} last />
      </View>
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.xl, gap: spacing.md, width: "100%", maxWidth: 480, alignSelf: "center", alignItems: "center" },
  icon: { width: 72, height: 72, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border, alignItems: "center", justifyContent: "center", marginTop: spacing.xl },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700", color: colors.text, textAlign: "center" },
  description: { fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: "center" },
  actions: { alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.md },
  primary: { minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  primaryLabel: { color: colors.white, fontSize: 16, fontWeight: "700" },
  secondary: { minHeight: 52, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.primary, alignItems: "center", justifyContent: "center" },
  secondaryLabel: { color: colors.primary, fontSize: 16, fontWeight: "700" },
  privacy: { alignSelf: "stretch", marginTop: spacing.md },
});
