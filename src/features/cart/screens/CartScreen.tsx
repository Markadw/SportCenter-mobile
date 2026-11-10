import { Stack, useRouter } from "expo-router";
import { ChevronLeft, CircleArrowRight, Minus, Plus, Trash2 } from "lucide-react-native";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProductImage } from "../../../components/ProductImage";
import { ScreenState } from "../../../components/ScreenState";
import { colors, radius, spacing, storefront } from "../../../constants/theme";
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
  const countLabel = `${vm.cart.itemCount} ${vm.cart.itemCount === 1 ? "artículo" : "artículos"}`;
  const renderItem = ({ item }: { item: CartItem }) => {
    const attributes = Object.entries(item.attributes).map(([key, value]) => `${key}: ${value}`).join(" · ");
    const max = Math.min(99, item.stock);
    const canAdd = !blocked && item.active && item.quantity < max;
    const canSubtract = !blocked && item.quantity > 1;
    return <View style={styles.item}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${item.name}`} onPress={() => router.push({ pathname: "/product/[id]", params: { id: item.productId } })}>
        <ProductImage uri={item.image} label={item.name} style={styles.image} />
      </Pressable>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle} numberOfLines={2}>{item.name}</Text>
        {!!attributes && <Text style={styles.muted} numberOfLines={2}>{attributes}</Text>}
        <Text style={styles.price}>{money(item.unitPrice)} c/u</Text>
        {(!item.active || item.stock < item.quantity) && <Text accessibilityRole="alert" style={styles.error}>Revisa las existencias ({item.stock} disponibles).</Text>}
        {item.active && item.stock > 0 && item.quantity > item.stock && <Pressable accessibilityRole="button" accessibilityLabel={`Ajustar ${item.name} a ${item.stock} unidades disponibles`} disabled={blocked} style={styles.adjust}
          onPress={() => void vm.update(item.variantId, max)}><Text style={styles.link}>Ajustar a {max} disponibles</Text></Pressable>}
        <View style={styles.actions}>
          <View style={styles.quantity}>
            {/* Círculos de 36 px + hitSlop de 6 px = 48 px táctiles. */}
            <Pressable accessibilityRole="button" accessibilityLabel={`Restar una unidad de ${item.name}`} disabled={!canSubtract} hitSlop={6}
              style={[styles.step, !canSubtract && styles.disabled]} onPress={() => void vm.update(item.variantId, item.quantity - 1)}><Minus size={16} color={colors.secondary} /></Pressable>
            <Text accessibilityLabel={`Cantidad de ${item.name}: ${item.quantity}`} style={styles.quantityValue}>{item.quantity}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Agregar una unidad de ${item.name}`} disabled={!canAdd} hitSlop={6}
              style={[styles.step, !canAdd && styles.disabled]} onPress={() => void vm.update(item.variantId, item.quantity + 1)}><Plus size={16} color={colors.secondary} /></Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Eliminar ${item.name}`} disabled={blocked} style={({ pressed }) => [styles.remove, blocked && styles.disabled, pressed && styles.pressed]}
            onPress={() => void vm.remove(item.variantId)}>
            <Trash2 size={16} color={storefront.errorText} /><Text style={styles.removeLabel}>Eliminar</Text>
          </Pressable>
        </View>
      </View>
    </View>;
  };
  return <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={2} onPress={() => router.canGoBack() ? router.back() : router.replace("/")}
        style={({ pressed }) => [styles.circle, pressed && styles.pressed]}><ChevronLeft size={24} color={colors.text} /></Pressable>
      <View style={styles.topText}>
        <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>Mi carrito</Text>
        <Text style={styles.muted}>{countLabel}</Text>
      </View>
    </View>
    <FlatList data={vm.cart.items} keyExtractor={i => String(i.variantId)} renderItem={renderItem} contentContainerStyle={styles.content}
      ListHeaderComponent={vm.error || blocked ? <View style={styles.header}>
        {!!vm.error && <Text accessibilityRole="alert" style={styles.error}>{vm.error}</Text>}
        {!!vm.error && <Pressable accessibilityRole="button" style={styles.adjust} disabled={blocked} onPress={() => void vm.reload()}><Text style={styles.link}>Consultar carrito</Text></Pressable>}
        {blocked && <ActivityIndicator color={colors.primary} />}
      </View> : null}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.itemTitle}>Tu carrito está vacío</Text><Text style={styles.muted}>Encuentra lo que necesitas para tu próximo entrenamiento.</Text><Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.push("/catalog")}><Text style={styles.primaryLabel}>Explorar catálogo</Text></Pressable></View>}
      ListFooterComponent={vm.cart.items.length ? <View style={styles.footer}>
        <View style={styles.summary}>
          <View style={styles.summaryRow}><Text style={styles.muted}>Artículos</Text><Text style={styles.summaryValue}>{vm.cart.itemCount}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.subtotal}>{money(vm.cart.subtotal)}</Text></View>
          <Text style={styles.note}>El envío y los descuentos se calculan al continuar.</Text>
        </View>
        <Pressable accessibilityRole="button" disabled={blocked || invalid} style={({ pressed }) => [styles.primary, styles.primaryRow, (blocked || invalid) && styles.disabled, pressed && styles.pressed]} onPress={() => router.push("/checkout")}>
          <Text style={styles.primaryLabel}>Continuar compra</Text><CircleArrowRight size={20} color={colors.white} />
        </Pressable>
      </View> : null} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: storefront.background },
  // Encabezado compacto como en Detalle: círculo de 44 px + hitSlop de 2 px.
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: storefront.border },
  topText: { flex: 1, minWidth: 0 },
  circle: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: storefront.background, borderWidth: 1, borderColor: storefront.border },
  pressed: { opacity: 0.65 },
  content: { flexGrow: 1, padding: spacing.lg, width: "100%", maxWidth: 640, alignSelf: "center", gap: spacing.md },
  header: { gap: spacing.sm },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "700", color: colors.text },
  item: { flexDirection: "row", gap: spacing.md, padding: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: storefront.border },
  image: { width: 90, height: 90, borderRadius: radius.md, overflow: "hidden", backgroundColor: storefront.imageBackground },
  itemContent: { flex: 1, minWidth: 0, gap: spacing.xs },
  itemTitle: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  price: { color: colors.primary, fontSize: 15, lineHeight: 22, fontWeight: "700" },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.xs },
  quantity: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  step: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  quantityValue: { minWidth: 24, textAlign: "center", fontSize: 15, fontWeight: "600", color: colors.text },
  remove: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.sm },
  removeLabel: { color: storefront.errorText, fontSize: 14, fontWeight: "600" },
  adjust: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  link: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  footer: { gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  summary: { gap: spacing.sm, padding: spacing.lg, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: storefront.border },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  summaryLabel: { color: colors.text, fontSize: 16, fontWeight: "600" },
  summaryValue: { color: colors.text, fontSize: 14, fontWeight: "600" },
  subtotal: { color: colors.text, fontSize: 22, lineHeight: 30, fontWeight: "700" },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 19, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: storefront.border },
  primary: { backgroundColor: colors.primary, minHeight: 52, borderRadius: radius.pill, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center" },
  primaryRow: { flexDirection: "row", gap: spacing.sm },
  primaryLabel: { color: colors.white, fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  error: { color: storefront.errorText, fontSize: 13, lineHeight: 19 },
  empty: { gap: spacing.lg, paddingVertical: spacing.xxl },
});
