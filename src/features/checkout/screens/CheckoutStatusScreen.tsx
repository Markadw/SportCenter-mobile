import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenState } from "../../../components/ScreenState";
import { colors, radius, spacing } from "../../../constants/theme";
import { useSession } from "../../auth/context/SessionContext";
import { money } from "../../products/presentation";
import { finishCheckoutDraft, getCheckoutDraft, readCheckoutDraft, subscribeCheckoutDraft } from "../draft";
import { useOrderStatus } from "../hooks/useOrderStatus";
import { openPayment } from "../payment";
import { paymentTitle } from "../presentation";

export function CheckoutStatusScreen() {
  const { session, sessionScopeId, isRestoring } = useSession(), router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = typeof params.id === "string" ? params.id : undefined;
  const id = rawId && /^\d+$/.test(rawId) ? Number(rawId) : 0;
  if (isRestoring) return <ScreenState title="Restaurando sesión" loading />;
  if (!session) {
    if (sessionScopeId) return <ScreenState title="Sesión temporalmente no disponible" message="Conservamos el estado de tu compra. Revisa tu conexión y vuelve a la app para consultar el pedido." action="Volver al catálogo" onAction={() => router.push("/catalog")} />;
    getCheckoutDraft(null); return <ScreenState title="Inicia sesión para consultar tu pedido" action="Iniciar sesión" onAction={() => router.push({ pathname: "/login", params: { returnTo: Number.isSafeInteger(id) && id > 0 ? "/checkout-status?id=" + id : "/cart" } })} />;
  }
  if (!Number.isSafeInteger(id) || id < 1) return <ScreenState title="Pedido no válido" action="Volver al carrito" onAction={() => router.replace("/cart")} />;
  return <AuthenticatedStatus key={`${session.sessionId}:${id}`} token={session.accessToken} sessionId={session.sessionId} id={id} />;
}
function AuthenticatedStatus({ token, sessionId, id }: { token: string; sessionId: string; id: number }) {
  const vm = useOrderStatus(token, id), router = useRouter();
  const snapshot = useCallback(() => readCheckoutDraft(sessionId), [sessionId]);
  const draft = useSyncExternalStore(subscribeCheckoutDraft, snapshot, snapshot);
  useEffect(() => { if (vm.status) finishCheckoutDraft(sessionId, vm.status); }, [sessionId, vm.status]);
  const prepared = draft.prepared?.orderId === id ? draft.prepared : null;
  const [opening, setOpening] = useState(false), [notice, setNotice] = useState<string | null>(null);
  const paid = vm.status?.paid && !vm.status.stockIncident;
  const alive = useRef(false), openingLock = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const open = async () => {
    if (openingLock.current || !prepared?.url) return;
    openingLock.current = true;
    setOpening(true); setNotice(null);
    try {
      await openPayment(prepared.url);
      if (alive.current) setNotice("El navegador se cerró o se abrió en otra ventana. Verifica el estado del pago.");
    } catch { if (alive.current) setNotice("No pudimos abrir Mercado Pago. Puedes volver a intentar con este mismo pedido."); }
    finally { openingLock.current = false; if (alive.current) { setOpening(false); void vm.refresh(); } }
  };
  return <SafeAreaView style={styles.root} edges={["bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>{paymentTitle(vm.status)}</Text>
    <Text style={styles.order}>Pedido #{id}</Text>
    <Text style={styles.muted}>{vm.status?.stockIncident ? "El servidor registró el pago con una incidencia de inventario. Revisa el seguimiento de tu pedido." :
      paid ? "El servidor confirmó el pago de tu pedido." : vm.status?.state === "reembolsado" ? "El servidor informa que este pago fue reembolsado." : vm.status && ["pago_cancelado", "pago_rechazado"].includes(vm.status.state) ? "El servidor informa que el pago no se completó. Consulta el estado antes de volver a intentar." : "El pago sigue pendiente de confirmación. Cerrar Mercado Pago o volver a la app no confirma ni cancela el pago."}</Text>
    {!!vm.status && <Text style={styles.muted}>Estado del pedido: {vm.status.state.replace(/_/g, " ")} · Total {money(vm.status.total)}</Text>}
    {vm.loading && <ActivityIndicator color={colors.primary} />}
    {!!vm.error && <Text accessibilityRole="alert" style={styles.error}>{vm.error}</Text>}
    {!!notice && <Text accessibilityRole="alert" style={styles.muted}>{notice}</Text>}
    <Pressable accessibilityRole="button" disabled={vm.loading} style={[styles.primary, vm.loading && styles.disabled]} onPress={() => void vm.refresh()}><Text style={styles.primaryLabel}>Consultar estado</Text></Pressable>
    {!paid && !vm.status?.stockIncident && !["reembolsado", "pago_cancelado", "pago_rechazado"].includes(vm.status?.state ?? "") && prepared?.url && <Pressable accessibilityRole="button" disabled={opening} style={[styles.secondary, opening && styles.disabled]} onPress={() => void open()}><Text style={styles.link}>{opening ? "Abriendo Mercado Pago…" : "Abrir Mercado Pago"}</Text></Pressable>}
    {!paid && !prepared?.url && <Text style={styles.muted}>El enlace de este pago no está disponible en este dispositivo. Consulta el estado antes de crear otro pedido.</Text>}
    <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.replace("/cart")}><Text style={styles.link}>Volver al carrito</Text></Pressable>
    <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => router.replace("/account")}><Text style={styles.link}>Mi cuenta</Text></Pressable>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white }, content: { width: "100%", maxWidth: 600, alignSelf: "center", padding: spacing.xl, gap: 20 },
  title: { color: colors.text, fontSize: 26, fontWeight: "700" }, order: { color: colors.primary, fontSize: 20, fontWeight: "600" }, muted: { color: colors.textMuted, fontSize: 16, lineHeight: 25 },
  error: { color: colors.error, fontSize: 14, lineHeight: 22 }, primary: { minHeight: 54, padding: 14, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  primaryLabel: { color: colors.white, fontSize: 16, fontWeight: "700" }, secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" }, link: { color: colors.primary, fontSize: 16, fontWeight: "600" }, disabled: { opacity: 0.45 },
});
