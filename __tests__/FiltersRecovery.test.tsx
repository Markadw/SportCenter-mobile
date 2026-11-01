import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Animated } from "react-native";
import { catalogApi } from "../src/api";
import { FiltersProvider } from "../src/features/catalog/context/FiltersContext";
import { FiltersModal } from "../src/features/products/components/FiltersModal";

jest.mock("../src/api", () => ({ catalogApi: { getCategories: jest.fn(), getBrands: jest.fn(), getSports: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
jest.mock("lucide-react-native", () => ({ ChevronDown: () => null, ChevronUp: () => null, SlidersHorizontal: () => null, X: () => null }));
afterEach(() => jest.restoreAllMocks());

test("el botón del modal recupera la fuente fallida con el proveedor real y conserva opciones y selecciones", async () => {
  jest.mocked(catalogApi.getCategories).mockResolvedValue([{ id: 1, name: "Balones", parentId: null }]);
  jest.mocked(catalogApi.getSports).mockResolvedValue([{ id: 3, name: "Fútbol" }]);
  jest.mocked(catalogApi.getBrands).mockRejectedValueOnce(new Error("sin red"))
    .mockResolvedValueOnce([{ id: 2, name: "Sport Center", image: "" }]);
  jest.spyOn(Animated, "timing").mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
  await render(<FiltersProvider><FiltersModal visible onClose={jest.fn()} /></FiltersProvider>);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/marcas/));
  expect(screen.getByText("Balones")).toBeTruthy();
  await fireEvent.press(screen.getByText("Balones"));
  expect(screen.getByText("Activos")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Reintentar opciones de filtros" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.getByText("Activos")).toBeTruthy();
  expect(screen.getByText("Balones")).toBeTruthy();
  await fireEvent.press(screen.getByText("Marca"));
  expect(screen.getByText("Sport Center")).toBeTruthy();
  expect(catalogApi.getCategories).toHaveBeenCalledTimes(1);
  expect(catalogApi.getSports).toHaveBeenCalledTimes(1);
  expect(catalogApi.getBrands).toHaveBeenCalledTimes(2);
});
