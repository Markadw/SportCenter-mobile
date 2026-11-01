import { act, renderHook, waitFor } from "@testing-library/react-native";
import { checkoutApi } from "../src/api/checkoutApi";
import { SessionRequestError } from "../src/features/auth/context/SessionController";
import { useCheckoutViewModel } from "../src/features/checkout/hooks/useCheckoutViewModel";
import { finishCheckoutDraft, getCheckoutDraft } from "../src/features/checkout/draft";
import type { CheckoutSummary } from "../src/features/checkout/types";
jest.mock("../src/api/checkoutApi", () => ({ checkoutApi: { summary: jest.fn(), confirm: jest.fn() } }));
jest.mock("expo-router", () => ({ useFocusEffect: (effect: () => void) => jest.requireActual("react").useEffect(effect, [effect]) }));
const summary = jest.mocked(checkoutApi.summary), confirm = jest.mocked(checkoutApi.confirm);
const fixture: CheckoutSummary = {
  items: [{ variantId: 12, productId: 7, name: "Balón", sku: "RED", quantity: 2, stock: 3, active: true, unitPrice: 270, image: null, attributes: {} }],
  addresses: [{ id: 8, alias: "", calle: "Norte", numero: "", colonia: "", ciudad: "Puebla", estado: "Puebla", codigo_postal: "72000", pais: "México", principal: false }],
  shippingMethods: [], selectedShipping: { id: 3, name: "Estándar", description: "", cost: 130, minDays: 2, maxDays: 5, active: true },
  promotion: null, totals: { subtotal: 540, discount: 0, shipping: 130, total: 670, itemCount: 2 },
};
beforeEach(() => { getCheckoutDraft(null); summary.mockResolvedValue(fixture); });

