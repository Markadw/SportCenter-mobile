import { Redirect, useRouter } from "expo-router";
import { ChevronRight, FileText, LogOut, Package, ShieldCheck, Trash2, User, type LucideIcon } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "../../../components/ScreenState";
import { colors, fontSize, radius, spacing, storefront } from "../../../constants/theme";
import { canRequestAccountDeletion } from "../../account-deletion/eligibility";
import { useSession } from "../context/SessionContext";

/** Fila de menú: icono, texto y flecha; reutilizada por las pantallas de cuenta. */
export function MenuRow({ icon: Icon, label, onPress, danger = false, last = false }: { icon: LucideIcon; label: string; onPress: () => void; danger?: boolean; last?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [menuStyles.row, !last && menuStyles.divider, pressed && menuStyles.pressed]}>
    <Icon size={20} color={danger ? storefront.errorText : colors.primary} />
    <Text style={[menuStyles.label, danger && menuStyles.danger]}>{label}</Text>
    <ChevronRight size={18} color={colors.textMuted} />
  </Pressable>;
}

export function AccountScreen() {
  const { session, signOut, notice, isRestoring } = useSession();
  const router = useRouter();
  if (isRestoring) return <ScreenState title="Restaurando sesión" loading />;
  if (!session) return <Redirect href="/login" />;
  const canDelete = canRequestAccountDeletion(session.accessToken);
  return (
    <SafeAreaView style={styles.container} edges={["bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <View style={styles.account}>
            <View style={styles.avatar}><User size={24} color={colors.primary} /></View>
            <View style={styles.accountText}>
              <Text accessibilityRole="header" style={styles.title}>Mi cuenta</Text>
              <Text style={styles.description}>Has iniciado sesión en Sport Center.</Text>
            </View>
          </View>
          {notice && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
          <View style={menuStyles.group}>
            <MenuRow icon={User} label="Mi perfil" onPress={() => router.push("/profile")} />
            <MenuRow icon={Package} label="Mis pedidos" onPress={() => router.push("/orders")} last />
          </View>
          <View style={menuStyles.group}>
            <MenuRow icon={FileText} label="Términos y condiciones" onPress={() => router.push("/legal/terms")} />
            <MenuRow icon={ShieldCheck} label="Política de privacidad" onPress={() => router.push("/legal/privacy")} last={!canDelete} />
            {canDelete && <MenuRow icon={Trash2} label="Eliminar mi cuenta" danger onPress={() => router.push("/account-deletion")} last />}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sesión" style={({ pressed }) => [styles.logout, pressed && menuStyles.pressed]}
            onPress={() => { void signOut(); router.replace("/login"); }}>
            <LogOut size={18} color={colors.secondary} />
            <Text style={styles.logoutLabel}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Un solo fondo blanco; los grupos se distinguen con borde sutil y espacio.
export const menuStyles = StyleSheet.create({
  group: { borderWidth: 1, borderColor: storefront.border, borderRadius: radius.lg, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 52, paddingHorizontal: spacing.lg },
  divider: { borderBottomWidth: 1, borderBottomColor: storefront.border },
  label: { flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: "600" },
  danger: { color: storefront.errorText },
  pressed: { opacity: 0.6 },
});
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  scroll: { padding: spacing.lg },
  content: { width: "100%", maxWidth: 480, alignSelf: "center", gap: spacing.lg },
  account: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border, alignItems: "center", justifyContent: "center" },
  accountText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: fontSize.xl, lineHeight: 28, fontWeight: "700", color: colors.text },
  description: { fontSize: fontSize.sm, lineHeight: 19, color: colors.textMuted },
  notice: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: storefront.border, color: colors.text, fontSize: fontSize.md, lineHeight: 23 },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border },
  logoutLabel: { color: colors.secondary, fontSize: fontSize.md, fontWeight: "600" },
});
