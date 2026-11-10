import { useRouter } from "expo-router";
import { ChevronLeft, Search, User, X } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius, spacing, storefront } from "../constants/theme";
import { useSession } from "../features/auth/context/SessionContext";

type AppHeaderProps = {
  showSearch?: boolean;
  onSearch?: (query: string) => void;
  /** "back" sustituye el logotipo por un botón circular para volver. */
  leading?: "logo" | "back";
  /** Búsqueda controlada: filtra en la pantalla actual en lugar de abrir el catálogo. */
  search?: { value: string; onChange: (value: string) => void; label: string };
};

export function AppHeader({ showSearch = true, onSearch, leading = "logo", search: controlled }: AppHeaderProps) {
  const router = useRouter();
  const { session } = useSession();
  const [ownQuery, setOwnQuery] = useState("");
  const query = controlled ? controlled.value : ownQuery;
  const setQuery = controlled ? controlled.onChange : setOwnQuery;
  const search = () => { if (!controlled && query.trim()) { onSearch?.(query.trim()); router.push({ pathname: "/catalog", params: { q: query.trim() } }); } };
  return <View style={styles.root}>
    {leading === "back"
      ? <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.canGoBack() ? router.back() : router.replace("/")} hitSlop={2} style={({ pressed }) => [styles.circle, pressed && styles.pressed]}>
        <ChevronLeft size={24} color={colors.text} />
      </Pressable>
      : <Pressable accessibilityRole="button" accessibilityLabel="Ir al inicio" onPress={() => router.replace("/")} hitSlop={2} style={({ pressed }) => [styles.circle, pressed && styles.pressed]}>
        <Image source={require("../../assets/logo/logo-sc.png")} style={styles.logo} resizeMode="contain" />
      </Pressable>}
    {showSearch ? <View style={styles.search}>
      <Search size={18} color={colors.textMuted} />
      <View style={styles.field}>
        {/* El placeholder nativo de Android no admite numberOfLines ni elipsis y se parte en
            dos líneas cuando el campo es angosto; este texto lo sustituye y se recorta con «…». */}
        {!query && <Text style={styles.placeholder} numberOfLines={1} ellipsizeMode="tail" pointerEvents="none" importantForAccessibility="no" accessibilityElementsHidden>
          Producto, marca o deporte
        </Text>}
        <TextInput accessibilityLabel={controlled?.label ?? "Buscar productos"} accessibilityHint="Producto, marca o deporte"
          selectionColor={colors.primary} style={styles.input} value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" maxLength={100} />
      </View>
      {controlled && !!query && <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" hitSlop={8} style={styles.clear} onPress={() => setQuery("")}>
        <X size={18} color={colors.textMuted} />
      </Pressable>}
    </View> : <View style={styles.spacer} />}
    <Pressable accessibilityRole="button" accessibilityLabel={session ? "Abrir mi cuenta" : "Abrir inicio de sesión"}
      onPress={() => router.push(session ? "/account" : "/login")} hitSlop={2} style={({ pressed }) => [styles.circle, pressed && styles.pressed]}>
      <User size={22} color={colors.text} />
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  root: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: storefront.border },
  // 44 px visibles + hitSlop de 2 px = 48 px de área táctil.
  circle: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: storefront.background, borderWidth: 1, borderColor: storefront.border },
  logo: { width: 40, height: 40 },
  pressed: { opacity: 0.65 },
  search: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, borderRadius: radius.pill, backgroundColor: storefront.background, borderWidth: 1, borderColor: storefront.border, paddingHorizontal: spacing.lg },
  field: { flex: 1, flexShrink: 1, minWidth: 0, height: 48, justifyContent: "center" },
  placeholder: { position: "absolute", left: 0, right: 0, fontSize: 15, color: colors.textMuted },
  input: { width: "100%", height: 48, paddingVertical: 0, paddingHorizontal: 0, fontSize: 15, color: colors.text, textAlignVertical: "center" },
  clear: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  spacer: { flex: 1 },
});
