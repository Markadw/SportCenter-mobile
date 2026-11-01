import { fireEvent, render, screen } from "@testing-library/react-native";
import NotFoundScreen from "../src/app/+not-found";
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: mockReplace }) }));

test("una ruta desconocida ofrece salida al catálogo sin requerir una sesión", async () => {
  await render(<NotFoundScreen />);
  expect(screen.getByText("No encontramos esta pantalla")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Ir al catálogo" }));
  expect(mockReplace).toHaveBeenCalledWith("/catalog");
});
