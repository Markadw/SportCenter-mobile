import { AxiosError, AxiosHeaders, create, type AxiosAdapter, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import axiosClient from "../src/api/axios";
import { createAccountDeletionApi } from "../src/features/account-deletion/api";
import { InvalidDeletionResponse } from "../src/features/account-deletion/parsers";

jest.mock("axios", () => {
  const actual = jest.requireActual("axios");
  return { ...actual, create: jest.fn((options) => actual.create(options)) };
});
jest.mock("../src/api/axios", () => ({ __esModule: true, default: { post: jest.fn() } }));
const requestId = "11111111-2222-4333-8444-555555555555", otherId = "11111111-2222-4333-8444-555555555556";
const receiptToken = "r".repeat(43), confirmationToken = "c".repeat(43), accessToken = "synthetic-access";
const received = { requestId, receiptToken, status: "received", expiresAt: "2030-01-01T00:10:00.000Z" };
const verified = { status: "identity_verified", confirmationToken, expiresAt: received.expiresAt,
  consequences: { irreversible: true, endsAllSessions: true, newRegistrationIsSeparate: true,
    retainedCategories: ["orders"], requiresAttention: false, reason: null,
    retentionPolicy: { basis: "Obligación comercial", days: 365 } } };
const completed = { requestId, status: "completed", reason: null, retainedCategories: ["orders"], notification: "sent" };
let reply: unknown, api: ReturnType<typeof createAccountDeletionApi>, client: AxiosInstance;
let adapter: jest.MockedFunction<AxiosAdapter>;
function response(config: InternalAxiosRequestConfig, data = reply) {
  return { config, data, status: 200, statusText: "OK", headers: new AxiosHeaders() };
}
beforeEach(() => {
  reply = received;
  api = createAccountDeletionApi("https://isolated.example.test/api///");
  client = jest.mocked(create).mock.results[jest.mocked(create).mock.results.length - 1].value;
  adapter = jest.fn(async config => response(config));
  client.defaults.adapter = adapter;
});

test("usa transporte propio, timeout y base normalizada sin interceptores compartidos", async () => {
  const signal = new AbortController().signal;
  await expect(api.request(accessToken, signal)).resolves.toEqual(received);
  const config = adapter.mock.calls[0][0];
  expect(config.baseURL).toBe("https://isolated.example.test/api/users/account-deletion");
  expect(config.url).toBe("/requests");
  expect(config.method).toBe("post");
  expect(config.timeout).toBe(30000);
  expect(config.signal).toBe(signal);
  expect(config.withCredentials).toBe(false);
  expect(config.headers.get("Authorization")).toBe("Bearer synthetic-access");
  expect(config.headers.get("Content-Type")).toBe("application/json");
  expect(JSON.parse(config.data)).toEqual({});
  expect(axiosClient.post).not.toHaveBeenCalled();
});

test("verifica y confirma con cuerpos exclusivos, sin códigos ni secretos en URL", async () => {
  reply = verified;
  await expect(api.verify(requestId, "012345", accessToken)).resolves.toEqual(verified);
  reply = completed;
  await expect(api.confirm(requestId, confirmationToken, accessToken)).resolves.toEqual(completed);
  const [verify, confirm] = adapter.mock.calls.map(([config]) => config);
  expect(verify.url).toBe(`/requests/${requestId}/verify`);
  expect(JSON.parse(verify.data)).toEqual({ code: "012345" });
  expect(confirm.url).toBe(`/requests/${requestId}/confirm`);
  expect(JSON.parse(confirm.data)).toEqual({ confirmationToken, confirmed: true });
  expect(confirm.headers.get("Authorization")).toBe("Bearer synthetic-access");
  expect(`${verify.url}${confirm.url}`).not.toMatch(/012345|synthetic-access/);
  expect(confirm.url).not.toContain(confirmationToken);
});

test("resultado sólo envía comprobante, sin JWT, cookies ni renovación", async () => {
  reply = completed;
  const signal = new AbortController().signal;
  await expect(api.result(requestId, receiptToken, signal)).resolves.toEqual(completed);
  const config = adapter.mock.calls[0][0];
  expect(config.url).toBe(`/requests/${requestId}/result`);
  expect(JSON.parse(config.data)).toEqual({ receiptToken });
  expect(config.signal).toBe(signal);
  expect(config.headers.get("Authorization")).toBeUndefined();
  expect(config.withCredentials).toBe(false);
  expect(config.url).not.toContain(receiptToken);
  expect(axiosClient.post).not.toHaveBeenCalled();
});

test.each(["", "12345", "1234567", "12 345", "１２３４５６", "12e345"])("código inválido %j se rechaza antes de enviar", async code => {
  await expect(api.verify(requestId, code, accessToken)).rejects.toThrow("INVALID_DELETION_CODE");
  expect(adapter).not.toHaveBeenCalled();
});

test("UUID, credencial o autorización inválidos no alcanzan el transporte", async () => {
  await expect(api.request(" ")).rejects.toThrow("MISSING_DELETION_SESSION");
  await expect(api.verify("../logout", "123456", accessToken)).rejects.toThrow("INVALID_DELETION_REQUEST");
  await expect(api.confirm(requestId, "bad", accessToken)).rejects.toThrow("INVALID_DELETION_AUTHORIZATION");
  await expect(api.confirm("bad", confirmationToken, accessToken)).rejects.toThrow("INVALID_DELETION_REQUEST");
  await expect(api.result("bad", receiptToken)).rejects.toThrow("INVALID_DELETION_REQUEST");
  await expect(api.result(requestId, "a".repeat(42))).rejects.toThrow("INVALID_DELETION_RECEIPT");
  expect(adapter).not.toHaveBeenCalled();
});

test.each([
  null, {}, { ...received, requestId: "bad" }, { ...received, receiptToken: "bad" },
  { ...received, expiresAt: "never" }, { ...received, status: "completed" },
])("solicitud malformada no habilita verificación: %#", async value => {
  reply = value;
  await expect(api.request(accessToken)).rejects.toBeInstanceOf(InvalidDeletionResponse);
});

test.each([
  { ...verified, status: "completed" }, { ...verified, confirmationToken: "bad" },
  ...["irreversible", "endsAllSessions", "newRegistrationIsSeparate"].map(flag => ({ ...verified, consequences: { ...verified.consequences, [flag]: false } })),
  { ...verified, consequences: { ...verified.consequences, retainedCategories: [17] } },
  { ...verified, consequences: { ...verified.consequences, requiresAttention: "yes" } },
  { ...verified, consequences: { ...verified.consequences, retentionPolicy: { basis: "legal", days: 0 } } },
])("consecuencias inválidas nunca habilitan confirmación: %#", async value => {
  reply = value;
  await expect(api.verify(requestId, "123456", accessToken)).rejects.toBeInstanceOf(InvalidDeletionResponse);
});

test.each([
  { ...completed, requestId: otherId }, { ...completed, status: "deleted" },
  { ...completed, notification: "unknown" }, { ...completed, retainedCategories: [null] },
  { ...completed, retention: { until: "never", basis: "legal", identifiersExpired: false } },
  { ...completed, reason: 17 },
])("resultado inválido o ajeno se rechaza incluso tras confirmar: %#", async value => {
  reply = value;
  await expect(api.confirm(requestId, confirmationToken, accessToken)).rejects.toBeInstanceOf(InvalidDeletionResponse);
  await expect(api.result(requestId, receiptToken)).rejects.toBeInstanceOf(InvalidDeletionResponse);
});

test("descarta campos internos de respuestas válidas", async () => {
  reply = { ...received, email: "privado@example.test", code: "123456" };
  expect(await api.request(accessToken)).toEqual(received);
  reply = { ...verified, email: "privado@example.test", consequences: { ...verified.consequences, internal: "secret" } };
  expect(await api.verify(requestId, "123456", accessToken)).toEqual(verified);
  reply = { ...completed, receiptToken, accessToken, password: "private" };
  expect(await api.result(requestId, receiptToken)).toEqual(completed);
});

test.each(["request", "verify", "confirm", "result"] as const)("401 de %s no provoca replay ni refresh", async method => {
  adapter.mockImplementation(async config => { throw new AxiosError("unauthorized", "ERR_BAD_REQUEST", config, undefined, { ...response(config), status: 401 }); });
  const action = { request: () => api.request(accessToken), verify: () => api.verify(requestId, "123456", accessToken),
    confirm: () => api.confirm(requestId, confirmationToken, accessToken), result: () => api.result(requestId, receiptToken) };
  await expect(action[method]()).rejects.toMatchObject({ response: { status: 401 } });
  expect(adapter).toHaveBeenCalledTimes(1);
  expect(axiosClient.post).not.toHaveBeenCalled();
});
