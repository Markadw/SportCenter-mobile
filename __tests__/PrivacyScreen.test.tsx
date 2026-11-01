import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { PrivacyScreen } from "../src/features/privacy/screens/PrivacyScreen";
import { accountDeletionApi } from "../src/features/privacy/accountDeletionApi";
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({}) }));
jest.mock("expo-linking", () => ({ openURL: jest.fn().mockResolvedValue(true) }));
jest.mock("../src/features/privacy/accountDeletionApi", () => ({ accountDeletionApi: { request: jest.fn() } }));
it("makes deletion and review rules available without requiring a session", async () => {
  await render(<PrivacyScreen />);
  expect(screen.getByText("Reglas para publicar reseñas")).toBeTruthy();
  expect(screen.getByText("Solicitar eliminación de cuenta y datos")).toBeTruthy();
  expect(screen.getByRole("checkbox").props.accessibilityState.checked).toBe(false);
  expect(screen.getByText("sportcentersoporte@gmail.com")).toBeTruthy();
});
it("shows a manual request receipt rather than claiming account deletion", async () => {
  jest.mocked(accountDeletionApi.request).mockResolvedValue({ receiptId: 17 });
  await render(<PrivacyScreen />);
  await fireEvent.changeText(screen.getByLabelText("Nombre para la solicitud"), "Ana");
  await fireEvent.changeText(screen.getByLabelText("Correo de la cuenta que deseas eliminar"), "ana@example.com");
  await fireEvent.press(screen.getByRole("checkbox"));
  await fireEvent.press(screen.getByRole("button", { name: "Enviar solicitud de eliminación" }));
  await waitFor(() => expect(screen.getByText(/Solicitud recibida. Folio #17. Tu cuenta aún no está eliminada/)).toBeTruthy());
  expect(accountDeletionApi.request).toHaveBeenCalledTimes(1);
});
