import { create } from "axios";
import axiosClient from "../src/api/axios";
import { authApi } from "../src/api/authApi";
import { InvalidSessionResponse } from "../src/features/auth/errors";
import { loginCredentials, loginResponse } from "./fixtures/auth";

jest.mock("axios", () => ({ ...jest.requireActual("axios"), create: jest.fn(() => ({ post: jest.fn() })) }));
jest.mock("../src/api/axios", () => ({ __esModule: true, default: { post: jest.fn() } }));
const post = jest.mocked(axiosClient.post);
const refreshPost = jest.mocked(create).mock.results[0].value.post as jest.Mock;

describe("HU-02: contrato de autenticación", () => {
  test("envía email y passw, normaliza solo el correo y conserva la contraseña exacta", async () => {
    const now = Date.now();
    post.mockResolvedValueOnce({ data: { ...loginResponse, passw: "dato-no-permitido" } });
    const controller = new AbortController();
    const result = await authApi.login({ email: " CLIENTE@EXAMPLE.TEST ", passw: " clave123 " }, controller.signal);
    expect(post).toHaveBeenCalledWith("/users/login-user", { email: "cliente@example.test", passw: " clave123 " }, { signal: controller.signal });
    expect(result).toMatchObject({ accessToken: loginResponse.accessToken, refreshToken: loginResponse.refreshToken, sessionId: loginResponse.sessionId });
    expect(result.expiresAt).toBeGreaterThanOrEqual(now + 900_000);
    expect(result).not.toHaveProperty("passw");
  });

  test.each([
    null, {}, { ...loginResponse, accessToken: "" }, { ...loginResponse, refreshToken: null },
    { ...loginResponse, sessionId: " " }, { ...loginResponse, accessTokenExpiresIn: undefined },
    { ...loginResponse, accessTokenExpiresIn: "0m" }, { ...loginResponse, accessTokenExpiresIn: "nunca" },
    { ...loginResponse, accessTokenExpiresIn: "99999999999999999h" },
  ])("una respuesta incompleta o una vigencia inválida no establece sesión: %#", async (data) => {
    post.mockResolvedValueOnce({ data });
    await expect(authApi.login(loginCredentials)).rejects.toBeInstanceOf(InvalidSessionResponse);
  });

  test("cierra la sesión con el access token, sin enviar contraseña ni refresh token", async () => {
    post.mockResolvedValueOnce({ data: { message: "Sesión cerrada correctamente." } });
    await authApi.logout(loginResponse.accessToken);
    expect(post).toHaveBeenCalledWith("/users/logout", {}, { headers: { Authorization: `Bearer ${loginResponse.accessToken}` } });
  });
});


describe("MOB005: transporte de renovación aislado", () => {
  test("renueva enviando sólo refreshToken con cancelación, sin interceptores compartidos", async () => {
    refreshPost.mockResolvedValueOnce({ data: loginResponse });
    const abort = new AbortController();
    const next = await authApi.refresh({ refreshToken: loginResponse.refreshToken, sessionId: loginResponse.sessionId }, abort.signal);
    expect(refreshPost).toHaveBeenCalledWith("/users/refresh-token", { refreshToken: loginResponse.refreshToken }, { signal: abort.signal });
    expect(next.accessToken).toBe(loginResponse.accessToken);
    expect(post).not.toHaveBeenCalled();
  });
  test.each([{}, null, { ...loginResponse, accessToken: "token con espacios" }, { ...loginResponse, accessTokenExpiresIn: "0s" }, { ...loginResponse, sessionId: "otra-cuenta" }])(
    "no acepta renovación inválida ni otra identidad de sesión: %#", async (data) => {
      refreshPost.mockResolvedValueOnce({ data });
      await expect(authApi.refresh({ refreshToken: loginResponse.refreshToken, sessionId: loginResponse.sessionId })).rejects.toBeInstanceOf(InvalidSessionResponse);
    },
  );
  test("un 401 de refresh se devuelve sin recursión ni reintento", async () => {
    const error = new Error("rechazado");
    refreshPost.mockRejectedValueOnce(error);
    await expect(authApi.refresh({ refreshToken: loginResponse.refreshToken, sessionId: loginResponse.sessionId })).rejects.toBe(error);
    expect(refreshPost).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
  });
});
