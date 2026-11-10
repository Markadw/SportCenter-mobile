import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ExpoRoot, router } from "expo-router";
import { getMockContext } from "expo-router/testing-library";
import { store } from "expo-router/build/global-state/router-store";
import axiosClient from "../../src/api/axios";
import { getCheckoutDraft } from "../../src/features/checkout/draft";
import { loginCredentials } from "../../__tests__/fixtures/auth";
import { createJourneyTransport } from "./fixtures/mobileJourney";

// Estos módulos sólo bloquean conexiones del proceso Jest; no forman parte de la app.
type NodeTransport = { request: (...args: unknown[]) => unknown };
const http = jest.requireActual<NodeTransport>("node:http");
const https = jest.requireActual<NodeTransport>("node:https");

// Límites nativos: no hay Keychain/Keystore, ventana ni splash del SO en Jest.
const mockSecureValues = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockSecureValues.set(key, value); }),
  deleteItemAsync: jest.fn(async (key: string) => { mockSecureValues.delete(key); }),
}));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("expo-splash-screen", () => ({ preventAutoHideAsync: jest.fn(async () => {}), hideAsync: jest.fn(async () => {}) }));
// El paquete de iconos publica ESM/SVG; los pictogramas no intervienen en el recorrido.
jest.mock("lucide-react-native", () => Object.fromEntries([
  "Home", "Search", "User", "ShoppingBag", "ChevronRight", "SlidersHorizontal", "Share2", "ChevronDown", "ChevronUp", "X",
  "Activity", "Bike", "CircleDot", "Dumbbell", "Trophy", "Zap", "Eye", "EyeOff",
  "Menu", "ChevronLeft", "ArrowUpDown", "Star", "Minus", "Plus",
  "Trash2", "CircleArrowRight",
  "ExternalLink", "Check", "MapPin",
  "FileText", "Mail", "LockKeyhole", "LogIn", "ArrowRight", "ShieldCheck", "LogOut", "Package", "ChevronLeft",
].map(name => [name, () => null])));

const originalAdapter = axiosClient.defaults.adapter;
afterEach(async () => {
  await cleanup();
  axiosClient.defaults.adapter = originalAdapter;
  mockSecureValues.clear(); getCheckoutDraft(null);
  jest.restoreAllMocks(); jest.useRealTimers();
});

