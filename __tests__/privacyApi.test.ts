import axiosClient from "../src/api/axios";
import { accountDeletionApi } from "../src/features/privacy/accountDeletionApi";
import { createNecessaryProcessingReceipt } from "../src/features/privacy/consentReceipt";
import { deletionMailto, validateDeletion } from "../src/features/privacy/deletion";
import { PRIVACY_LINKS, SUPPORT_EMAIL } from "../src/features/privacy/config";
jest.mock("../src/api/axios", () => ({ __esModule: true, default: { post: jest.fn() } }));
const form = { name: " Ana ", email: " ANA@Example.com ", details: "Solicitud de baja", confirmed: true };
it("submits a contact request using the actual contract and allowlists its receipt", async () => {
  (axiosClient.post as jest.Mock).mockResolvedValue({ data: { id_mensaje: 17, interno: "secret", email: form.email } });
  const signal = new AbortController().signal;
  const injected = { ...form, id_usuario: 999, rol: 3, passw: "secret" };
  expect(await accountDeletionApi.request(injected, signal)).toEqual({ receiptId: 17 });
  const [path, payload, options] = (axiosClient.post as jest.Mock).mock.calls[0];
  expect(path).toBe("/company/contact"); expect(options).toEqual({ signal });
  expect(Object.keys(payload).sort()).toEqual(["asunto", "email", "mensaje", "nombre"]);
  expect(payload.email).toBe("ana@example.com"); expect(payload.nombre).toBe("Ana");
  expect(payload.asunto).toContain("eliminación de cuenta y datos");
  expect(payload.mensaje).toContain("datos personales asociados");
  expect(payload.mensaje).toContain("su recepción no confirma una eliminación");
});
it("requires a valid name, account email and an explicit unchecked-by-default confirmation", async () => {
  const invalid = { name: "", email: "bad", details: "", confirmed: false };
  expect(Object.keys(validateDeletion(invalid))).toEqual(expect.arrayContaining(["name", "email", "confirmed"]));
  await expect(accountDeletionApi.request(invalid)).rejects.toThrow();
  expect(axiosClient.post).not.toHaveBeenCalled();
});
it.each([{ id_mensaje: "17" }, { id_mensaje: -1 }, { message: "deleted" }, null])("does not infer receipt or deletion from malformed responses: %j", async data => {
  (axiosClient.post as jest.Mock).mockResolvedValue({ data });
  await expect(accountDeletionApi.request(form)).rejects.toThrow();
});
it("creates an encoded email draft for the user-designated support address", () => {
  const email = deletionMailto({ ...form, details: "A & B\nPrueba" });
  expect(email.startsWith("mailto:" + SUPPORT_EMAIL + "?subject=")).toBe(true);
  expect(email).toContain("%26"); expect(decodeURIComponent(email)).toContain("Correo de la cuenta: ana@example.com");
  expect(decodeURIComponent(email)).toContain("Nombre: Ana");
});
it("creates deterministic local receipts scoped to necessary processing without PII or marketing flags", () => {
  const timestamp = Date.UTC(2026, 10, 8);
  const receipt = createNecessaryProcessingReceipt(true, timestamp);
  expect(receipt).toEqual({ accepted: true, scope: "necessary-account-service", noticeVersion: "sport-center-legal-2026-11-08", acceptedAt: "2026-11-08T00:00:00.000Z", privacyUrl: PRIVACY_LINKS.privacy, termsUrl: PRIVACY_LINKS.terms });
  expect(createNecessaryProcessingReceipt(true, timestamp)).toEqual(receipt);
  expect(() => createNecessaryProcessingReceipt(false, timestamp)).toThrow();
  expect(() => createNecessaryProcessingReceipt(true, NaN)).toThrow();
  expect(() => createNecessaryProcessingReceipt(true, -1)).toThrow();
  expect(Object.keys(receipt)).not.toEqual(expect.arrayContaining(["email", "password", "token", "marketing"]));
});
