import * as WebBrowser from "expo-web-browser";
import { safePaymentUrl } from "./contracts";
export async function openPayment(url: string) {
  const safe = safePaymentUrl(url);
  if (!safe) throw new Error("El servidor no proporcionó un enlace de pago seguro.");
  return WebBrowser.openBrowserAsync(safe);
}
