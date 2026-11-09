import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccountDeletionScreen } from "../src/features/account-deletion/screens/AccountDeletionScreen";
import type { DeletionResult, DeletionVerification } from "../src/features/account-deletion/types";

const mockPush = jest.fn(), mockReplace = jest.fn();
const verification: DeletionVerification = {
  status: "identity_verified", confirmationToken: "v".repeat(43), expiresAt: "2030-01-01T00:10:00.000Z",
  consequences: { irreversible: true, endsAllSessions: true, newRegistrationIsSeparate: true,
    retainedCategories: ["orders", "payments"], requiresAttention: false, reason: null,
    retentionPolicy: { basis: "Obligación fiscal", days: 1825 } },
};
const initialState = () => ({
  stage: "start" as "start" | "code" | "review" | "result", busy: false, restoring: false,
  error: null as string | null, expiresAt: "2030-01-01T00:10:00.000Z", verification: null as DeletionVerification | null,
  result: null as DeletionResult | null, outcomeUnknown: false, hasReceipt: false, receiptUnavailable: false,
  cleanupWarning: null as string | null,
});
const mockModel = {
  state: initialState(), canStart: true, signedIn: true,
  start: jest.fn(), verify: jest.fn(), confirm: jest.fn(), refreshResult: jest.fn(),
  cancel: jest.fn(), restartUnconfirmed: jest.fn(), discardUnavailableReceipt: jest.fn(),
};
jest.mock("../src/features/account-deletion/hooks/useAccountDeletion", () => ({ useAccountDeletion: () => mockModel }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace }) }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);
beforeEach(() => { mockModel.state = initialState(); mockModel.canStart = true; mockModel.signedIn = true; });

