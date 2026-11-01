import { Redirect, useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing } from "../../../constants/theme";
import { useSession } from "../../auth/context/SessionContext";
import { useOrdersViewModel } from "../hooks/useOrdersViewModel";
import { OrderState } from "../components/OrderState";
import { date, money, orderStatus } from "../presentation";
import { FormButton } from "../../registration/components/Form";
import { ScreenState } from "../../../components/ScreenState";
export function OrdersScreen() {
  const auth = useSession(), { session } = auth, model = useOrdersViewModel(session?.accessToken), router = useRouter();
  if ("isRestoring" in auth && auth.isRestoring === true) return <ScreenState title="Restaurando sesión" loading />;
  if (!session) return <Redirect href="/login" />;
  if (!model.data) return <OrderState {...model} />;
  return <SafeAreaView style={styles.root} edges={["bottom", "left", "right"]}>
    <FlatList data={model.data} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>Mis pedidos</Text><Text style={styles.muted}>Aquí aparecen tus pedidos que ya no están pendientes de pago.</Text><FormButton label="Actualizar pedidos" onPress={model.retry} secondary /></View>}
      ListEmptyComponent={<Text style={styles.empty}>Aún no tienes pedidos registrados en esta lista.</Text>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={"Ver pedido " + item.id} style={styles.card}
        onPress={() => router.push({ pathname: "/orders/[id]", params: { id: String(item.id) } })}>
        <Text style={styles.subtitle}>Pedido #{item.id}</Text><Text style={styles.text}>{orderStatus(item.status)}</Text>
        <Text style={styles.muted}>{date(item.createdAt)} · {item.items.reduce((total, row) => total + row.quantity, 0)} productos</Text>
        <Text style={styles.total}>{money(item.total)}</Text>
      </Pressable>} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.lightBg }, list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }, heading: { gap: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text }, subtitle: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  text: { fontSize: fontSize.md, color: colors.primary }, muted: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },
  card: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.white, gap: spacing.sm, minHeight: 100 }, total: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  empty: { color: colors.textMuted, fontSize: fontSize.md, textAlign: "center", paddingVertical: spacing.xxl },
});
