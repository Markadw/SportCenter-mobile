import { render, screen, waitFor } from "@testing-library/react-native";
import { CheckoutStatusScreen } from "../src/features/checkout/screens/CheckoutStatusScreen";
import { getCheckoutDraft, saveCheckoutDraft } from "../src/features/checkout/draft";
import { useOrderStatus } from "../src/features/checkout/hooks/useOrderStatus";
import type { OrderStatus } from "../src/features/checkout/types";
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({ id: "9" }), useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("../src/features/auth/context/SessionContext", () => ({ useSession: () => ({ session: { sessionId: "status-session", accessToken: "token" } }) }));
jest.mock("../src/features/checkout/hooks/useOrderStatus", () => ({ useOrderStatus: jest.fn() }));
jest.mock("../src/features/checkout/payment", () => ({ openPayment: jest.fn() }));
const pending: OrderStatus = { id: 9, state: "pendiente_pago", total: 670, paid: false, stockIncident: false };
beforeEach(() => {
  getCheckoutDraft(null);
  const draft = getCheckoutDraft("status-session");
  saveCheckoutDraft("status-session", { ...draft, addressId: 8, prepared: { orderId: 9, url: "https://www.mercadopago.com.mx/pay", total: 670 } });
});
it("conserva la preferencia pendiente para reabrirla sin crear otra orden", async () => {
  jest.mocked(useOrderStatus).mockReturnValue({ status: pending, loading: false, error: null, refresh: jest.fn() });
  await render(<CheckoutStatusScreen />);
  expect(getCheckoutDraft("status-session").prepared?.orderId).toBe(9);
  expect(screen.getByText("Abrir Mercado Pago")).toBeTruthy();
});
it.each([
  { ...pending, state: "pendiente", paid: true },
  { ...pending, state: "pago_rechazado" },
  { ...pending, state: "pago_cancelado" },
  { ...pending, state: "reembolsado" },
  { ...pending, state: "incidencia_stock", paid: true, stockIncident: true },
])("libera sólo el draft conocido tras estado terminal confirmado: $state", async status => {
  jest.mocked(useOrderStatus).mockReturnValue({ status, loading: false, error: null, refresh: jest.fn() });
  await render(<CheckoutStatusScreen />);
  await waitFor(() => expect(getCheckoutDraft("status-session").prepared).toBeNull());
  expect(getCheckoutDraft("status-session").addressId).toBe(8);
  expect(screen.queryByText("Abrir Mercado Pago")).toBeNull();
});
it("no elimina un registro incierto sin ID al mostrar un pedido anterior pagado", async () => {
  saveCheckoutDraft("status-session", { ...getCheckoutDraft("status-session"), prepared: null, uncertain: true });
  jest.mocked(useOrderStatus).mockReturnValue({ status: { ...pending, state: "pendiente", paid: true }, loading: false, error: null, refresh: jest.fn() });
  await render(<CheckoutStatusScreen />);
  expect(getCheckoutDraft("status-session").uncertain).toBe(true);
});
