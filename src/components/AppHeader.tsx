// src/components/AppHeader.tsx
import { useRouter } from "expo-router";
import { Search, ShoppingBag, User } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";
import { colors, radius, spacing } from "../constants/theme";

const LOGO = require("../../assets/logo/logo-sport.png");

interface Props {
  showSearch?: boolean;
}

export const AppHeader = ({ showSearch = true }: Props) => {
  const router = useRouter();
  const [query, setQuery] = useState("");

  return (
    <View style={styles.wrap}>
      {/* Logo */}
      <Pressable onPress={() => router.replace("/")} hitSlop={6}>
  <Image source={LOGO} style={styles.logo} resizeMode="contain" />
</Pressable>

      {/* Búsqueda */}
      {showSearch && (
        <View style={styles.searchWrap}>
          <Search size={16} color="rgba(255,255,255,0.8)" />
          <TextInput
            placeholder="Buscar productos…"
            placeholderTextColor="rgba(255,255,255,0.7)"
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (!query.trim()) return;
              router.push({
                pathname: "/catalog",
                params: { q: query.trim() },
              });
            }}
          />
        </View>
      )}

      {/* Acciones */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.push("/catalog")}
          hitSlop={6}
        >
          <ShoppingBag size={20} color={colors.white} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.push("/catalog")}
          hitSlop={6}
        >
          <User size={20} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    width: "100%",
    height: 52,
  },
  logo: {
    width: 40,
    height: 40,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: colors.white,
    paddingVertical: 0,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});