import { waitFor } from "@testing-library/react-native";
import { AxiosError } from "axios";
import { AccountDeletionController, type DeletionSessionAccess } from "../src/features/account-deletion/AccountDeletionController";
import { accountDeletionApi } from "../src/features/account-deletion/api";
import { deletionReceiptStorage } from "../src/features/account-deletion/receiptStorage";
import type { DeletionReceipt, DeletionRequest, DeletionResult, DeletionVerification } from "../src/features/account-deletion/types";
import type { DeletionSessionIdentity } from "../src/features/auth/context/SessionController";
import { deferred } from "./fixtures/auth";

const NOW = Date.parse("2030-01-01T00:00:00.000Z");
const requestId = "11111111-2222-4333-8444-555555555555";
const otherRequestId = "11111111-2222-4333-8444-555555555556";
const owner: DeletionSessionIdentity = { userId: 901, identity: { owner: 1, generation: 1, sessionId: "session-a", accessToken: "synthetic-a", retried: false } };
const other: DeletionSessionIdentity = { userId: 902, identity: { owner: 1, generation: 2, sessionId: "session-b", accessToken: "synthetic-b", retried: false } };
const challenge: DeletionRequest = { requestId, receiptToken: "r".repeat(43), status: "received", expiresAt: new Date(NOW + 1_200_000).toISOString() };
const verification: DeletionVerification = { status: "identity_verified", confirmationToken: "v".repeat(43), expiresAt: new Date(NOW + 600_000).toISOString(),
  consequences: { irreversible: true, endsAllSessions: true, newRegistrationIsSeparate: true, retainedCategories: [], requiresAttention: false, reason: null, retentionPolicy: null } };
const completed: DeletionResult = { requestId, status: "completed", reason: null, retainedCategories: [], notification: "sent" };
const receipt: DeletionReceipt = { requestId, receiptToken: challenge.receiptToken, ownerId: owner.userId };
let controller: AccountDeletionController;
let auth: jest.Mocked<DeletionSessionAccess>;
let api: jest.Mocked<typeof accountDeletionApi>;
let storage: jest.Mocked<typeof deletionReceiptStorage>;
let cleanupRecoveredAccount: jest.Mock<Promise<void>, [number]>;
let current: DeletionSessionIdentity | null;
let now: number;

beforeEach(() => {
  now = NOW; current = owner;
  auth = {
    captureDeletionIdentity: jest.fn(() => current),
    isDeletionIdentityCurrent: jest.fn(value => current === value),
    deletionAccessToken: jest.fn(async value => value.identity.accessToken),
    clearDeletedAccountSession: jest.fn(async value => { if (current === value) current = null; return true; }),
  };
  api = { request: jest.fn().mockResolvedValue(challenge), verify: jest.fn().mockResolvedValue(verification), confirm: jest.fn().mockResolvedValue(completed), result: jest.fn().mockResolvedValue(completed) };
  storage = { read: jest.fn().mockResolvedValue(null), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) };
  cleanupRecoveredAccount = jest.fn().mockResolvedValue(undefined);
  controller = new AccountDeletionController(auth, { api, storage, now: () => now, cleanupRecoveredAccount });
});
afterEach(() => controller.dispose());
async function activate() {
  controller.activate();
  await waitFor(() => {
    expect(controller.getSnapshot().restoring).toBe(false);
    expect(controller.getSnapshot().busy).toBe(false);
  });
}
async function review() {
  await activate(); await controller.start(); await controller.verify("012345");
  expect(controller.getSnapshot().stage).toBe("review");
}

test("solicita, verifica y confirma después de persistir el comprobante; limpia sólo al confirmar", async () => {
  await review();
  expect(api.request).toHaveBeenCalledWith(owner.identity.accessToken, expect.any(AbortSignal));
  expect(api.verify).toHaveBeenCalledWith(requestId, "012345", owner.identity.accessToken, expect.any(AbortSignal));
  expect(api.confirm).not.toHaveBeenCalled();
  expect(auth.clearDeletedAccountSession).not.toHaveBeenCalled();
  const saving = deferred<void>();
  storage.write.mockReturnValueOnce(saving.promise);
  const confirming = controller.confirm();
  await waitFor(() => expect(storage.write).toHaveBeenCalledTimes(1));
  expect(storage.write).toHaveBeenCalledWith(receipt, expect.any(Function));
  expect(api.confirm).not.toHaveBeenCalled();
  saving.resolve(); await confirming;
  expect(storage.write.mock.invocationCallOrder[0]).toBeLessThan(api.confirm.mock.invocationCallOrder[0]);
  expect(api.confirm).toHaveBeenCalledWith(requestId, verification.confirmationToken, owner.identity.accessToken, expect.any(AbortSignal));
  expect(auth.clearDeletedAccountSession).toHaveBeenCalledWith(owner);
  expect(controller.getSnapshot()).toMatchObject({ stage: "result", busy: false, hasReceipt: true, outcomeUnknown: false, result: completed, cleanupWarning: null });
});

