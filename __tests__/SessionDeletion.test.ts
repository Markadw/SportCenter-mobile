import { waitFor } from "@testing-library/react-native";
import { authApi } from "../src/api/authApi";
import { SessionController, SessionRequestError } from "../src/features/auth/context/SessionController";
import { sessionStorage } from "../src/features/auth/storage/sessionStorage";
import type { Session } from "../src/features/auth/types";
import { deferred, loginCredentials } from "./fixtures/auth";
import { syntheticReviewSessionToken } from "./fixtures/reviewPreferences";

const session: Session = {
  sessionId: "deletion-session", accessToken: syntheticReviewSessionToken(6101, "deletion-session"),
  refreshToken: "synthetic-refresh", expiresAt: 901_000,
};
let controller: SessionController;
let api: jest.Mocked<Pick<typeof authApi, "login" | "refresh" | "logout">>;
let storage: jest.Mocked<typeof sessionStorage>;
let cleanup: jest.Mock<Promise<void>, [number, string]>;
let now: number;
beforeEach(async () => {
  now = 1_000;
  api = { login: jest.fn().mockResolvedValue(session), refresh: jest.fn(), logout: jest.fn() };
  storage = { read: jest.fn().mockResolvedValue(null), write: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) };
  cleanup = jest.fn().mockResolvedValue(undefined);
  controller = new SessionController({ api, storage, cleanupDeletedAccount: cleanup, now: () => now });
  controller.activate();
  await waitFor(() => expect(controller.getSnapshot().isRestoring).toBe(false));
  await controller.signIn(loginCredentials, new AbortController().signal);
});
afterEach(() => controller.dispose());

test("captura la identidad local y cierra la sesión eliminada sin llamar logout", async () => {
  const captured = controller.captureDeletionIdentity()!;
  expect(captured.userId).toBe(6101);
  expect(controller.isDeletionIdentityCurrent(captured)).toBe(true);
  await expect(controller.deletionAccessToken(captured)).resolves.toBe(session.accessToken);
  expect(api.refresh).not.toHaveBeenCalled();
  await expect(controller.clearDeletedAccountSession(captured)).resolves.toBe(true);
  expect(controller.getSnapshot()).toMatchObject({ session: null, sessionScopeId: null });
  expect(storage.clear).toHaveBeenCalledTimes(2);
  expect(cleanup).toHaveBeenCalledWith(6101, session.sessionId);
  expect(api.logout).not.toHaveBeenCalled();
  await expect(controller.deletionAccessToken(captured)).rejects.toBeInstanceOf(SessionRequestError);
});

test("renueva antes de obtener el token y mantiene la captura en la misma generación", async () => {
  const captured = controller.captureDeletionIdentity()!;
  now = session.expiresAt;
  const next = { ...session, accessToken: syntheticReviewSessionToken(6101, session.sessionId, 2), expiresAt: 1_801_000 };
  api.refresh.mockResolvedValueOnce(next);
  await expect(controller.deletionAccessToken(captured)).resolves.toBe(next.accessToken);
  expect(api.refresh).toHaveBeenCalledTimes(1);
  expect(controller.isDeletionIdentityCurrent(captured)).toBe(true);
});

test("una renovación tardía no resucita la cuenta después de eliminarla", async () => {
  const captured = controller.captureDeletionIdentity()!;
  const pending = deferred<Session>();
  api.refresh.mockReturnValueOnce(pending.promise);
  now = session.expiresAt;
  const rotation = controller.refreshIfNeeded().catch(error => error);
  await controller.clearDeletedAccountSession(captured);
  expect(api.refresh.mock.calls[0][1]?.aborted).toBe(true);
  pending.resolve({ ...session, expiresAt: 1_801_000 });
  await rotation;
  expect(storage.write).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().session).toBeNull();
});

test("una confirmación tardía no cierra ni borra la nueva sesión", async () => {
  const captured = controller.captureDeletionIdentity()!;
  const other = { ...session, sessionId: "another-session", accessToken: syntheticReviewSessionToken(6102, "another-session") };
  api.login.mockResolvedValueOnce(other);
  await controller.signIn(loginCredentials, new AbortController().signal);
  const previousClears = storage.clear.mock.calls.length;
  await expect(controller.clearDeletedAccountSession(captured)).resolves.toBe(true);
  expect(storage.clear).toHaveBeenCalledTimes(previousClears);
  expect(controller.getSnapshot().session).toEqual(other);
  expect(cleanup).toHaveBeenCalledWith(6101, session.sessionId);
  expect(api.logout).not.toHaveBeenCalled();
});

