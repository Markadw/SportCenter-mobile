import { act, renderHook, waitFor } from "@testing-library/react-native";
import { cartApi } from "../src/api/cartApi";
import { useAddToCart, useCartViewModel } from "../src/features/cart/hooks/useCartViewModel";
jest.mock("../src/api/cartApi", () => ({ cartApi: { get: jest.fn(), add: jest.fn(), update: jest.fn(), remove: jest.fn() } }));
let mockCartFocus: (() => void) | null = null;
jest.mock("expo-router", () => ({ useFocusEffect: (effect: () => void) => jest.requireActual("react").useEffect(() => {
  mockCartFocus = effect; effect();
  return () => { mockCartFocus = null; };
}, [effect]) }));
beforeEach(() => {
  jest.mocked(cartApi.get).mockReset(); jest.mocked(cartApi.add).mockReset();
  jest.mocked(cartApi.update).mockReset(); jest.mocked(cartApi.remove).mockReset();
});
const fixture = { id: 1, items: [{ variantId: 12, productId: 7, name: "Balón", sku: "RED", quantity: 2, unitPrice: 270, stock: 3, active: true, image: null, attributes: {} }], subtotal: 540, itemCount: 2 };
test("agregar una variante bloquea dobles pulsaciones y conserva error para consultar carrito", async () => {
  let reject!: (error: unknown) => void;
  jest.mocked(cartApi.add).mockReturnValueOnce(new Promise((_resolve, r) => { reject = r; }));
  const { result } = await renderHook(() => useAddToCart("token"));
  await act(async () => { void result.current.add(12, 2); void result.current.add(12, 2); });
  expect(cartApi.add).toHaveBeenCalledTimes(1);
  await act(async () => { reject({ isAxiosError: true }); });
  expect(result.current.busy).toBe(false);
  expect(result.current.result?.error).toBe(true);
});
test("cambio de token cancela una adición pendiente sin mostrar resultado en otra cuenta", async () => {
  let signal: AbortSignal | undefined;
  jest.mocked(cartApi.add).mockImplementationOnce((_token, _id, _qty, s) => { signal = s; return new Promise(() => {}); });
  let token = "old";
  const { result, rerender } = await renderHook(() => useAddToCart(token));
  await act(async () => { void result.current.add(12, 1); });
  token = "new"; await rerender({});
  expect(signal?.aborted).toBe(true);
  expect(result.current.result).toBeNull();
  expect(result.current.busy).toBe(false);
});
test("actualizar usa total retornado, error no borra carrito y eliminar aplica respuesta vacía", async () => {
  jest.mocked(cartApi.get).mockResolvedValueOnce(fixture);
  jest.mocked(cartApi.update).mockResolvedValueOnce({ ...fixture, items: [{ ...fixture.items[0], quantity: 3, unitPrice: 280 }], subtotal: 840, itemCount: 3 });
  jest.mocked(cartApi.remove).mockRejectedValueOnce({ isAxiosError: true }).mockResolvedValueOnce({ id: 1, items: [], subtotal: 0, itemCount: 0 });
  const { result } = await renderHook(() => useCartViewModel("token"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => { await result.current.update(12, 3); });
  expect(result.current.cart?.subtotal).toBe(840);
  await act(async () => { await result.current.remove(12); });
  expect(result.current.cart?.items).toHaveLength(1);
  expect(result.current.error).toContain("conectar");
  await act(async () => { await result.current.remove(12); });
  expect(result.current.cart?.items).toHaveLength(0);
});



test("renovar token de la misma sesión conserva un único POST aditivo y su confirmación", async () => {
  let finish!: (value: typeof fixture) => void, signal: AbortSignal | undefined, token = "old-add-token";
  jest.mocked(cartApi.add).mockImplementationOnce((_token, _variant, _quantity, s) => { signal = s; return new Promise(resolve => { finish = resolve; }); });
  const { result, rerender } = await renderHook(() => useAddToCart(token, "stable-add-session"));
  await act(() => { void result.current.add(12, 2); });
  token = "refreshed-add-token"; await rerender({});
  expect(signal?.aborted).toBe(false); expect(result.current.busy).toBe(true);
  await act(() => { void result.current.add(12, 2); });
  expect(cartApi.add).toHaveBeenCalledTimes(1);
  await act(() => finish(fixture));
  expect(result.current.busy).toBe(false);
  expect(result.current.result).toEqual(expect.objectContaining({ message: "Agregado al carrito.", error: false }));
});
test("cambiar cuenta aborta la adición anterior y su respuesta tardía no afecta la nueva", async () => {
  let oldFinish!: (value: typeof fixture) => void, newFinish!: (value: typeof fixture) => void, oldSignal: AbortSignal | undefined;
  let token = "old-account-token", sessionId = "old-add-account";
  jest.mocked(cartApi.add).mockImplementationOnce((_token, _variant, _quantity, s) => { oldSignal = s; return new Promise(resolve => { oldFinish = resolve; }); })
    .mockImplementationOnce(() => new Promise(resolve => { newFinish = resolve; }));
  const { result, rerender } = await renderHook(() => useAddToCart(token, sessionId));
  await act(() => { void result.current.add(12, 1); });
  token = "new-account-token"; sessionId = "new-add-account"; await rerender({});
  expect(oldSignal?.aborted).toBe(true); expect(result.current.busy).toBe(false); expect(result.current.result).toBeNull();
  await act(() => { void result.current.add(12, 1); });
  await act(() => oldFinish(fixture));
  expect(result.current.busy).toBe(true); expect(result.current.result).toBeNull();
  await act(() => newFinish(fixture));
  expect(result.current.busy).toBe(false); expect(result.current.result?.error).toBe(false);
  expect(cartApi.add).toHaveBeenCalledTimes(2);
});

test("volver durante un PUT demorado relee el carrito después de una adición confirmada desde detalle", async () => {
  const snapshot = (quantity: number) => ({ ...fixture, items: [{ ...fixture.items[0], quantity }], subtotal: quantity * 270, itemCount: quantity });
  let server = snapshot(1), generatedUpdate = snapshot(1), finishUpdate!: (value: typeof fixture) => void;
  jest.mocked(cartApi.get).mockImplementation(async () => snapshot(server.itemCount));
  jest.mocked(cartApi.update).mockImplementation((_token, _id, quantity) => {
    server = snapshot(quantity); generatedUpdate = snapshot(server.itemCount);
    return new Promise(resolve => { finishUpdate = resolve; });
  });
  jest.mocked(cartApi.add).mockImplementation(async (_token, _id, quantity) => {
    server = snapshot(server.itemCount + quantity); return snapshot(server.itemCount);
  });
  const cart = await renderHook(() => useCartViewModel("token"));
  const detail = await renderHook(() => useAddToCart("token", "session"));
  await waitFor(() => expect(cart.result.current.cart?.itemCount).toBe(1));
  await act(() => { void cart.result.current.update(12, 2); });
  await act(async () => { await detail.result.current.add(12, 1); });
  expect(detail.result.current.result?.message).toBe("Agregado al carrito.");
  await act(() => { expect(mockCartFocus).not.toBeNull(); mockCartFocus?.(); });
  // El PUT ya generó su snapshot antes de la adición; sólo se demora su entrega.
  await act(() => { finishUpdate(generatedUpdate); });
  await waitFor(() => expect(cart.result.current.cart?.itemCount).toBe(server.itemCount));
  expect(cart.result.current.cart?.subtotal).toBe(810);
  expect(cartApi.get).toHaveBeenCalledTimes(2); expect(cartApi.update).toHaveBeenCalledTimes(1);
  expect(cartApi.add).toHaveBeenCalledTimes(1); expect(cartApi.remove).not.toHaveBeenCalled();
});

test("varias recargas pendientes se agrupan y tras un GET fallido usan el token renovado sin bucle", async () => {
  let token = "old-token", rejectRead!: (cause: unknown) => void;
  jest.mocked(cartApi.get).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRead = reject; })).mockResolvedValueOnce(fixture);
  const { result, rerender } = await renderHook(() => useCartViewModel(token));
  await waitFor(() => expect(cartApi.get).toHaveBeenCalledTimes(1));
  token = "new-token"; await rerender({});
  await act(() => { void result.current.reload(); void result.current.reload(); mockCartFocus?.(); });
  expect(cartApi.get).toHaveBeenCalledTimes(1);
  await act(() => { rejectRead({ isAxiosError: true }); });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.cart).toEqual(fixture); expect(result.current.error).toBeNull();
  expect(cartApi.get).toHaveBeenCalledTimes(2);
  expect(cartApi.get).toHaveBeenLastCalledWith("new-token", expect.any(AbortSignal));
  expect(cartApi.update).not.toHaveBeenCalled(); expect(cartApi.remove).not.toHaveBeenCalled();
});

