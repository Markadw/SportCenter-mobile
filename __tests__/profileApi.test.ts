import axiosClient from "../src/api/axios";
import { profileApi, parseProfile } from "../src/api/profileApi";
import { validateProfile } from "../src/features/profile/validation";
jest.mock("../src/api/axios", () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn() } }));
const profile = { nombre: "Ana", aPaterno: "López", aMaterno: "García", email: "ana@example.com", telefono: "5512345678" };
it("excludes internal fields from profile and authenticates the request", async () => {
  (axiosClient.get as jest.Mock).mockResolvedValue({ data: { ...profile, passw: "secret", rol: 3, token_verificacion: "123456" } });
  const signal = new AbortController().signal;
  expect(await profileApi.get("session-token", signal)).toEqual(profile);
  expect(axiosClient.get).toHaveBeenCalledWith("/users/profile", { signal, headers: { Authorization: "Bearer session-token" } });
});
it("sends only editable fields and parses the real update envelope", async () => {
  (axiosClient.patch as jest.Mock).mockResolvedValue({ data: { user: { ...profile, rol: 3 }, message: "ok" } });
  const injected = { ...profile, email: " Ana@Example.com ", rol: 3, id_usuario: 99 };
  expect(await profileApi.update("token", injected)).toEqual(profile);
  expect(axiosClient.patch).toHaveBeenCalledWith("/users/update-profile", profile, expect.objectContaining({ headers: { Authorization: "Bearer token" } }));
});
it("rejects malformed responses and invalid updates before sending", async () => {
  expect(() => parseProfile({ nombre: "Ana" })).toThrow();
  expect(validateProfile({ ...profile, telefono: "123", email: "bad" })).toEqual(expect.objectContaining({ telefono: expect.any(String), email: expect.any(String) }));
  await expect(profileApi.update("token", { ...profile, nombre: "" })).rejects.toThrow();
  expect(axiosClient.patch).not.toHaveBeenCalled();
});

it("maps only nullable contact columns to editable empty strings", async () => {
  (axiosClient.get as jest.Mock).mockResolvedValue({ data: { ...profile, telefono: null, email: null } });
  expect(await profileApi.get("token")).toEqual({ ...profile, telefono: "", email: "" });
});
it.each(["nombre", "aPaterno", "aMaterno"])("does not infer a value for non-nullable profile field %s", key => {
  expect(() => parseProfile({ ...profile, [key]: null })).toThrow();
});
it.each([0, false, undefined])("does not coerce malformed phone values %j into NULL or blank", telefono => {
  expect(() => parseProfile({ ...profile, telefono })).toThrow();
});
