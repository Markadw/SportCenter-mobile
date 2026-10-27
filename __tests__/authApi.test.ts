import axiosClient from "../src/api/axios";
import { authApi } from "../src/api/authApi";
import { InvalidSessionResponse } from "../src/features/auth/errors";
import { loginCredentials, loginResponse } from "./fixtures/auth";

jest.mock("../src/api/axios", () => ({ __esModule: true, default: { post: jest.fn() } }));
const post = jest.mocked(axiosClient.post);

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