test("fallar una mutación no pierde la lectura solicitada ni duplica el retiro", async () => {
  let rejectRemove!: (cause: unknown) => void;
  jest.mocked(cartApi.get).mockResolvedValue(fixture);
  jest.mocked(cartApi.remove).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRemove = reject; }));
  const { result } = await renderHook(() => useCartViewModel("token"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => { void result.current.remove(12); void result.current.remove(12); void result.current.reload(); void result.current.reload(); });
  expect(cartApi.remove).toHaveBeenCalledTimes(1); expect(cartApi.get).toHaveBeenCalledTimes(1);
  await act(() => { rejectRemove({ isAxiosError: true }); });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.busy).toBe(false); expect(result.current.cart).toEqual(fixture);
  expect(cartApi.get).toHaveBeenCalledTimes(2); expect(cartApi.remove).toHaveBeenCalledTimes(1);
});

test("desmontar al cambiar de cuenta aborta la petición y descarta su recarga y respuesta tardía", async () => {
  let finishUpdate!: (value: typeof fixture) => void, signal: AbortSignal | undefined;
  const other = { ...fixture, items: [], subtotal: 0, itemCount: 0 };
  jest.mocked(cartApi.get).mockResolvedValueOnce(fixture).mockResolvedValueOnce(other);
  jest.mocked(cartApi.update).mockImplementationOnce((_token, _id, _quantity, currentSignal) => {
    signal = currentSignal; return new Promise(resolve => { finishUpdate = resolve; });
  });
  const old = await renderHook(() => useCartViewModel("old-account"));
  await waitFor(() => expect(old.result.current.loading).toBe(false));
  await act(() => { void old.result.current.update(12, 3); void old.result.current.reload(); });
  await old.unmount(); expect(signal?.aborted).toBe(true);
  // CartScreen usa key=sessionId; la cuenta nueva tiene un montaje independiente.
  const next = await renderHook(() => useCartViewModel("new-account"));
  await waitFor(() => expect(next.result.current.cart).toEqual(other));
  await act(() => { finishUpdate({ ...fixture, items: [{ ...fixture.items[0], quantity: 3 }], subtotal: 810, itemCount: 3 }); });
  expect(next.result.current.cart).toEqual(other); expect(next.result.current.error).toBeNull();
  expect(cartApi.get).toHaveBeenCalledTimes(2); expect(cartApi.update).toHaveBeenCalledTimes(1);
  expect(cartApi.get).toHaveBeenLastCalledWith("new-account", expect.any(AbortSignal));
});
