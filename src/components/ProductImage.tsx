import { useState } from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../constants/theme";

export function ProductImage({ uri, label, style }: { uri?: string | null; label: string; style?: StyleProp<ViewStyle> }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  return <View style={[styles.root, style]}>
    {uri && failedUri !== uri ? <Image source={{ uri }} style={styles.image} resizeMode="contain"
      accessibilityLabel={label} onError={() => setFailedUri(uri)} />
      : <Text style={styles.fallback}>Imagen no disponible</Text>}
  </View>;
}
const styles = StyleSheet.create({
  root: { alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  image: { width: "100%", height: "100%" },
  fallback: { color: colors.textMuted, textAlign: "center", padding: 12, fontSize: 12 },
});