test("solicita el código sólo al pulsar y explica que aún no elimina", async () => {
  await render(<AccountDeletionScreen />);
  expect(mockModel.start).not.toHaveBeenCalled();
  expect(screen.getByText(/Enviar o verificar el código todavía no elimina/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Enviar código de verificación" }));
  expect(mockModel.start).toHaveBeenCalledTimes(1);
  expect(mockModel.confirm).not.toHaveBeenCalled();
});

test("código dedicado valida seis dígitos ASCII y conserva cero inicial", async () => {
  mockModel.state.stage = "code";
  await render(<AccountDeletionScreen />);
  await fireEvent.changeText(screen.getByLabelText("Código de eliminación"), "１２３４５６");
  await fireEvent.press(screen.getByRole("button", { name: "Verificar código" }));
  expect(mockModel.verify).not.toHaveBeenCalled();
  expect(screen.getByText("Ingresa un código de seis dígitos.")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Código de eliminación"), "012345");
  await fireEvent.press(screen.getByRole("button", { name: "Verificar código" }));
  expect(mockModel.verify).toHaveBeenCalledWith("012345");
  expect(screen.getByLabelText("Código de eliminación").props.value).toBe("");
  expect(mockModel.confirm).not.toHaveBeenCalled();
});

test("no confirma sin casilla y no reutiliza aceptación de otra autorización", async () => {
  mockModel.state.stage = "review"; mockModel.state.verification = verification;
  const view = await render(<AccountDeletionScreen />);
  expect(screen.getByText("La eliminación es irreversible.")).toBeTruthy();
  expect(screen.getByText("Plazo aplicable: 1825 días.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Eliminar mi cuenta" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
  expect(mockModel.confirm).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("checkbox"));
  expect(screen.getByRole("button", { name: "Eliminar mi cuenta" })).not.toBeDisabled();
  mockModel.state.verification = { ...verification, confirmationToken: "n".repeat(43) };
  await view.rerender(<AccountDeletionScreen />);
  expect(screen.getByRole("checkbox").props.accessibilityState.checked).toBe(false);
  expect(screen.getByRole("button", { name: "Eliminar mi cuenta" })).toBeDisabled();
  await fireEvent.press(screen.getByRole("checkbox"));
  await fireEvent.press(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
  await fireEvent.press(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
  expect(mockModel.confirm).toHaveBeenCalledTimes(1);
});

test.each([
  ["received", "Solicitud recibida"], ["identity_verified", "Identidad verificada"],
  ["deletion_confirmed", "Eliminación confirmada"], ["in_progress", "Eliminación en proceso"],
  ["requires_attention", "Tu solicitud necesita atención"], ["error", "La eliminación no está completada"],
] as const)("estado %s nunca acredita eliminación ni repite confirmación", async (status, title) => {
  mockModel.signedIn = false; mockModel.canStart = false;
  mockModel.state = { ...initialState(), stage: "result", hasReceipt: true,
    result: { requestId: "11111111-2222-4333-8444-555555555555", status, reason: null, retainedCategories: [], notification: "pending" } };
  await render(<AccountDeletionScreen />);
  expect(screen.getByRole("header", { name: title })).toBeTruthy();
  expect(screen.queryByText("Tu cuenta fue eliminada")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Consultar estado" }));
  expect(mockModel.refreshResult).toHaveBeenCalledTimes(1);
  expect(mockModel.confirm).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
});

test("resultado desconocido permite consultar, aunque la sesión ya terminó", async () => {
  mockModel.signedIn = false; mockModel.canStart = false;
  mockModel.state = { ...initialState(), stage: "result", hasReceipt: true, outcomeUnknown: true };
  await render(<AccountDeletionScreen />);
  expect(screen.getByText("Aún no confirmamos el resultado")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Consultar estado" }));
  expect(mockModel.refreshResult).toHaveBeenCalledTimes(1);
  expect(mockModel.start).not.toHaveBeenCalled();
  expect(mockModel.confirm).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Iniciar sesión" })).toBeNull();
});

test("completada ofrece volver al inicio y comunica correo sin exigir sesión", async () => {
  mockModel.signedIn = false; mockModel.canStart = false;
  mockModel.state = { ...initialState(), stage: "result", hasReceipt: true,
    result: { requestId: "11111111-2222-4333-8444-555555555555", status: "completed", reason: null, retainedCategories: ["orders"], notification: "sent" } };
  await render(<AccountDeletionScreen />);
  expect(screen.getByText("Tu cuenta fue eliminada")).toBeTruthy();
  expect(screen.getByText("La notificación del resultado fue enviada por correo.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Consultar estado" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Volver al inicio" }));
  expect(mockReplace).toHaveBeenCalledWith("/catalog");
});

test("ocupada bloquea confirmación y cancelación; fallo local sigue visible", async () => {
  mockModel.state = { ...initialState(), stage: "review", verification, busy: true, cleanupWarning: "No se pudo limpiar el almacenamiento local." };
  await render(<AccountDeletionScreen />);
  expect(screen.getByRole("checkbox")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Volver sin eliminar" })).toBeDisabled();
  expect(screen.getByText("No se pudo limpiar el almacenamiento local.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("checkbox"));
  await fireEvent.press(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
  expect(mockModel.confirm).not.toHaveBeenCalled();
});

test("seguimiento no disponible ofrece cierre, sin atribuir eliminación", async () => {
  mockModel.state = { ...initialState(), stage: "result", receiptUnavailable: true, hasReceipt: true, outcomeUnknown: true };
  await render(<AccountDeletionScreen />);
  expect(screen.getByText(/Cerrar el seguimiento no cancela una solicitud ni acredita la eliminación/)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Cerrar este seguimiento" }));
  expect(mockModel.discardUnavailableReceipt).toHaveBeenCalledTimes(1);
  expect(mockModel.confirm).not.toHaveBeenCalled();
});

test("fallo de limpieza tras completar permite reintentar sin repetir eliminación", async () => {
  mockModel.state = { ...initialState(), stage: "result", hasReceipt: true, cleanupWarning: "Vuelve a intentar la limpieza antes de compartirlo.",
    result: { requestId: "11111111-2222-4333-8444-555555555555", status: "completed", reason: null, retainedCategories: [], notification: "sent" } };
  await render(<AccountDeletionScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Reintentar limpieza" }));
  expect(mockModel.refreshResult).toHaveBeenCalledTimes(1);
  expect(mockModel.confirm).not.toHaveBeenCalled();
});
