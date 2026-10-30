import { useState, type PropsWithChildren } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../../constants/theme";

// Solo espera la primera consulta del catálogo, incluso si termina con error.
// Los filtros e imágenes se cargan por separado y no bloquean la entrada.
export function StartupGate({ loading, children }: PropsWithChildren<{ loading: boolean }>) {
  const [settled, setSettled] = useState(!loading);
  if (!settled && !loading) setSettled(true);
  return <View style={styles.root}>
    <View style={styles.root} accessibilityElementsHidden={!settled} importantForAccessibility={settled ? "auto" : "no-hide-descendants"}>
      {children}
    </View>
    {!settled && <View style={styles.overlay} accessibilityViewIsModal>
      <Image source={require("../../../assets/logo/logo-sport.png")} style={styles.logo} resizeMode="contain" accessibilityLabel="Sport Center" />
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.label} accessibilityLiveRegion="polite">Preparando tu tienda…</Text>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 10, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", gap: 24, padding: 24 },
  logo: { width: 240, height: 104 },
  label: { color: colors.textMuted, fontSize: 15 },
});
