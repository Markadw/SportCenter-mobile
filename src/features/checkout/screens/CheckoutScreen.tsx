import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "../../../components/ScreenState";
import { colors, radius, spacing } from "../../../constants/theme";
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
function AuthenticatedCheckout({ token, sessionId }: { token: string; sessionId: string }) {
  const vm = useCheckoutViewModel(token, sessionId), router = useRouter();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
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
  return <SafeAreaView style={styles.root} edges={["bottom", "left", "right"]}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Finalizar compra</Text>
        <Text style={styles.muted}>1. Dirección · 2. Envío · 3. Pago</Text>
        {!!vm.error && <Text accessibilityRole="alert" style={styles.error}>{vm.error}</Text>}
        <Text style={styles.heading}>Dirección de envío</Text>
        {summary.addresses.map(address => <Pressable key={address.id} accessibilityRole="radio" accessibilityState={{ checked: draft.addressId === address.id, disabled }} disabled={disabled}
          onPress={() => vm.change({ addressId: address.id })} style={[styles.option, draft.addressId === address.id && styles.selected]}>
          <Text style={styles.label}>{address.alias || "Dirección guardada"}{address.principal ? " · Principal" : ""}</Text>
          <Text style={styles.muted}>{address.calle} {address.numero}, {address.colonia}</Text><Text style={styles.muted}>{address.ciudad}, {address.estado} · {address.codigo_postal}</Text>
        </Pressable>)}
        <Pressable accessibilityRole="radio" accessibilityState={{ checked: draft.addressId === null, disabled }} disabled={disabled}
          style={[styles.option, draft.addressId === null && styles.selected]} onPress={() => vm.change({ addressId: null })}><Text style={styles.label}>Usar una nueva dirección</Text></Pressable>
        {draft.addressId === null && <View style={styles.form}>
          {fields.map(field => <View key={field.key} style={styles.field}>
            <Text style={styles.label}>{field.label}{field.required ? " *" : ""}</Text>
            <TextInput accessibilityLabel={field.label} editable={!disabled} maxLength={field.max} value={draft.address[field.key]}
              keyboardType={field.key === "codigo_postal" ? "number-pad" : "default"} autoCapitalize="words"
              onChangeText={value => vm.change({ address: { ...draft.address, [field.key]: value } })} style={styles.input} />
          </View>)}
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: draft.address.principal, disabled }} disabled={disabled} style={styles.check}
            onPress={() => vm.change({ address: { ...draft.address, principal: !draft.address.principal } })}><Text style={styles.label}>{draft.address.principal ? "☑" : "☐"} Usar como dirección principal</Text></Pressable>
          <Text style={styles.muted}>La dirección se guarda cuando se crea el pedido.</Text>
        </View>}
        <Text style={styles.heading}>Método de envío</Text>
        {(summary.shippingMethods.length ? summary.shippingMethods : [summary.selectedShipping].filter(method => method.active)).map(method => <Pressable key={method.id ?? "default"} disabled={disabled}
          accessibilityRole="radio" accessibilityState={{ checked: draft.shippingId === method.id, disabled }}
          onPress={() => void vm.recalculate(method.id, draft.appliedPromo)} style={[styles.option, draft.shippingId === method.id && styles.selected]}>
          <Text style={styles.label}>{method.name}</Text><Text style={styles.muted}>{method.description}</Text>
          <Text style={styles.muted}>{method.minDays}–{method.maxDays} días · base {money(method.cost)}</Text>
        </Pressable>)}
        {!summary.selectedShipping.active && <Text accessibilityRole="alert" style={styles.error}>No hay un método de envío disponible. Intenta más tarde.</Text>}
        <Text style={styles.heading}>Cupón</Text>
        <TextInput accessibilityLabel="Código de promoción" maxLength={50} editable={!disabled} autoCapitalize="characters"
          value={draft.promo} onChangeText={promo => vm.change({ promo })} style={styles.input} />
        <Pressable accessibilityRole="button" disabled={disabled} style={[styles.secondary, disabled && styles.disabled]} onPress={() => void vm.recalculate(draft.shippingId, draft.promo)}>
          <Text style={styles.link}>{draft.promo.trim() ? "Aplicar cupón" : "Actualizar resumen"}</Text></Pressable>
        {!!summary.promotion && <Text style={styles.muted}>Promoción: {summary.promotion}</Text>}
        <Text style={styles.heading}>Resumen · {summary.totals.itemCount} {summary.totals.itemCount === 1 ? "artículo" : "artículos"}</Text>
        {summary.items.map(item => <View key={item.variantId} style={styles.row}><Text style={styles.item}>{item.quantity} × {item.name}</Text><Text style={styles.muted}>{money(item.unitPrice)} c/u</Text></View>)}
        <View style={styles.row}><Text style={styles.muted}>Subtotal</Text><Text style={styles.label}>{money(summary.totals.subtotal)}</Text></View>
        <View style={styles.row}><Text style={styles.muted}>Descuento</Text><Text style={styles.label}>−{money(summary.totals.discount)}</Text></View>
        <View style={styles.row}><Text style={styles.muted}>Envío</Text><Text style={styles.label}>{money(summary.totals.shipping)}</Text></View>
        <View style={styles.row}><Text style={styles.heading}>Total</Text><Text style={styles.title}>{money(summary.totals.total)}</Text></View>
        <Text style={styles.heading}>Mercado Pago</Text>
        <Text style={styles.muted}>Continúa en el navegador para elegir tu forma de pago. Al volver consultaremos el estado del pedido.</Text>
        {vm.loading && <ActivityIndicator color={colors.primary} />}
        {draft.prepared ? <Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.push({ pathname: "/checkout-status", params: { id: String(draft.prepared!.orderId) } })}>
          <Text style={styles.primaryLabel}>Consultar pedido #{draft.prepared.orderId}</Text></Pressable> :
          <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} style={[styles.primary, disabled && styles.disabled]} onPress={() => void pay()}>
            {vm.busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryLabel}>Continuar a Mercado Pago</Text>}</Pressable>}
        {draft.uncertain && !vm.busy && <View style={styles.form}><Text accessibilityRole="alert" style={styles.error}>No se repetirá el pedido automáticamente. Consulta tus pedidos o vuelve más tarde para verificar el estado.</Text><Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.push("/orders")}><Text style={styles.link}>Consultar mis pedidos</Text></Pressable></View>}
        <Pressable accessibilityRole="button" style={styles.secondary} disabled={vm.busy} onPress={() => router.push("/cart")}><Text style={styles.link}>Volver al carrito</Text></Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white }, content: { padding: spacing.xl, gap: 14, width: "100%", maxWidth: 600, alignSelf: "center", paddingBottom: 40 },
  title: { color: colors.text, fontSize: 25, fontWeight: "700" }, heading: { color: colors.text, fontSize: 18, fontWeight: "700", marginTop: 16 },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 22 }, label: { color: colors.text, fontSize: 15, fontWeight: "600" },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, minHeight: 52, padding: 14, gap: 6 }, selected: { borderColor: colors.primary, backgroundColor: colors.brandChipBg },
  form: { gap: 14 }, field: { gap: 8 }, input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, minHeight: 50, paddingHorizontal: 12, color: colors.text, backgroundColor: colors.white, fontSize: 16 },
  check: { minHeight: 48, justifyContent: "center" }, row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }, item: { flex: 1, color: colors.text, fontSize: 14 },
  primary: { minHeight: 54, backgroundColor: colors.primary, borderRadius: radius.md, padding: 14, alignItems: "center", justifyContent: "center", marginTop: 12 },
  primaryLabel: { color: colors.white, fontSize: 16, fontWeight: "700" }, secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" }, link: { color: colors.primary, fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.45 }, error: { color: colors.error, fontSize: 14, lineHeight: 22 },
});
