import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProductImage } from "../../../components/ProductImage";
import { ScreenState } from "../../../components/ScreenState";
import { colors, radius, spacing } from "../../../constants/theme";
import { useSession } from "../../auth/context/SessionContext";
import { money } from "../../products/presentation";
import { useCartViewModel } from "../hooks/useCartViewModel";
import type { CartItem } from "../types";

export function CartScreen() {
  const { session, sessionScopeId, isRestoring } = useSession();
  const router = useRouter();
  if (isRestoring) return <ScreenState title="Restaurando sesión" loading />;
  if (!session && sessionScopeId) return <ScreenState title="Sesión temporalmente no disponible" message="Revisa tu conexión y vuelve a la app para recuperar tu carrito." action="Volver al catálogo" onAction={() => router.push("/catalog")} />;
  if (!session) return <ScreenState title="Tu carrito" message="Inicia sesión con tu cuenta de cliente para ver tus productos." action="Iniciar sesión" onAction={() => router.push({ pathname: "/login", params: { returnTo: "/cart" } })} />;
  return <AuthenticatedCart key={session.sessionId} token={session.accessToken} />;
}
function AuthenticatedCart({ token }: { token: string }) {
  const vm = useCartViewModel(token), router = useRouter();
  if (vm.loading && !vm.cart) return <ScreenState loading title="Cargando carrito…" />;
  if (!vm.cart) return <ScreenState title="No pudimos cargar el carrito" message={vm.error ?? undefined} action="Reintentar" onAction={() => void vm.reload()} />;
  const blocked = vm.busy || vm.loading;
  const invalid = vm.cart.items.some(i => !i.active || i.stock < i.quantity);
  const renderItem = ({ item }: { item: CartItem }) => <View style={styles.item}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${item.name}`} onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.productId } })}>
      <ProductImage uri={item.image} label={item.name} style={styles.image} />
    </Pressable>
    <View style={styles.itemContent}>
      <Text style={styles.itemTitle}>{item.name}</Text>
      <Text style={styles.muted}>{Object.entries(item.attributes).map(([key, value]) => `${key}: ${value}`).join(" · ") || item.sku}</Text>
      <Text style={styles.price}>{money(item.unitPrice)} c/u</Text>
      {(!item.active || item.stock < item.quantity) && <Text accessibilityRole="alert" style={styles.error}>Revisa las existencias ({item.stock} disponibles).</Text>}
      {item.active && item.stock > 0 && item.quantity > item.stock && <Pressable accessibilityRole="button" accessibilityLabel={`Ajustar ${item.name} a ${item.stock} unidades disponibles`} disabled={blocked} style={styles.remove}
        onPress={() => void vm.update(item.variantId, Math.min(99, item.stock))}><Text style={styles.link}>Ajustar a {Math.min(99, item.stock)} disponibles</Text></Pressable>}
      <View style={styles.quantity}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Restar una unidad de ${item.name}`} disabled={blocked || item.quantity <= 1}
          style={[styles.step, (blocked || item.quantity <= 1) && styles.disabled]} onPress={() => void vm.update(item.variantId, item.quantity - 1)}><Text style={styles.stepText}>−</Text></Pressable>
        <Text accessibilityLabel={`Cantidad de ${item.name}: ${item.quantity}`} style={styles.quantityValue}>{item.quantity}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Agregar una unidad de ${item.name}`} disabled={blocked || !item.active || item.quantity >= Math.min(99, item.stock)}
          style={[styles.step, (blocked || item.quantity >= Math.min(99, item.stock)) && styles.disabled]} onPress={() => void vm.update(item.variantId, item.quantity + 1)}><Text style={styles.stepText}>+</Text></Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Eliminar ${item.name}`} disabled={blocked} style={styles.remove} onPress={() => void vm.remove(item.variantId)}><Text style={styles.link}>Eliminar</Text></Pressable>
    </View>
  </View>;
  return <SafeAreaView style={styles.root} edges={["bottom", "left", "right"]}>
    <FlatList data={vm.cart.items} keyExtractor={i => String(i.variantId)} renderItem={renderItem} contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>Tu carrito</Text>
        {!!vm.error && <Text accessibilityRole="alert" style={styles.error}>{vm.error}</Text>}
        {!!vm.error && <Pressable accessibilityRole="button" style={styles.remove} disabled={blocked} onPress={() => void vm.reload()}><Text style={styles.link}>Consultar carrito</Text></Pressable>}
        {blocked && <ActivityIndicator color={colors.primary} />}
      </View>}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.itemTitle}>Tu carrito está vacío</Text><Text style={styles.muted}>Encuentra lo que necesitas para tu próximo entrenamiento.</Text><Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.push("/catalog")}><Text style={styles.primaryLabel}>Explorar catálogo</Text></Pressable></View>}
      ListFooterComponent={vm.cart.items.length ? <View style={styles.footer}>
        <Text style={styles.muted}>{vm.cart.itemCount} {vm.cart.itemCount === 1 ? "artículo" : "artículos"}</Text>
        <View style={styles.total}><Text style={styles.itemTitle}>Subtotal</Text><Text style={styles.title}>{money(vm.cart.subtotal)}</Text></View>
        <Text style={styles.muted}>El envío y los descuentos se calculan al continuar.</Text>
        <Pressable accessibilityRole="button" disabled={blocked || invalid} style={[styles.primary, (blocked || invalid) && styles.disabled]} onPress={() => router.push("/checkout")}>
          <Text style={styles.primaryLabel}>Continuar compra</Text></Pressable>
      </View> : null} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white }, content: { padding: spacing.lg, width: "100%", maxWidth: 640, alignSelf: "center", gap: 16 },
  header: { gap: 12 }, title: { fontSize: 24, fontWeight: "700", color: colors.text }, item: { flexDirection: "row", gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.border },
  image: { width: 88, height: 100 }, itemContent: { flex: 1, gap: 8 }, itemTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 21 }, price: { color: colors.primary, fontSize: 16, fontWeight: "700" },
  quantity: { flexDirection: "row", alignItems: "center" }, step: { minWidth: 48, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 24, color: colors.primary }, quantityValue: { minWidth: 44, textAlign: "center", fontSize: 16, color: colors.text },
  remove: { minHeight: 48, justifyContent: "center", alignSelf: "flex-start" }, link: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  footer: { gap: 16, paddingVertical: 24 }, total: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  primary: { backgroundColor: colors.primary, minHeight: 52, borderRadius: radius.md, padding: 14, alignItems: "center", justifyContent: "center" },
  primaryLabel: { color: colors.white, fontSize: 16, fontWeight: "700" }, disabled: { opacity: 0.45 }, error: { color: colors.error, fontSize: 14, lineHeight: 21 },
  empty: { gap: 20, paddingVertical: 48 },
});
