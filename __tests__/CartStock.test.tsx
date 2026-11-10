import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CartScreen } from "../src/features/cart/screens/CartScreen";
import { cartApi } from "../src/api/cartApi";
jest.mock("../src/api/cartApi", () => ({ cartApi: { get: jest.fn(), update: jest.fn(), remove: jest.fn(), add: jest.fn() } }));
jest.mock("lucide-react-native", () => ({ ChevronLeft: () => null, CircleArrowRight: () => null, Minus: () => null, Plus: () => null, Trash2: () => null }));
jest.mock("expo-router", () => ({ Stack: { Screen: () => null }, useRouter: () => ({ push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() }), useFocusEffect: (effect: () => void) => jest.requireActual("react").useEffect(effect, [effect]) }));
jest.mock("../src/features/auth/context/SessionContext", () => ({ useSession: () => ({ session: { sessionId: "stock-session", accessToken: "token" } }) }));
jest.mock("../src/components/ProductImage", () => ({ ProductImage: () => null }));
const item = { variantId: 12, productId: 7, name: "Balón", sku: "RED", quantity: 10, unitPrice: 270, stock: 3, active: true, image: null, attributes: {} };
it("permite corregir cantidad 10 a stock 3 sólo mediante una decisión explícita y sin eliminar el producto", async () => {
  jest.mocked(cartApi.get).mockResolvedValue({ id: 1, items: [item], subtotal: 2700, itemCount: 10 });
  jest.mocked(cartApi.update).mockResolvedValue({ id: 1, items: [{ ...item, quantity: 3 }], subtotal: 810, itemCount: 3 });
  await render(<CartScreen />);
  await waitFor(() => expect(screen.getByLabelText("Cantidad de Balón: 10")).toBeTruthy());
  expect(cartApi.update).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "Ajustar Balón a 3 unidades disponibles" }));
  await waitFor(() => expect(screen.getByLabelText("Cantidad de Balón: 3")).toBeTruthy());
  expect(cartApi.update).toHaveBeenCalledWith("token", 12, 3, expect.any(AbortSignal));
  expect(cartApi.remove).not.toHaveBeenCalled(); expect(cartApi.add).not.toHaveBeenCalled();
});
it("no propone un ajuste inválido a cero unidades cuando se agota el stock", async () => {
  jest.mocked(cartApi.get).mockResolvedValue({ id: 1, items: [{ ...item, stock: 0 }], subtotal: 2700, itemCount: 10 });
  await render(<CartScreen />);
  await waitFor(() => expect(screen.getByLabelText("Cantidad de Balón: 10")).toBeTruthy());
  expect(screen.queryByText(/Ajustar a/)).toBeNull();
  expect(screen.getByRole("button", { name: "Eliminar Balón" })).toBeTruthy();
});
