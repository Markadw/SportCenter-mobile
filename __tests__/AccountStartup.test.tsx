import { render, screen } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import RootLayout from "../src/app/_layout";
let mockRestoring = true, mockCatalogLoading = false;
jest.mock("expo-router", () => {
  const React = jest.requireActual("react");
  const { View, Text } = jest.requireActual("react-native");
  const Stack = ({ children }: PropsWithChildren) => React.createElement(View, null, children);
  Stack.Screen = function MockStackScreen({ name }: { name: string }) { return React.createElement(Text, null, name); };
  return { Stack };
});
jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn().mockResolvedValue(undefined), hideAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("../src/features/auth/context/SessionContext", () => ({
  SessionProvider: ({ children }: PropsWithChildren) => children,
  useSession: () => ({ isRestoring: mockRestoring }),
}));
jest.mock("../src/features/products", () => ({
  ProductsProvider: ({ children }: PropsWithChildren) => children,
  useProducts: () => ({ isLoading: mockCatalogLoading }),
}));
jest.mock("../src/features/catalog", () => ({ FiltersProvider: ({ children }: PropsWithChildren) => children }));

// El arranque sólo espera la sesión local; el catálogo carga dentro de Inicio con su propio estado.
test("inicio espera la restauración de sesión antes de mostrar las rutas", async () => {
  mockRestoring = true; mockCatalogLoading = false;
  const view = await render(<RootLayout />);
  expect(screen.getByText("Preparando tu tienda…")).toBeTruthy();
  expect(screen.queryByText("profile")).toBeNull();
  mockRestoring = false; mockCatalogLoading = false;
  await view.rerender(<RootLayout />);
  expect(screen.queryByText("Preparando tu tienda…")).toBeNull();
  for (const route of ["profile", "forgot-password", "orders/index", "orders/[id]", "reviews/[id]", "privacy"]) {
    expect(screen.getByText(route)).toBeTruthy();
  }
});

test("una consulta lenta del catálogo no bloquea el arranque", async () => {
  mockRestoring = false; mockCatalogLoading = true;
  await render(<RootLayout />);
  expect(screen.queryByText("Preparando tu tienda…")).toBeNull();
  expect(screen.getByText("profile")).toBeTruthy();
});
