import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccountDeletionScreen } from "../src/features/account-deletion/screens/AccountDeletionScreen";
import type { DeletionReceipt, DeletionRequest, DeletionResult, DeletionVerification } from "../src/features/account-deletion/types";
import type { Session } from "../src/features/auth/types";

const requestId = "a038b273-9267-4df4-b73f-f834c05c110d";
const mockCapture = { userId: 71, identity: { owner: 1, generation: 1, sessionId: "test-session", accessToken: "test-access", retried: false } };
const token = `e30.${btoa(JSON.stringify({ id_usuario: 71, rol: 1, sessionId: "test-session" })).replace(/=+$/, "")}.signature`;
let mockReceipt: DeletionReceipt | null = null;
const mockOrder: string[] = [];
let mockSession: Session | null = null;
const mockAuth = {
  get session() { return mockSession; },
  set session(value: Session | null) { mockSession = value; },
  isRestoring: false,
  captureDeletionIdentity: jest.fn(() => mockSession ? mockCapture : null),
  isDeletionIdentityCurrent: jest.fn(() => !!mockSession),
  deletionAccessToken: jest.fn(async () => token),
  clearDeletedAccountSession: jest.fn(async () => { mockSession = null; return true; }),
};
const mockApi = { request: jest.fn(), verify: jest.fn(), confirm: jest.fn(), result: jest.fn() };
const mockStorage = {
  read: jest.fn(async () => mockReceipt),
  write: jest.fn(async (value: DeletionReceipt, isCurrent: () => boolean) => {
    if (!isCurrent()) throw new Error("changed");
    mockOrder.push("persist"); mockReceipt = value;
  }),
  clear: jest.fn(async () => { mockReceipt = null; }),
};
jest.mock("../src/features/auth/context/SessionContext", () => ({ useSession: () => mockAuth }));
jest.mock("../src/features/account-deletion/api", () => ({ accountDeletionApi: {
  request: (token: string, signal?: AbortSignal) => mockApi.request(token, signal),
  verify: (id: string, code: string, token: string, signal?: AbortSignal) => mockApi.verify(id, code, token, signal),
  confirm: (id: string, grant: string, token: string, signal?: AbortSignal) => mockApi.confirm(id, grant, token, signal),
  result: (id: string, receipt: string, signal?: AbortSignal) => mockApi.result(id, receipt, signal),
} }));
jest.mock("../src/features/account-deletion/receiptStorage", () => ({ deletionReceiptStorage: {
  read: () => mockStorage.read(),
  write: (value: DeletionReceipt, isCurrent: () => boolean) => mockStorage.write(value, isCurrent),
  clear: () => mockStorage.clear(),
} }));
jest.mock("../src/features/reviews/preferences/authorPreferences", () => ({ authorPreferences: { purgeAccount: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock("react-native-safe-area-context", () => jest.requireActual("react-native-safe-area-context/jest/mock").default);

const completed: DeletionResult = { requestId, status: "completed", reason: null, retainedCategories: [], notification: "sent" };
beforeEach(() => {
  mockReceipt = null; mockOrder.length = 0;
  mockAuth.session = { accessToken: token, refreshToken: "test-refresh", sessionId: "test-session", expiresAt: Date.now() + 600000 };
  const request: DeletionRequest = { requestId, receiptToken: "r".repeat(43), status: "received", expiresAt: new Date(Date.now() + 600000).toISOString() };
  const verification: DeletionVerification = { status: "identity_verified", confirmationToken: "v".repeat(43), expiresAt: new Date(Date.now() + 300000).toISOString(),
    consequences: { irreversible: true, endsAllSessions: true, newRegistrationIsSeparate: true, retainedCategories: [], requiresAttention: false, reason: null, retentionPolicy: null } };
  mockApi.request.mockResolvedValue(request);
  mockApi.verify.mockResolvedValue(verification);
  mockApi.confirm.mockImplementation(async () => { mockOrder.push("confirm"); return completed; });
  mockApi.result.mockResolvedValue(completed);
});
async function reachReview() {
  await waitFor(() => expect(screen.getByRole("button", { name: "Enviar código de verificación" })).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Enviar código de verificación" }));
  await waitFor(() => expect(screen.getByLabelText("Código de eliminación")).toBeTruthy());
  await fireEvent.changeText(screen.getByLabelText("Código de eliminación"), "012345");
  await fireEvent.press(screen.getByRole("button", { name: "Verificar código" }));
  await waitFor(() => expect(screen.getByRole("checkbox")).toBeTruthy());
  expect(mockApi.confirm).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("checkbox"));
}
test("pantalla, hook y controlador completan el flujo y cierran la sesión después de persistir el comprobante", async () => {
  await render(<AccountDeletionScreen />);
  await reachReview();
  await fireEvent.press(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
  await waitFor(() => expect(screen.getByText("Tu cuenta fue eliminada")).toBeTruthy());
  expect(mockOrder).toEqual(["persist", "confirm"]);
  expect(mockApi.verify).toHaveBeenCalledWith(requestId, "012345", token, expect.any(AbortSignal));
  expect(mockApi.confirm).toHaveBeenCalledTimes(1);
  expect(mockAuth.clearDeletedAccountSession).toHaveBeenCalledWith(mockCapture);
  expect(mockAuth.session).toBeNull();
  expect(screen.getByRole("button", { name: "Volver al inicio" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Consultar estado" })).toBeNull();
});
test("una respuesta perdida conserva folio y recupera al reiniciar sólo por comprobante, ya sin sesión", async () => {
  mockApi.confirm.mockRejectedValueOnce(new Error("response lost"));
  const view = await render(<AccountDeletionScreen />);
  await reachReview();
  await fireEvent.press(screen.getByRole("button", { name: "Eliminar mi cuenta" }));
  await waitFor(() => expect(screen.getByText("Aún no confirmamos el resultado")).toBeTruthy());
  expect(screen.getByText(`Folio: ${requestId}`)).toBeTruthy();
  expect(screen.queryByText("Tu cuenta fue eliminada")).toBeNull();
  const tokenCalls = mockAuth.deletionAccessToken.mock.calls.length;
  await view.unmount();
  await render(<AccountDeletionScreen />);
  await waitFor(() => expect(screen.getByText("Tu cuenta fue eliminada")).toBeTruthy());
  expect(mockApi.confirm).toHaveBeenCalledTimes(1);
  expect(mockApi.request).toHaveBeenCalledTimes(1);
  expect(mockApi.result).toHaveBeenCalledWith(requestId, "r".repeat(43), expect.any(AbortSignal));
  expect(mockAuth.deletionAccessToken).toHaveBeenCalledTimes(tokenCalls);
});
