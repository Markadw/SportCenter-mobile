import { useRouter } from "expo-router";
import { ScreenState } from "../../components/ScreenState";

// Destino técnico de la pestaña Carrito. La pestaña intercepta el toque y abre /cart;
// esta vista sólo aparece si se llega aquí por otra vía y no reemplaza la pila.
export default function CartShortcut() {
  const router = useRouter();
  return <ScreenState appearance="storefront" title="Tu carrito" action="Abrir carrito" onAction={() => router.navigate("/cart")} />;
}