test("doble pulsación envía una sola confirmación y no permite repetir desde resultado", async () => {
  await review();
  const response = deferred<DeletionResult>(); api.confirm.mockReturnValueOnce(response.promise);
  const confirming = controller.confirm();
  await controller.confirm();
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
  response.resolve(completed); await confirming;
  await controller.confirm();
  expect(api.confirm).toHaveBeenCalledTimes(1);
  expect(storage.write).toHaveBeenCalledTimes(1);
});

test("fallo de persistencia bloquea el envío irreversible y conserva la posibilidad de reintentar", async () => {
  await review(); storage.write.mockRejectedValueOnce(new Error("secure storage unavailable"));
  await controller.confirm();
  expect(api.confirm).not.toHaveBeenCalled();
  expect(auth.clearDeletedAccountSession).not.toHaveBeenCalled();
  expect(controller.getSnapshot()).toMatchObject({ stage: "review", busy: false, hasReceipt: false });
  expect(controller.getSnapshot().error).toContain("eliminación no se envió");
  await controller.confirm();
  expect(api.confirm).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().result?.status).toBe("completed");
});

test("si la autorización vence durante la persistencia no envía y permite volver a verificar", async () => {
  await review();
  storage.write.mockImplementationOnce(async () => { now = NOW + 600_001; });
  await controller.confirm();
  expect(api.confirm).not.toHaveBeenCalled();
  expect(auth.clearDeletedAccountSession).not.toHaveBeenCalled();
  expect(storage.clear).toHaveBeenCalledWith(receipt);
  expect(controller.getSnapshot()).toMatchObject({ stage: "code", verification: null, busy: false, hasReceipt: false });
  api.verify.mockResolvedValueOnce({ ...verification, expiresAt: new Date(NOW + 1_800_000).toISOString() });
  await controller.verify("012345");
  expect(api.verify).toHaveBeenCalledTimes(2);
  expect(controller.getSnapshot().stage).toBe("review");
  await controller.confirm();
  expect(api.confirm).toHaveBeenCalledTimes(1);
});

test("timeout conserva resultado desconocido y sólo permite consultar sin repetir confirmación", async () => {
  await review(); api.confirm.mockRejectedValueOnce(new AxiosError("timeout", "ECONNABORTED"));
  await controller.confirm();
  expect(controller.getSnapshot()).toMatchObject({ stage: "result", outcomeUnknown: true, hasReceipt: true, result: null });
  expect(controller.getSnapshot().error).toContain("no repitas la eliminación");
  expect(current).toBeNull();
  const tokenCalls = auth.deletionAccessToken.mock.calls.length;
  await controller.confirm(); await controller.refreshResult();
  expect(api.confirm).toHaveBeenCalledTimes(1);
  expect(api.result).toHaveBeenCalledWith(requestId, receipt.receiptToken, expect.any(AbortSignal));
  expect(auth.deletionAccessToken).toHaveBeenCalledTimes(tokenCalls);
  expect(controller.getSnapshot()).toMatchObject({ result: completed, outcomeUnknown: false });
});

test("restaura comprobante sin sesión: sólo consulta resultado y purga por ownerId", async () => {
  current = null; storage.read.mockResolvedValueOnce(receipt);
  await activate();
  expect(api.result).toHaveBeenCalledWith(requestId, receipt.receiptToken, expect.any(AbortSignal));
  expect(api.request).not.toHaveBeenCalled(); expect(api.verify).not.toHaveBeenCalled(); expect(api.confirm).not.toHaveBeenCalled();
  expect(auth.deletionAccessToken).not.toHaveBeenCalled(); expect(auth.clearDeletedAccountSession).not.toHaveBeenCalled();
  expect(cleanupRecoveredAccount).toHaveBeenCalledWith(receipt.ownerId);
  expect(controller.getSnapshot().result?.status).toBe("completed");
});

