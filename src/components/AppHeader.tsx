import { useRouter } from "expo-router";
import { Search, User } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";
import { colors } from "../constants/theme";
import { useSession } from "../features/auth/context/SessionContext";

export function AppHeader({ showSearch = true, onSearch }: { showSearch?: boolean; onSearch?: (query: string) => void }) {
  const router = useRouter();
  const { session } = useSession();
  const [query, setQuery] = useState("");
  const search = () => { if (query.trim()) { onSearch?.(query.trim()); router.push({ pathname: "/catalog", params: { q: query.trim() } }); } };
  return <View style={styles.root}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Ir al inicio" onPress={() => router.replace("/")} style={styles.logoButton}>
        <Image source={require("../../assets/logo/logo-sport.png")} style={styles.logo} resizeMode="contain" />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={session ? "Abrir mi cuenta" : "Abrir inicio de sesión"}
        onPress={() => router.push(session ? "/account" : "/login")} style={styles.icon}>
        <User size={23} color={colors.text} />
      </Pressable>
    </View>
    {showSearch && <View style={styles.search}>
      <Search size={20} color={colors.textMuted} />
      <TextInput accessibilityLabel="Buscar productos" placeholder="Producto, marca o deporte" placeholderTextColor={colors.textMuted}
        style={styles.input} value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" maxLength={100} />
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingBottom: 16, backgroundColor: colors.white, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 60 },
  logoButton: { minHeight: 48, justifyContent: "center" }, logo: { width: 126, height: 54 },
  icon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: colors.lightBg },
  search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, borderRadius: 12, backgroundColor: colors.lightBg, paddingHorizontal: 14 },
  input: { flex: 1, minHeight: 48, fontSize: 15, color: colors.text },
});