test("un cambio de cuenta mientras se borra no ejecuta la guarda de almacenamiento antigua", async () => {
  const captured = controller.captureDeletionIdentity()!;
  const pending = deferred<void>();
  storage.clear.mockReturnValueOnce(pending.promise);
  const clearing = controller.clearDeletedAccountSession(captured);
  const oldGuard = storage.clear.mock.calls[1][0];
  expect(oldGuard?.()).toBe(true);
  const other = { ...session, sessionId: "racing-session", accessToken: syntheticReviewSessionToken(6103, "racing-session") };
  api.login.mockResolvedValueOnce(other);
  await controller.signIn(loginCredentials, new AbortController().signal);
  expect(oldGuard?.()).toBe(false);
  pending.resolve();
  await clearing;
  expect(controller.getSnapshot().session).toEqual(other);
});

test("informa los fallos locales de borrado y conserva el acceso retirado", async () => {
  const captured = controller.captureDeletionIdentity()!;
  storage.clear.mockRejectedValueOnce(new Error("device locked"));
  await expect(controller.clearDeletedAccountSession(captured)).resolves.toBe(false);
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(controller.getSnapshot().session).toBeNull();
  expect(controller.getSnapshot().notice).toContain("no pudimos borrar");
  expect(api.logout).not.toHaveBeenCalled();
});

test("reintenta el borrado de credenciales fallido aunque la sesión ya esté cerrada", async () => {
  const captured = controller.captureDeletionIdentity()!;
  storage.clear.mockRejectedValueOnce(new Error("device locked"));
  await expect(controller.clearDeletedAccountSession(captured)).resolves.toBe(false);
  expect(controller.getSnapshot().session).toBeNull();
  await expect(controller.clearDeletedAccountSession(captured)).resolves.toBe(true);
  expect(storage.clear).toHaveBeenCalledTimes(3);
  expect(controller.getSnapshot().notice).toBeNull();
});

test("un nuevo inicio de sesión invalida el reintento pendiente antes de recibir credenciales", async () => {
  const captured = controller.captureDeletionIdentity()!;
  storage.clear.mockRejectedValueOnce(new Error("device locked"));
  await expect(controller.clearDeletedAccountSession(captured)).resolves.toBe(false);
  const pendingLogin = deferred<Session>();
  api.login.mockReturnValueOnce(pendingLogin.promise);
  const login = controller.signIn(loginCredentials, new AbortController().signal);
  await waitFor(() => expect(api.login).toHaveBeenCalledTimes(2));
  const previousClears = storage.clear.mock.calls.length;
  await controller.clearDeletedAccountSession(captured);
  expect(storage.clear).toHaveBeenCalledTimes(previousClears);
  const next = { ...session, sessionId: "login-after-failed-clear", accessToken: syntheticReviewSessionToken(6110, "login-after-failed-clear") };
  pendingLogin.resolve(next); await login;
  await controller.clearDeletedAccountSession(captured);
  expect(storage.clear).toHaveBeenCalledTimes(previousClears);
  expect(controller.getSnapshot().session).toEqual(next);
});

test("informa fallo de preferencias sin restaurar credenciales", async () => {
  const captured = controller.captureDeletionIdentity()!;
  cleanup.mockRejectedValueOnce(new Error("storage failed"));
  await expect(controller.clearDeletedAccountSession(captured)).resolves.toBe(false);
  expect(controller.getSnapshot().session).toBeNull();
  expect(controller.getSnapshot().notice).toContain("preferencias");
});

test("no captura tokens inválidos ni acepta una rotación que cambia usuario", async () => {
  const captured = controller.captureDeletionIdentity()!;
  api.refresh.mockResolvedValueOnce({ ...session, accessToken: syntheticReviewSessionToken(6109, session.sessionId, 2), expiresAt: 1_801_000 });
  now = session.expiresAt;
  await expect(controller.deletionAccessToken(captured)).rejects.toBeInstanceOf(SessionRequestError);
  api.login.mockResolvedValueOnce({ ...session, accessToken: "invalid-token" });
  await controller.signIn(loginCredentials, new AbortController().signal);
  expect(controller.captureDeletionIdentity()).toBeNull();
});