test.each(["received", "identity_verified"] as const)("restaurar %s no acredita eliminación ni cierra sesión", async status => {
  storage.read.mockResolvedValueOnce(receipt); api.result.mockResolvedValueOnce({ ...completed, status });
  await activate();
  expect(controller.getSnapshot()).toMatchObject({ stage: "result", result: { status }, outcomeUnknown: false });
  expect(auth.clearDeletedAccountSession).not.toHaveBeenCalled(); expect(cleanupRecoveredAccount).not.toHaveBeenCalled();
  await controller.confirm(); expect(api.confirm).not.toHaveBeenCalled();
  await controller.restartUnconfirmed();
  expect(storage.clear).toHaveBeenCalledWith(receipt);
  expect(controller.getSnapshot()).toMatchObject({ stage: "start", hasReceipt: false, result: null });
});

test("cambio de cuenta durante confirmación ignora respuesta anterior y no rompe el flujo nuevo", async () => {
  await review();
  const oldResponse = deferred<DeletionResult>(); api.confirm.mockReturnValueOnce(oldResponse.promise);
  const confirmingA = controller.confirm();
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
  const oldSignal = api.confirm.mock.calls[0][3];
  current = other; controller.sessionChanged();
  expect(oldSignal?.aborted).toBe(true);
  api.request.mockResolvedValueOnce({ ...challenge, requestId: otherRequestId, receiptToken: "s".repeat(43) });
  await controller.start(); await controller.verify("012345");
  expect(controller.getSnapshot().stage).toBe("review");
  oldResponse.resolve(completed); await confirmingA;
  expect(auth.clearDeletedAccountSession).toHaveBeenCalledWith(owner);
  expect(current).toBe(other);
  expect(controller.getSnapshot()).toMatchObject({ stage: "review", result: null });
  api.confirm.mockResolvedValueOnce({ ...completed, requestId: otherRequestId });
  await controller.confirm();
  expect(api.confirm).toHaveBeenCalledTimes(2);
  expect(api.confirm.mock.calls[1][0]).toBe(otherRequestId);
  expect(api.confirm.mock.calls[1][2]).toBe(other.identity.accessToken);
  expect(controller.getSnapshot().result?.requestId).toBe(otherRequestId);
});

test("si el borrado local falla, consultar estado reintenta la limpieza aun sin sesión", async () => {
  await review();
  auth.clearDeletedAccountSession.mockImplementationOnce(async () => { current = null; return false; });
  await controller.confirm();
  expect(controller.getSnapshot().cleanupWarning).toContain("no pudimos borrar");
  await controller.refreshResult();
  expect(auth.clearDeletedAccountSession).toHaveBeenCalledTimes(2);
  expect(auth.clearDeletedAccountSession.mock.calls[1][0]).toBe(owner);
  expect(controller.getSnapshot().cleanupWarning).toBeNull();
});

test("reintenta limpieza pendiente aunque no pueda consultar por falta de red", async () => {
  await review();
  auth.clearDeletedAccountSession.mockImplementationOnce(async () => { current = null; return false; });
  await controller.confirm();
  api.result.mockRejectedValueOnce(new AxiosError("offline", "ERR_NETWORK"));
  await controller.refreshResult();
  expect(auth.clearDeletedAccountSession).toHaveBeenCalledTimes(2);
  expect(controller.getSnapshot().cleanupWarning).toBeNull();
  expect(api.confirm).toHaveBeenCalledTimes(1);
});

test("validación de código y vencimiento no llaman al backend ni eliminan", async () => {
  await activate(); await controller.start();
  await controller.verify("１２３４５６"); await controller.verify("12345");
  expect(api.verify).not.toHaveBeenCalled();
  now = Date.parse(challenge.expiresAt);
  await controller.verify("012345");
  expect(api.verify).not.toHaveBeenCalled();
  expect(controller.getSnapshot().error).toContain("venció");
  expect(api.confirm).not.toHaveBeenCalled();
});

test("restauración fallida bloquea solicitudes nuevas hasta recuperar el comprobante", async () => {
  storage.read.mockRejectedValueOnce(new Error("device locked"));
  await activate();
  expect(controller.getSnapshot().error).toContain("recuperar el comprobante");
  await controller.start();
  expect(storage.read).toHaveBeenCalledTimes(2);
  expect(api.request).not.toHaveBeenCalled();
  await controller.start(); expect(api.request).toHaveBeenCalledTimes(1);
});

test("cambio de cuenta antes de completar solicitud descarta respuesta tardía", async () => {
  await activate();
  const pending = deferred<DeletionRequest>(); api.request.mockReturnValueOnce(pending.promise);
  const requesting = controller.start();
  await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
  current = other; controller.sessionChanged();
  expect(api.request.mock.calls[0][1]?.aborted).toBe(true);
  pending.resolve(challenge); await requesting;
  expect(controller.getSnapshot()).toMatchObject({ stage: "start", busy: false });
  expect(api.verify).not.toHaveBeenCalled(); expect(api.confirm).not.toHaveBeenCalled();
});
