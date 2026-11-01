import { Link, Redirect, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSession } from "../../auth/context/SessionContext";
import { useOrderDetailViewModel } from "../hooks/useOrdersViewModel";
import { OrderState } from "../components/OrderState";
import { Form, FormButton } from "../../registration/components/Form";
import { ScreenState } from "../../../components/ScreenState";
import { date, money, orderStatus } from "../presentation";
import { colors, fontSize, radius, spacing } from "../../../constants/theme";
export function OrderDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>(), id = typeof params.id === "string" ? params.id : "";
  const auth = useSession(), { session } = auth, model = useOrderDetailViewModel(id, session?.accessToken);
  if ("isRestoring" in auth && auth.isRestoring === true) return <ScreenState title="Restaurando sesión" loading />;
  if (!session) return <Redirect href="/login" />;
  if (!model.valid) return <ScreenState title="Pedido no disponible" message="Revisa el identificador del pedido." />;
  if (!model.data) return <OrderState {...model} />;
  const { order, tracking } = model.data;
  return <Form title={"Pedido #" + order.id} description={"Creado el " + date(order.createdAt)}>
    <Text style={styles.status}>Estado: {orderStatus(tracking.status)}</Text>
    <Text style={styles.total}>{money(tracking.total)}</Text>
    <Text style={styles.heading}>Productos</Text>
    {order.items.map(item => <View key={item.variantId} style={styles.card}>
      <Text style={styles.heading}>{item.name}</Text>
      <Text style={styles.text}>{item.quantity} × {money(item.unitPrice)} · {money(item.total)}</Text>
      {item.productId && <Link href={{ pathname: "/product/[id]", params: { id: String(item.productId) } }} style={styles.link}>Ver producto</Link>}
      {item.productId && <Link href={{ pathname: "/reviews/[id]", params: { id: String(item.productId) } }} style={styles.link}>Ver reseñas y elegibilidad</Link>}
    </View>)}
    <Text style={styles.heading}>Seguimiento</Text>
    <Text style={styles.text}>{tracking.shipmentStatus ? orderStatus(tracking.shipmentStatus) : "Sin envío registrado"}</Text>
    {!!tracking.carrier && <Text style={styles.text}>Paquetería: {tracking.carrier}</Text>}
    {!!tracking.trackingNumber && <Text selectable style={styles.text}>Guía: {tracking.trackingNumber}</Text>}
    {!!tracking.estimatedAt && <Text style={styles.text}>Entrega estimada: {date(tracking.estimatedAt)}</Text>}
    {!!tracking.shippedAt && <Text style={styles.text}>Enviado: {date(tracking.shippedAt)}</Text>}
    {!!tracking.deliveredAt && <Text style={styles.text}>Entregado: {date(tracking.deliveredAt)}</Text>}
    {!!tracking.address && <Text style={styles.text}>Dirección: {tracking.address}</Text>}
    {tracking.events.length === 0 && <Text style={styles.muted}>Aún no hay eventos de seguimiento.</Text>}
    {tracking.events.map((event, index) => <View key={index} style={styles.card}>
      <Text style={styles.heading}>{event.title}</Text><Text style={styles.text}>{event.description}</Text>
      <Text style={styles.muted}>{orderStatus(event.status)} · {date(event.date)}{event.location ? " · " + event.location : ""}</Text>
    </View>)}
    <FormButton label="Actualizar seguimiento" onPress={model.retry} secondary />
    <Link href="/orders" style={styles.link}>Volver a mis pedidos</Link>
  </Form>;
}
const styles = StyleSheet.create({
  status: { color: colors.primary, fontSize: fontSize.lg, fontWeight: "700" }, total: { color: colors.text, fontSize: fontSize.xl, fontWeight: "700" },
  heading: { color: colors.text, fontSize: fontSize.md, fontWeight: "700" }, text: { color: colors.text, fontSize: fontSize.md, lineHeight: 23 },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 }, card: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.lightBg, gap: spacing.sm },
  link: { color: colors.secondary, fontSize: fontSize.md, paddingVertical: spacing.md },
});
