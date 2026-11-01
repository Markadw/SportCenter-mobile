import * as WebBrowser from "expo-web-browser";
import { openPayment } from "../src/features/checkout/payment";
import { paymentTitle } from "../src/features/checkout/presentation";
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn(), WebBrowserResultType: { CANCEL: "cancel" } }));
test("cancelar navegador no constituye confirmación de pago", async () => {
  jest.mocked(WebBrowser.openBrowserAsync).mockResolvedValueOnce({ type: WebBrowser.WebBrowserResultType.CANCEL });
  await openPayment("https://www.mercadopago.com.mx/pay");
  expect(paymentTitle(null)).toBe("Verifica tu pago");
  expect(paymentTitle({ id: 9, state: "pendiente_pago", total: 670, paid: false, stockIncident: false })).toBe("Verifica tu pago");
});
test("success URL no se consume como estado y enlaces ajenos no abren el navegador", async () => {
  await expect(openPayment("https://evil.test/?status=approved")).rejects.toThrow();
  expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  expect(paymentTitle({ id: 9, state: "pendiente", total: 670, paid: true, stockIncident: false })).toBe("Pago confirmado");
  expect(paymentTitle({ id: 9, state: "incidencia_stock", total: 670, paid: true, stockIncident: true })).toContain("incidencia");
});
