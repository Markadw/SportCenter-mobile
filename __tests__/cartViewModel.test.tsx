import { act, renderHook, waitFor } from "@testing-library/react-native";
import { cartApi } from "../src/api/cartApi";
import { useAddToCart, useCartViewModel } from "../src/features/cart/hooks/useCartViewModel";
jest.mock("../src/api/cartApi", () => ({ cartApi: { get: jest.fn(), add: jest.fn(), update: jest.fn(), remove: jest.fn() } }));
jest.mock("expo-router", () => ({ useFocusEffect: (effect: () => void) => jest.requireActual("react").useEffect(effect, [effect]) }));
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
