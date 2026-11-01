import { render, screen, waitFor } from "@testing-library/react-native";
import { CartScreen } from "../src/features/cart/screens/CartScreen";
import { CheckoutScreen } from "../src/features/checkout/screens/CheckoutScreen";
import { CheckoutStatusScreen } from "../src/features/checkout/screens/CheckoutStatusScreen";
import { useCartViewModel } from "../src/features/cart/hooks/useCartViewModel";
import { useCheckoutViewModel } from "../src/features/checkout/hooks/useCheckoutViewModel";
import { useOrderStatus } from "../src/features/checkout/hooks/useOrderStatus";
import { getCheckoutDraft, readCheckoutDraft, saveCheckoutDraft } from "../src/features/checkout/draft";
import { AxiosError } from "axios";
import { SessionController, SessionRequestError } from "../src/features/auth/context/SessionController";
const session = { accessToken: "token", refreshToken: "refresh", sessionId: "routing-session", expiresAt: 9999999999999 };
let mockAuth: { session: typeof session | null; sessionScopeId?: string | null; isRestoring: boolean } = { session, isRestoring: false };
let mockParams: { id?: string | string[] } = { id: "9" };
jest.mock("expo-router", () => ({ useLocalSearchParams: () => mockParams, useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock("../src/features/auth/context/SessionContext", () => ({ useSession: () => mockAuth }));
jest.mock("../src/features/cart/hooks/useCartViewModel", () => ({ useCartViewModel: jest.fn() }));
jest.mock("../src/features/checkout/hooks/useCheckoutViewModel", () => ({ useCheckoutViewModel: jest.fn() }));
jest.mock("../src/features/checkout/hooks/useOrderStatus", () => ({ useOrderStatus: jest.fn() }));
jest.mock("../src/features/checkout/payment", () => ({ openPayment: jest.fn() }));
beforeEach(() => { mockAuth = { session, isRestoring: false }; mockParams = { id: "9" }; });
it.each([["9"], ["9", "10"]])("rechaza parámetros de pedido ambiguos en array %# sin consultar pagos", async (...ids) => {
  mockParams = { id: ids };
  await render(<CheckoutStatusScreen />);
  expect(screen.getByText("Pedido no válido")).toBeTruthy();
  expect(useOrderStatus).not.toHaveBeenCalled();
});
for (const Screen of [CartScreen, CheckoutScreen, CheckoutStatusScreen]) {
  it("espera restauración de sesión antes de mostrar login o iniciar solicitudes: " + Screen.name, async () => {
    mockAuth = { session: null, isRestoring: true };
    await render(<Screen />);
    expect(screen.getByText("Restaurando sesión")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Iniciar sesión" })).toBeNull();
    expect(useCartViewModel).not.toHaveBeenCalled(); expect(useCheckoutViewModel).not.toHaveBeenCalled(); expect(useOrderStatus).not.toHaveBeenCalled();
  });
}
it("la espera de restauración no borra un draft incierto existente", async () => {
  const draft = getCheckoutDraft("preserve-restoring");
  saveCheckoutDraft("preserve-restoring", { ...draft, uncertain: true });
  mockAuth = { session: null, isRestoring: true };
  await render(<CheckoutScreen />);
  expect(readCheckoutDraft("preserve-restoring").uncertain).toBe(true);
});

for (const Screen of [CartScreen, CheckoutScreen, CheckoutStatusScreen]) {
  it("un ámbito recuperable no concede acceso privado durante una caída de red: " + Screen.name, async () => {
    const draft = getCheckoutDraft(session.sessionId);
    saveCheckoutDraft(session.sessionId, { ...draft, uncertain: true });
    mockAuth = { session: null, sessionScopeId: session.sessionId, isRestoring: false };
    await render(<Screen />);
    expect(screen.getByText("Sesión temporalmente no disponible")).toBeTruthy();
    expect(readCheckoutDraft(session.sessionId).uncertain).toBe(true);
    expect(useCartViewModel).not.toHaveBeenCalled(); expect(useCheckoutViewModel).not.toHaveBeenCalled(); expect(useOrderStatus).not.toHaveBeenCalled();
  });
}
it.each(["uncertain", "prepared"])("controlador y checkout conservan %s durante fallo transitorio, recuperan la misma sesión y borran al cerrar realmente", async mode => {
  let now = 1000;
  const original = { ...session, expiresAt: 2000 };
  const renewed = { ...session, accessToken: "renewed-token", refreshToken: "renewed-refresh", expiresAt: 900000 };
  const api = { login: jest.fn().mockResolvedValue(original), refresh: jest.fn().mockResolvedValue(renewed), logout: jest.fn().mockResolvedValue(undefined) };
  const controller = new SessionController({ api, now: () => now, storage: {
    read: jest.fn().mockResolvedValue(null), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined),
  } });
  controller.activate(); await waitFor(() => expect(controller.getSnapshot().isRestoring).toBe(false));
  await controller.signIn({ email: "cliente@example.test", passw: "clave-de-prueba" }, new AbortController().signal);
  const draft = getCheckoutDraft(session.sessionId);
  const prepared = mode === "prepared" ? { orderId: 9, url: "https://www.mercadopago.com.mx/pay", total: 670 } : null;
  saveCheckoutDraft(session.sessionId, { ...draft, prepared, uncertain: mode === "uncertain" });
  api.refresh.mockRejectedValueOnce(new AxiosError("sin red", "ERR_NETWORK"));
  now = original.expiresAt;
  await expect(controller.refreshIfNeeded()).rejects.toBeInstanceOf(SessionRequestError);
  mockAuth = controller.getSnapshot();
  const view = await render(<CheckoutScreen />);
  expect(useCheckoutViewModel).not.toHaveBeenCalled();
  expect(readCheckoutDraft(session.sessionId)).toEqual(expect.objectContaining({ prepared, uncertain: mode === "uncertain" }));
  await controller.refreshIfNeeded();
  mockAuth = controller.getSnapshot();
  jest.mocked(useCheckoutViewModel).mockReturnValue({
    draft: readCheckoutDraft(session.sessionId), summary: null, loading: true, busy: false, error: null,
    change: jest.fn(), recalculate: jest.fn().mockResolvedValue(undefined), confirm: jest.fn().mockResolvedValue(null),
  });
  await view.rerender(<CheckoutScreen />);
  expect(useCheckoutViewModel).toHaveBeenCalledWith("renewed-token", session.sessionId);
  expect(readCheckoutDraft(session.sessionId)).toEqual(expect.objectContaining({ prepared, uncertain: mode === "uncertain" }));
  await controller.signOut(); mockAuth = controller.getSnapshot();
  await view.rerender(<CheckoutScreen />);
  expect(readCheckoutDraft(session.sessionId)).toEqual(expect.objectContaining({ prepared: null, uncertain: false }));
  await view.unmount(); controller.dispose();
});
