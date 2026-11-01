import { useRouter } from "expo-router";
import { User } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "../../../components/ScreenState";
import { colors } from "../../../constants/theme";
import { FormButton } from "../../registration/components/Form";
import { useSession } from "../context/SessionContext";
import { AccountScreen } from "./AccountScreen";

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
      <FormButton label="Iniciar sesión" onPress={() => router.push("/login")} />
      <FormButton label="Crear cuenta" secondary onPress={() => router.push("/register")} />
      <FormButton label="Privacidad y términos" secondary onPress={() => router.push("/privacy")} />
      <FormButton label="Solicitar eliminación de cuenta" secondary
        onPress={() => router.push({ pathname: "/privacy", params: { section: "deletion" } })} />
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  content: { padding: 24, gap: 16, width: "100%", maxWidth: 480, alignSelf: "center" },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandChipBg, alignItems: "center", justifyContent: "center", marginTop: 24 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: "700", color: colors.text },
  description: { fontSize: 16, lineHeight: 24, color: colors.textMuted, marginBottom: 16 },
});