test("doble pulsación prepara una sola orden y conserva preferencia para reabrir sin POST", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof checkoutApi.confirm>>) => void;
  confirm.mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const { result } = await renderHook(() => useCheckoutViewModel("token", "double"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { result.current.change({ addressId: 8 }); });
  await act(async () => { void result.current.confirm(); void result.current.confirm(); });
  expect(confirm).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ orderId: 9, url: "https://www.mercadopago.com.mx/pay", total: 670 }); });
  expect(result.current.draft.prepared?.orderId).toBe(9);
  await act(async () => { await result.current.confirm(); });
  expect(confirm).toHaveBeenCalledTimes(1);
});
test("timeout o respuesta perdida conserva dirección y bloquea reintentos POST", async () => {
  confirm.mockRejectedValueOnce({ isAxiosError: true, code: "ECONNABORTED" });
  const { result } = await renderHook(() => useCheckoutViewModel("token", "uncertain"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { result.current.change({ addressId: 8, address: { ...result.current.draft.address, calle: "Norte" } }); });
  await act(async () => { await result.current.confirm(); await result.current.confirm(); });
  expect(result.current.draft.uncertain).toBe(true);
  expect(result.current.draft.address.calle).toBe("Norte");
  expect(result.current.error).toContain("No pudimos confirmar");
  expect(confirm).toHaveBeenCalledTimes(1);
});
test("rechazo definitivo permite corregir datos; falta stock impide crear orden", async () => {
  summary.mockResolvedValueOnce({ ...fixture, items: [{ ...fixture.items[0], stock: 1 }] });
  const { result } = await renderHook(() => useCheckoutViewModel("token", "stock"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { result.current.change({ addressId: 8 }); });
  await act(async () => { await result.current.confirm(); });
  expect(confirm).not.toHaveBeenCalled();
  expect(result.current.error).toContain("existencias");
});
test("desmontar cancela petición y una respuesta tardía no cambia otra cuenta", async () => {
  let signal: AbortSignal | undefined;
  summary.mockImplementationOnce((_token, _shipping, _promo, s) => { signal = s; return new Promise(() => {}); });
  const { unmount } = await renderHook(() => useCheckoutViewModel("token", "old"));
  await unmount();
  expect(signal?.aborted).toBe(true);
  expect(getCheckoutDraft("new").prepared).toBeNull();
});
test("recalcular envío no cambia dirección nueva elegida y aplica totales del servidor", async () => {
  const { result } = await renderHook(() => useCheckoutViewModel("token", "shipping"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { result.current.change({ addressId: null, address: { ...result.current.draft.address, calle: "Sur" } }); });
  summary.mockResolvedValueOnce({ ...fixture, totals: { ...fixture.totals, total: 600 } });
  await act(async () => { await result.current.recalculate(3, "CUPON"); });
  expect(result.current.draft.addressId).toBeNull();
  expect(result.current.draft.address.calle).toBe("Sur");
  expect(result.current.summary?.totals.total).toBe(600);
});


test("una respuesta terminal permite dos compras consecutivas dentro de la misma sesión", async () => {
  confirm.mockResolvedValueOnce({ orderId: 9, url: "https://www.mercadopago.com.mx/pay", total: 670 })
    .mockResolvedValueOnce({ orderId: 10, url: "https://www.mercadopago.com.mx/next", total: 800 });
  const first = await renderHook(() => useCheckoutViewModel("token", "same-session"));
  await waitFor(() => expect(first.result.current.loading).toBe(false));
  await act(() => first.result.current.change({ addressId: 8, promo: "USADO", appliedPromo: "USADO" }));
  await act(async () => { await first.result.current.confirm(); });
  expect(first.result.current.draft.prepared?.orderId).toBe(9);
  await act(() => { finishCheckoutDraft("same-session", { id: 9, state: "pendiente", total: 670, paid: true, stockIncident: false }); });
  expect(first.result.current.draft.prepared).toBeNull();
  expect(first.result.current.draft.promo).toBe("");
  await first.unmount();
  summary.mockResolvedValueOnce({ ...fixture, items: [{ ...fixture.items[0], variantId: 21, name: "Playera" }] });
  const second = await renderHook(() => useCheckoutViewModel("token", "same-session"));
  await waitFor(() => expect(second.result.current.loading).toBe(false));
  expect(second.result.current.summary?.items[0].variantId).toBe(21);
  expect(second.result.current.draft.addressId).toBe(8);
  await act(async () => { await second.result.current.confirm(); });
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(second.result.current.draft.prepared?.orderId).toBe(10);
});

test("renovar accessToken durante el POST conserva el POST, la dirección y la orden creada", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof checkoutApi.confirm>>) => void;
  let signal: AbortSignal | undefined, token = "old-token";
  confirm.mockImplementationOnce((_token, _payload, s) => { signal = s; return new Promise(r => { resolve = r; }); });
  const { result, rerender } = await renderHook(() => useCheckoutViewModel(token, "refresh-session"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.change({ addressId: 8 }));
  await act(() => { void result.current.confirm(); });
  token = "refreshed-token"; await rerender({});
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(signal?.aborted).toBe(false);
  expect(result.current.busy).toBe(true);
  expect(result.current.draft.addressId).toBe(8);
  await act(() => resolve({ orderId: 9, url: "https://www.mercadopago.com.mx/pay", total: 670 }));
  expect(result.current.busy).toBe(false);
  expect(result.current.draft.prepared?.orderId).toBe(9);
  expect(result.current.draft.uncertain).toBe(false);
  expect(confirm).toHaveBeenCalledTimes(1);
});

test("un resumen del token anterior no vuelve a habilitar una compra con totales obsoletos", async () => {
  let oldResolve!: (value: CheckoutSummary) => void, newResolve!: (value: CheckoutSummary) => void;
  let oldSignal: AbortSignal | undefined, token = "old-summary-token";
  summary.mockImplementationOnce((_token, _shipping, _promo, s) => { oldSignal = s; return new Promise(r => { oldResolve = r; }); })
    .mockImplementationOnce(() => new Promise(r => { newResolve = r; }));
  const { result, rerender } = await renderHook(() => useCheckoutViewModel(token, "summary-refresh"));
  token = "new-summary-token"; await rerender({});
  expect(oldSignal?.aborted).toBe(true);
  await act(() => oldResolve(fixture));
  expect(result.current.summary).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(() => { void result.current.confirm(); });
  expect(confirm).not.toHaveBeenCalled();
  await act(() => newResolve({ ...fixture, totals: { ...fixture.totals, total: 800 } }));
  expect(result.current.summary?.totals.total).toBe(800);
  expect(result.current.loading).toBe(false);
});

test("cambiar sessionId cancela el POST viejo y su finally no altera una confirmación de la cuenta nueva", async () => {
  let oldResolve!: (value: Awaited<ReturnType<typeof checkoutApi.confirm>>) => void;
  let newResolve!: (value: Awaited<ReturnType<typeof checkoutApi.confirm>>) => void;
  let oldSignal: AbortSignal | undefined, sessionId = "old-account", token = "old-account-token";
  confirm.mockImplementationOnce((_token, _payload, s) => { oldSignal = s; return new Promise(r => { oldResolve = r; }); })
    .mockImplementationOnce(() => new Promise(r => { newResolve = r; }));
  const { result, rerender } = await renderHook(() => useCheckoutViewModel(token, sessionId));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.change({ addressId: 8 }));
  await act(() => { void result.current.confirm(); });
  sessionId = "new-account"; token = "new-account-token"; await rerender({});
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(oldSignal?.aborted).toBe(true);
  expect(result.current.busy).toBe(false);
  expect(result.current.draft.addressId).toBeNull();
  expect(result.current.draft.uncertain).toBe(false);
  await act(() => result.current.change({ addressId: 8 }));
  await act(() => { void result.current.confirm(); });
  await act(() => oldResolve({ orderId: 9, url: "https://www.mercadopago.com.mx/old", total: 670 }));
  expect(result.current.busy).toBe(true);
  expect(result.current.draft.prepared).toBeNull();
  await act(() => newResolve({ orderId: 10, url: "https://www.mercadopago.com.mx/new", total: 670 }));
  expect(result.current.busy).toBe(false);
  expect(result.current.draft.prepared?.orderId).toBe(10);
});

test("desmontar durante confirmación conserva incertidumbre y permite volver sin busy permanente ni duplicar POST", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof checkoutApi.confirm>>) => void;
  let signal: AbortSignal | undefined;
  confirm.mockImplementationOnce((_token, _payload, s) => { signal = s; return new Promise(r => { resolve = r; }); });
  const first = await renderHook(() => useCheckoutViewModel("token", "cancelled-post"));
  await waitFor(() => expect(first.result.current.loading).toBe(false));
  await act(() => first.result.current.change({ addressId: 8 }));
  await act(() => { void first.result.current.confirm(); });
  await first.unmount();
  expect(signal?.aborted).toBe(true);
  expect(getCheckoutDraft("cancelled-post").uncertain).toBe(true);
  await act(() => resolve({ orderId: 9, url: "https://www.mercadopago.com.mx/late", total: 670 }));
  const second = await renderHook(() => useCheckoutViewModel("token", "cancelled-post"));
  await waitFor(() => expect(second.result.current.loading).toBe(false));
  expect(second.result.current.busy).toBe(false);
  expect(second.result.current.draft.uncertain).toBe(true);
  expect(second.result.current.draft.prepared).toBeNull();
  await act(async () => { await second.result.current.confirm(); });
  expect(confirm).toHaveBeenCalledTimes(1);
});

