import axiosClient from "../src/api/axios";
import { registrationApi } from "../src/api/registrationApi";
import { UnconfirmedResponseError } from "../src/features/registration/errors";
import { registrationForm } from "./fixtures/registration";

jest.mock("../src/api/axios", () => ({ __esModule: true, default: { post: jest.fn() } }));
const post = jest.mocked(axiosClient.post);

describe("HU-01: contrato HTTP de registro", () => {
  test("envía exclusivamente seis campos y descarta datos sensibles de la respuesta", async () => {
    post.mockResolvedValueOnce({ data: { id_usuario: 7, email: registrationForm.email,
      passw: "hash-ficticio", token_verificacion: "123456", rol: 1, activo: 0 } });
    const controller = new AbortController();
    await expect(registrationApi.register({ ...registrationForm, email: " CLIENTE@EXAMPLE.TEST " }, controller.signal))
      .resolves.toEqual({ email: registrationForm.email });
    expect(post).toHaveBeenCalledWith("/users/create-user", {
      nombre: "María", aPaterno: "López", aMaterno: "Pérez", email: registrationForm.email,
      telefono: registrationForm.telefono, passw: registrationForm.passw,
    }, { timeout: 45000, signal: controller.signal });
  });

  test.each([null, [], {}, { message: "ok" }, { id_usuario: 0, email: registrationForm.email },
    { id_usuario: 7, email: "otra@example.test" }])("rechaza respuesta de registro no confirmada: %p", async (data) => {
    post.mockResolvedValueOnce({ data });
    await expect(registrationApi.register(registrationForm)).rejects.toBeInstanceOf(UnconfirmedResponseError);
  });

  test("verifica usando el código introducido y no solicita una sesión", async () => {
    post.mockResolvedValueOnce({ data: { message: "Cuenta verificada correctamente." } });
    await expect(registrationApi.verify(" CLIENTE@EXAMPLE.TEST ", "654321")).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledWith("/users/verify-email", { email: registrationForm.email, token: "654321" },
      { timeout: 45000, signal: undefined });
    expect(post).toHaveBeenCalledTimes(1);
  });

  test("reenvía con el correo normalizado sin contraseña ni código", async () => {
    post.mockResolvedValueOnce({ data: { message: "Codigo enviado correctamente. Revise su bandeja de entrada." } });
    await expect(registrationApi.resend(" CLIENTE@EXAMPLE.TEST ")).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledWith("/users/resend-code", { email: registrationForm.email },
      { timeout: 45000, signal: undefined });
  });

  test.each(["verify", "resend"] as const)("no inventa éxito ante un 200 vacío de %s", async (operation) => {
    post.mockResolvedValueOnce({ data: {} });
    const result = operation === "verify"
      ? registrationApi.verify(registrationForm.email, "123456")
      : registrationApi.resend(registrationForm.email);
    await expect(result).rejects.toBeInstanceOf(UnconfirmedResponseError);
  });

  test("un fallo de red produce una sola petición, sin reintentos automáticos", async () => {
    post.mockRejectedValueOnce(new Error("Sin red"));
    await expect(registrationApi.register(registrationForm)).rejects.toThrow("Sin red");
    expect(post).toHaveBeenCalledTimes(1);
  });
});
