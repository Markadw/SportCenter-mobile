import { Stack, useRouter } from "expo-router";
import { Check, ChevronDown, ChevronLeft, ChevronUp, ExternalLink, MapPin } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "../../../components/ScreenState";
import { colors, radius, spacing, storefront } from "../../../constants/theme";
import { useSession } from "../../auth/context/SessionContext";
import { money } from "../../products/presentation";
import { getCheckoutDraft } from "../draft";
import { useCheckoutViewModel } from "../hooks/useCheckoutViewModel";
import { openPayment } from "../payment";
import type { AddressDraft } from "../types";

export function CheckoutScreen() {
  const { session, sessionScopeId, isRestoring } = useSession(), router = useRouter();
  if (isRestoring) return <ScreenState title="Restaurando sesión" loading />;
  if (!session) {
    if (sessionScopeId) return <ScreenState title="Sesión temporalmente no disponible" message="Conservamos el estado de tu compra. Revisa tu conexión y vuelve a la app para recuperar la sesión." action="Volver al catálogo" onAction={() => router.push("/catalog")} />;
    getCheckoutDraft(null);
    return <ScreenState title="Inicia sesión para continuar" action="Iniciar sesión" onAction={() => router.push({ pathname: "/login", params: { returnTo: "/checkout" } })} />;
  }
  return <AuthenticatedCheckout key={session.sessionId} token={session.accessToken} sessionId={session.sessionId} />;
}
const fields: { key: keyof Omit<AddressDraft, "principal">; label: string; max: number; required?: boolean }[] = [
  { key: "alias", label: "Alias (opcional)", max: 50 }, { key: "calle", label: "Calle", max: 150, required: true },
  { key: "numero", label: "Número (opcional)", max: 20 }, { key: "colonia", label: "Colonia (opcional)", max: 100 },
  { key: "ciudad", label: "Ciudad", max: 100, required: true }, { key: "estado", label: "Estado", max: 100, required: true },
  { key: "codigo_postal", label: "Código postal", max: 5, required: true }, { key: "pais", label: "País", max: 100 },
];
type Field = (typeof fields)[number] & { flex: number };
const field = (key: Field["key"], flex = 1): Field => ({ ...fields.find(f => f.key === key)!, flex });
// País no se edita: conserva el valor del borrador (México por defecto) y se muestra como texto.
const fieldRows: Field[][] = [
  [field("alias"), field("codigo_postal")], [field("calle")], [field("numero"), field("colonia")],
  [field("ciudad")], [field("estado")],
];
function AuthenticatedCheckout({ token, sessionId }: { token: string; sessionId: string }) {
  const vm = useCheckoutViewModel(token, sessionId), router = useRouter();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Secciones desplegables: estado sólo visual; el cupón y la dirección siguen en el borrador del ViewModel.
  const [promoOpen, setPromoOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const { draft, summary } = vm;
  const disabled = vm.busy || vm.loading || !!draft.prepared || draft.uncertain;
  if (vm.loading && !summary) return <ScreenState loading title="Preparando tu compra…" />;
  if (!summary) return <ScreenState title="No pudimos cargar la compra" message={vm.error ?? undefined} action="Reintentar" onAction={() => void vm.recalculate(draft.shippingId, draft.appliedPromo)} />;
  if (!summary.items.length && !draft.prepared) return <ScreenState title="Tu carrito está vacío" action="Ver catálogo" onAction={() => router.replace("/catalog")} />;
  const pay = async () => {
    const prepared = await vm.confirm();
    if (!prepared || !alive.current) return;
    if (prepared.url) {
      try { await openPayment(prepared.url); } catch { /* La orden sigue disponible para consultar/reabrir. */ }
    }
    if (alive.current) router.push({ pathname: "/checkout-status", params: { id: String(prepared.orderId) } });
  };
  const methods = summary.shippingMethods.length ? summary.shippingMethods : [summary.selectedShipping].filter(method => method.active);
  const countLabel = `${summary.totals.itemCount} ${summary.totals.itemCount === 1 ? "artículo" : "artículos"}`;
  return <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
    <Stack.Screen options={{ headerShown: false }} />
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {/* Encabezado dentro del contenido desplazable: se oculta al bajar sin animaciones. */}
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Volver al carrito" hitSlop={2} disabled={vm.busy}
            onPress={() => router.canGoBack() ? router.back() : router.replace("/cart")} style={({ pressed }) => [styles.circle, vm.busy && styles.disabled, pressed && styles.pressed]}>
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <View style={styles.topText}>
            <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>Finalizar compra</Text>
            <Text style={styles.muted}>1. Dirección · 2. Envío · 3. Pago</Text>
          </View>
        </View>
        {!!vm.error && <Text accessibilityRole="alert" style={styles.error}>{vm.error}</Text>}

        <View style={styles.card}>
          <View style={styles.sectionTitle}>
            <View style={styles.step}><Text style={styles.stepLabel}>1</Text></View>
            <MapPin size={18} color={colors.primary} />
            <Text accessibilityRole="header" style={styles.heading}>Dirección de envío</Text>
          </View>
          {summary.addresses.map(address => {
            const checked = draft.addressId === address.id;
            return <Pressable key={address.id} accessibilityRole="radio" accessibilityState={{ checked, disabled }} disabled={disabled}
              onPress={() => vm.change({ addressId: address.id })} style={[styles.option, checked && styles.selected]}>
              <View style={[styles.radio, checked && styles.radioOn]}>{checked && <View style={styles.radioDot} />}</View>
              <View style={styles.optionText}>
                <Text style={styles.label}>{address.alias || "Dirección guardada"}{address.principal ? " · Principal" : ""}</Text>
                <Text style={styles.muted}>{[address.calle, address.numero].filter(Boolean).join(" ")}{address.colonia ? `, ${address.colonia}` : ""}</Text>
                <Text style={styles.muted}>{address.ciudad}, {address.estado} · {address.codigo_postal}</Text>
              </View>
            </Pressable>;
          })}
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: draft.addressId === null, disabled }} disabled={disabled}
            style={[styles.option, draft.addressId === null && styles.selected]} onPress={() => vm.change({ addressId: null })}>
            <View style={[styles.radio, draft.addressId === null && styles.radioOn]}>{draft.addressId === null && <View style={styles.radioDot} />}</View>
            <Text style={[styles.label, styles.optionText]}>Usar una nueva dirección</Text>
          </Pressable>
          {draft.addressId === null && <View style={styles.form}>
            {fieldRows.map((row, i) => <View key={i} style={styles.fieldRow}>
              {row.map(field => <View key={field.key} style={[styles.field, { flex: field.flex }]}>
                <Text style={styles.fieldLabel} numberOfLines={2}>{field.label}{field.required ? " *" : ""}</Text>
                <TextInput accessibilityLabel={field.label} editable={!disabled} maxLength={field.max} value={draft.address[field.key]}
                  keyboardType={field.key === "codigo_postal" ? "number-pad" : "default"} autoCapitalize="words"
                  onChangeText={value => vm.change({ address: { ...draft.address, [field.key]: value } })} style={[styles.input, !disabled ? null : styles.disabled]} />
              </View>)}
            </View>)}
            <View style={styles.country}><Text style={styles.fieldLabel}>País</Text><Text style={styles.countryValue}>{draft.address.pais || "México"}</Text></View>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.address.principal, disabled }} disabled={disabled} style={styles.check}
              onPress={() => vm.change({ address: { ...draft.address, principal: !draft.address.principal } })}>
              <View style={[styles.box, draft.address.principal && styles.boxOn]}>{draft.address.principal && <Check size={14} color={colors.white} />}</View>
              <Text style={styles.label}>Usar como dirección principal</Text>
            </Pressable>
            <Text style={styles.muted}>La dirección se guarda cuando se crea el pedido.</Text>
          </View>}
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Método de envío</Text>
          {methods.map(method => {
            const checked = draft.shippingId === method.id;
            return <Pressable key={method.id ?? "default"} disabled={disabled} accessibilityRole="radio" accessibilityState={{ checked, disabled }}
              onPress={() => void vm.recalculate(method.id, draft.appliedPromo)} style={[styles.option, checked && styles.selected]}>
              <View style={[styles.radio, checked && styles.radioOn]}>{checked && <View style={styles.radioDot} />}</View>
              <View style={styles.optionText}>
                <Text style={styles.label}>{method.name}</Text>
                {!!method.description && <Text style={styles.muted}>{method.description}</Text>}
                <Text style={styles.muted}>{method.minDays}–{method.maxDays} días</Text>
              </View>
              <Text style={styles.cost}>base {money(method.cost)}</Text>
            </Pressable>;
          })}
          {!summary.selectedShipping.active && <Text accessibilityRole="alert" style={styles.error}>No hay un método de envío disponible. Intenta más tarde.</Text>}
        </View>

        <View style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cupón" accessibilityState={{ expanded: promoOpen }} onPress={() => setPromoOpen(open => !open)} style={styles.toggle}>
            <View style={styles.optionText}>
              <Text style={styles.heading}>Cupón</Text>
              {!!summary.promotion && <Text style={styles.muted}>Promoción: {summary.promotion}</Text>}
            </View>
            {promoOpen ? <ChevronUp size={20} color={colors.textMuted} /> : <ChevronDown size={20} color={colors.textMuted} />}
          </Pressable>
          {promoOpen && <View style={styles.promoRow}>
            <TextInput accessibilityLabel="Código de promoción" placeholder="Código" placeholderTextColor={colors.textMuted} maxLength={50} editable={!disabled} autoCapitalize="characters"
              value={draft.promo} onChangeText={promo => vm.change({ promo })} style={[styles.input, styles.promoInput]} />
            <Pressable accessibilityRole="button" accessibilityLabel={draft.promo.trim() ? "Aplicar cupón" : "Actualizar resumen"} disabled={disabled}
              style={({ pressed }) => [styles.apply, disabled && styles.disabled, pressed && styles.pressed]} onPress={() => void vm.recalculate(draft.shippingId, draft.promo)}>
              <Text style={styles.applyLabel}>Aplicar</Text>
            </Pressable>
          </View>}
        </View>

        <View style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: itemsOpen }} onPress={() => setItemsOpen(open => !open)} style={styles.toggle}>
            <Text style={[styles.heading, styles.optionText]}>Resumen · {countLabel}</Text>
            {itemsOpen ? <ChevronUp size={20} color={colors.textMuted} /> : <ChevronDown size={20} color={colors.textMuted} />}
          </Pressable>
          {itemsOpen && <View style={styles.items}>
            {summary.items.map(item => <View key={item.variantId} style={styles.row}>
              <Text style={styles.item} numberOfLines={2}>{item.quantity} × {item.name}</Text><Text style={styles.muted}>{money(item.unitPrice)} c/u</Text>
            </View>)}
          </View>}
          <View style={styles.row}><Text style={styles.muted}>Subtotal</Text><Text style={styles.label}>{money(summary.totals.subtotal)}</Text></View>
          <View style={styles.row}><Text style={styles.muted}>Descuento</Text><Text style={styles.label}>−{money(summary.totals.discount)}</Text></View>
          <View style={styles.row}><Text style={styles.muted}>Envío</Text><Text style={styles.label}>{money(summary.totals.shipping)}</Text></View>
          <View style={[styles.row, styles.totalRow]}><Text style={styles.heading}>Total</Text><Text style={styles.total}>{money(summary.totals.total)}</Text></View>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>Mercado Pago</Text>
          <Text style={styles.muted}>Continúa en el navegador para elegir tu forma de pago. Al volver consultaremos el estado del pedido.</Text>
          {vm.loading && <ActivityIndicator color={colors.primary} />}
          {draft.prepared ? <Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.push({ pathname: "/checkout-status", params: { id: String(draft.prepared!.orderId) } })}>
            <Text style={styles.primaryLabel}>Consultar pedido #{draft.prepared.orderId}</Text></Pressable> :
            <Pressable accessibilityRole="button" accessibilityLabel="Continuar a Mercado Pago" accessibilityState={{ disabled }} disabled={disabled}
              style={({ pressed }) => [styles.primary, disabled && styles.disabled, pressed && styles.pressed]} onPress={() => void pay()}>
              {vm.busy ? <ActivityIndicator color={colors.white} /> : <><Text style={styles.primaryLabel}>Continuar a Mercado Pago</Text><ExternalLink size={18} color={colors.white} /></>}
            </Pressable>}
          {draft.uncertain && !vm.busy && <View style={styles.form}><Text accessibilityRole="alert" style={styles.error}>No se repetirá el pedido automáticamente. Consulta tus pedidos o vuelve más tarde para verificar el estado.</Text><Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.push("/orders")}><Text style={styles.link}>Consultar mis pedidos</Text></Pressable></View>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: storefront.background },
  content: { padding: spacing.lg, gap: spacing.md, width: "100%", maxWidth: 600, alignSelf: "center", paddingBottom: spacing.xxl },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  topText: { flex: 1, minWidth: 0 },
  // 44 px visibles + hitSlop de 2 px = 48 px táctiles.
  circle: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: storefront.border },
  pressed: { opacity: 0.65 },
  title: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: "700" },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: storefront.border, padding: spacing.lg, gap: spacing.sm },
  heading: { color: colors.text, fontSize: 16, lineHeight: 24, fontWeight: "700" },
  muted: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  label: { color: colors.text, fontSize: 15, lineHeight: 21, fontWeight: "600" },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: storefront.border, borderRadius: radius.md, minHeight: 52, padding: spacing.md },
  selected: { borderColor: colors.primary, backgroundColor: colors.brandChipBg },
  optionText: { flex: 1, minWidth: 0, gap: 2 },
  radio: { width: 20, height: 20, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.neutral, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.primary },
  cost: { color: colors.secondary, fontSize: 14, fontWeight: "700" },
  form: { gap: spacing.sm, paddingTop: spacing.xs },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  step: { width: 24, height: 24, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  stepLabel: { color: colors.white, fontSize: 13, fontWeight: "700", includeFontPadding: false },
  // Filas con la misma altura de campo; las etiquetas pueden ocupar dos líneas sin desalinear los campos.
  fieldRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  field: { gap: spacing.xs, minWidth: 0 },
  country: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: storefront.background },
  countryValue: { color: colors.text, fontSize: 15, fontWeight: "600" },
  fieldLabel: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: storefront.border, borderRadius: radius.md, height: 48, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: storefront.background, fontSize: 16 },
  check: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.neutral, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  promoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  promoInput: { flex: 1, minWidth: 0, borderRadius: radius.pill },
  apply: { minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.brandChipBg, alignItems: "center", justifyContent: "center" },
  applyLabel: { color: colors.secondary, fontSize: 15, fontWeight: "700" },
  items: { gap: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: storefront.border },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.md },
  item: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  totalRow: { paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: storefront.border },
  total: { color: colors.primary, fontSize: 22, lineHeight: 30, fontWeight: "700" },
  primary: { flexDirection: "row", gap: spacing.sm, minHeight: 52, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", marginTop: spacing.xs },
  primaryLabel: { color: colors.white, fontSize: 16, fontWeight: "700" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  link: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.45 },
  error: { color: storefront.errorText, fontSize: 14, lineHeight: 21 },
});