test("una confirmación incierta sin ID no se pierde al consultar otro pedido terminal", async () => {
  const { result } = await renderHook(() => useCheckoutViewModel("token", "unknown-order"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.change({ uncertain: true, prepared: null }));
  expect(finishCheckoutDraft("unknown-order", { id: 99, state: "pendiente", total: 670, paid: true, stockIncident: false })).toBe(false);
  expect(result.current.draft.uncertain).toBe(true);
});

test("SessionRequestError del transporte permite sólo un segundo envío manual tras renovar, sin tratarlo como pedido incierto", async () => {
  let reject!: (error: unknown) => void, token = "old-transport-token";
  confirm.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }))
    .mockResolvedValueOnce({ orderId: 11, url: "https://www.mercadopago.com.mx/pay", total: 670 });
  const { result, rerender } = await renderHook(() => useCheckoutViewModel(token, "transport-session"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.change({ addressId: 8 }));
  await act(() => { void result.current.confirm(); });
  token = "new-transport-token"; await rerender({});
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => reject(new SessionRequestError("Actualizamos tu sesión. Vuelve a enviar la operación para continuar.")));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(result.current.draft.uncertain).toBe(false);
  expect(result.current.draft.prepared).toBeNull();
  expect(result.current.draft.addressId).toBe(8);
  expect(result.current.busy).toBe(false);
  expect(result.current.error).toContain("Vuelve a enviar");
  await act(async () => { await result.current.confirm(); });
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(confirm).toHaveBeenNthCalledWith(2, "new-transport-token", expect.objectContaining({ id_direccion_envio: 8 }), expect.any(AbortSignal));
  expect(result.current.draft.prepared?.orderId).toBe(11);
});

test.each([408, 409, 429, 500])("HTTP %s conserva incertidumbre y bloquea un segundo envío incluso manual, sin replay automático", async status => {
  confirm.mockRejectedValueOnce({ isAxiosError: true, response: { status, data: { message: "internal-diagnostic-must-not-be-shown" } } });
  const { result } = await renderHook(() => useCheckoutViewModel("token", "ambiguous-http-" + status));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.change({ addressId: 8 }));
  await act(async () => { await result.current.confirm(); });
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(result.current.busy).toBe(false);
  expect(result.current.draft.uncertain).toBe(true);
  expect(result.current.draft.prepared).toBeNull();
  expect(result.current.error).toContain("No pudimos confirmar");
  expect(result.current.error).not.toContain("internal-diagnostic");
  await act(async () => { await result.current.confirm(); });
  expect(confirm).toHaveBeenCalledTimes(1);
});
test.each([400, 401, 403])("HTTP %s del contrato permite corregir y reenviar sólo por decisión manual", async status => {
  confirm.mockRejectedValueOnce({ isAxiosError: true, response: { status, data: { message: "internal-diagnostic-must-not-be-shown" } } })
    .mockResolvedValueOnce({ orderId: 12, url: "https://www.mercadopago.com.mx/pay", total: 670 });
  const { result } = await renderHook(() => useCheckoutViewModel("token", "definitive-http-" + status));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.change({ addressId: 8 }));
  await act(async () => { await result.current.confirm(); });
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(result.current.draft.uncertain).toBe(false);
  expect(result.current.error).not.toContain("internal-diagnostic");
  await act(async () => { await result.current.confirm(); });
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(result.current.draft.prepared?.orderId).toBe(12);
});