test("QA001: rutas reales conectan catálogo, sesión, carrito, resumen, pedidos previos y reseñas sin pago", async () => {
  const transport = createJourneyTransport(); axiosClient.defaults.adapter = transport.adapter;
  const external: string[] = [];
  jest.spyOn(globalThis, "fetch").mockImplementation(async () => { external.push("fetch"); throw new Error("Red externa prohibida"); });
  if (typeof XMLHttpRequest !== "undefined") jest.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(() => { external.push("xhr"); throw new Error("Red externa prohibida"); });
  for (const [name, module] of [["http", http], ["https", https]] as const) jest.spyOn(module, "request").mockImplementation(() => {
    external.push(name); throw new Error("Red externa prohibida");
  });
  jest.spyOn(console, "info").mockImplementation(() => {});
  // SDK57 renderRouter no espera RNTL14. Se monta su ExpoRoot real con render asíncrono.
  await render(<ExpoRoot context={getMockContext("src/app")} location="/" />);
  const path = () => store.getRouteInfo().pathname;
  await fireEvent.press(await screen.findByText("Ver todos"));
  await waitFor(() => expect(path()).toBe("/catalog"));
  await fireEvent.press(await screen.findByRole("button", { name: "Balón de fútbol" }));
  await waitFor(() => expect(path()).toBe("/product/7"));
  await fireEvent.press(await screen.findByRole("button", { name: "Iniciar sesión para agregar" }));
  await waitFor(() => expect(path()).toBe("/login"));
  expect(store.getRouteInfo().params.returnTo).toBe("/product/7");
  await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), loginCredentials.email);
  await fireEvent.changeText(screen.getByLabelText("Contraseña"), loginCredentials.passw);
  await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));
  await waitFor(() => expect(path()).toBe("/product/7"));
  expect(mockSecureValues.size).toBeGreaterThan(0);
  await fireEvent.press(await screen.findByRole("radio", { name: "Color: Rojo" }));
  await fireEvent.press(screen.getByRole("button", { name: "Agregar al carrito" }));
  await fireEvent.press(await screen.findByRole("button", { name: "Ver carrito" }));
  await waitFor(() => expect(path()).toBe("/cart"));
  await fireEvent.press(await screen.findByRole("button", { name: "Agregar una unidad de Balón de fútbol" }));
  await screen.findByLabelText("Cantidad de Balón de fútbol: 2");
  await fireEvent.press(screen.getByRole("button", { name: "Continuar compra" }));
  await waitFor(() => expect(path()).toBe("/checkout"));
  await fireEvent.press(await screen.findByRole("radio", { name: /Casa QA/ }));
  expect(screen.getByRole("radio", { name: /Casa QA/ }).props.accessibilityState.checked).toBe(true);
  const summaries = () => transport.calls.filter(call => call.url === "/products/checkout/summary");
  const summariesBeforeShipping = summaries().length;
  expect(screen.getByText("$610.00")).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: /Express QA/ }));
  await waitFor(() => expect(summaries()).toHaveLength(summariesBeforeShipping + 1));
  await waitFor(() => expect(screen.getByRole("radio", { name: /Casa QA/ }).props.accessibilityState).toEqual({ checked: true, disabled: false }));
  expect(summaries().at(-1)?.params).toEqual({ id_metodo_envio: 302 });
  expect(screen.getByRole("radio", { name: /Express QA/ }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByText("Resumen · 2 artículos")).toBeTruthy();
  expect(screen.getByText("$630.00")).toBeTruthy();
  expect(transport.calls.some(call => call.url === "/products/checkout/confirm")).toBe(false);
  await fireEvent.press(screen.getByRole("button", { name: "Volver al carrito" }));
  await waitFor(() => expect(path()).toBe("/cart"));
  const summariesBeforeReturn = summaries().length;
  await fireEvent.press(await screen.findByRole("button", { name: "Continuar compra" }));
  await waitFor(() => expect(path()).toBe("/checkout"));
  await waitFor(() => expect(summaries()).toHaveLength(summariesBeforeReturn + 1));
  await waitFor(() => expect(screen.getByRole("radio", { name: /Casa QA/ }).props.accessibilityState).toEqual({ checked: true, disabled: false }));
  expect(summaries().at(-1)?.params).toEqual({ id_metodo_envio: 302 });
  expect(screen.getByRole("radio", { name: /Express QA/ }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByText("$630.00")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Volver al carrito" }));
  await act(async () => { router.push("/account"); });
  await fireEvent.press(await screen.findByRole("button", { name: "Mi perfil" }));
  await waitFor(() => expect(path()).toBe("/profile"));
  expect((await screen.findByLabelText("Nombre")).props.value).toBe("Cliente QA");
  expect(screen.getByLabelText("Correo").props.value).toBe(loginCredentials.email);
  await act(async () => { router.back(); });
  await waitFor(() => expect(path()).toBe("/account"));
  await fireEvent.press(await screen.findByRole("button", { name: "Mis pedidos" }));
  await fireEvent.press(await screen.findByRole("button", { name: "Ver pedido 901" }));
  await screen.findByText("Entrega sintética anterior");
  await fireEvent.press(screen.getByText("Ver reseñas y elegibilidad"));
  await waitFor(() => expect(path()).toBe("/reviews/7"));
  await fireEvent.press(await screen.findByRole("button", { name: "5 de 5 estrellas" }));
  await fireEvent.changeText(screen.getByLabelText("Comentario"), "Reseña sintética del pedido entregado anterior.");
  await fireEvent.press(screen.getByRole("checkbox", { name: "Acepto los términos de uso de las reseñas" }));
  await fireEvent.press(screen.getByRole("button", { name: "Publicar reseña" }));
  await screen.findByText("Tu reseña se publicó correctamente.");
  await screen.findByText("Reseña sintética del pedido entregado anterior.");
  expect(screen.queryByRole("button", { name: "Publicar reseña" })).toBeNull();
  await act(async () => { router.push("/account"); });
  await fireEvent.press(await screen.findByRole("button", { name: "Cerrar sesión" }));
  await waitFor(() => expect(path()).toBe("/login"));
  await waitFor(() => expect(transport.state().authenticated).toBe(false));
  expect(mockSecureValues.size).toBe(0);
  const beforeProtected = transport.calls.length;
  await act(async () => { router.push("/checkout"); });
  await screen.findByText("Inicia sesión para continuar");
  expect(transport.calls.length).toBe(beforeProtected);
  expect(transport.state()).toEqual({ authenticated: false, quantity: 2, reviews: 1 });
  expect(transport.calls.filter(call => call.url === "/products/cart/items")).toHaveLength(1);
  expect(transport.calls.filter(call => call.url === "/products/reviews" && call.method === "POST")).toHaveLength(1);
  expect(transport.calls.filter(call => call.url === "/products/checkout/confirm")).toHaveLength(0);
  expect(transport.calls.filter(call => call.url === "/users/profile" && call.method === "GET")).toHaveLength(1);
  expect(transport.calls.some(call => call.method === "PATCH")).toBe(false);
  expect(transport.unexpected).toEqual([]); expect(external).toEqual([]);
}, 30000);
