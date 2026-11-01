import { createProfileRepository, type ProfileTransport } from "../src/features/profile/repositories/ProfileRepository";
import type { Profile } from "../src/features/profile/types";

// Si el repositorio llegara a depender del singleton, la prueba fallaría al cargarlo.
jest.mock("../src/api/axios", () => { throw new Error("El repositorio inyectado no debe usar Axios global."); });
const profile: Profile = { nombre: "Ana", aPaterno: "López", aMaterno: "García", email: "ana@example.com", telefono: "5512345678" };
function transport(data: unknown): jest.Mocked<ProfileTransport> {
  return { get: jest.fn().mockResolvedValue({ data }), patch: jest.fn().mockResolvedValue({ data: { user: data } }) };
}

test("dos repositorios mantienen aislados sus clientes y credenciales sin usar el singleton", async () => {
  const firstClient = transport(profile);
  const other = { ...profile, nombre: "Luis", email: "luis@example.com" };
  const secondClient = transport(other);
  const first = createProfileRepository(firstClient), second = createProfileRepository(secondClient);
  const firstSignal = new AbortController().signal, secondSignal = new AbortController().signal;
  const [firstProfile, secondProfile] = await Promise.all([first.get("token-ana", firstSignal), second.get("token-luis", secondSignal)]);
  expect(firstProfile).toEqual(profile);
  expect(secondProfile).toEqual(other);
  expect(firstClient.get).toHaveBeenCalledTimes(1);
  expect(firstClient.get).toHaveBeenCalledWith("/users/profile", { signal: firstSignal, headers: { Authorization: "Bearer token-ana" } });
  expect(secondClient.get).toHaveBeenCalledTimes(1);
  expect(secondClient.get).toHaveBeenCalledWith("/users/profile", { signal: secondSignal, headers: { Authorization: "Bearer token-luis" } });
  await first.update("token-ana", profile);
  expect(firstClient.patch).toHaveBeenCalledTimes(1);
  expect(secondClient.patch).not.toHaveBeenCalled();
});

test("la factory conserva el DTO de cinco campos y no propaga roles, IDs o datos internos", async () => {
  const client = transport({ ...profile, rol: 3, id_usuario: 99, passw: "secreto" });
  const repository = createProfileRepository(client);
  const form = { ...profile, email: " ANA@EXAMPLE.COM ", rol: 3, id_usuario: 99 };
  const signal = new AbortController().signal;
  expect(await repository.update("token", form, signal)).toEqual(profile);
  expect(client.patch).toHaveBeenCalledWith("/users/update-profile", profile, { signal, headers: { Authorization: "Bearer token" } });
  expect(form.email).toBe(" ANA@EXAMPLE.COM ");
  expect(form.rol).toBe(3);
});

test.each([null, {}, { ...profile, nombre: null }, { ...profile, telefono: 0 }])(
  "una respuesta desconocida malformada falla sin fabricar datos: %#", async (data) => {
    const client = transport(data);
    const repository = createProfileRepository(client);
    await expect(repository.get("token")).rejects.toThrow("No pudimos leer tu perfil.");
    await expect(repository.update("token", profile)).rejects.toThrow("No pudimos leer tu perfil.");
  },
);

test("mantiene los nulls de contacto editables y rechaza actualizaciones inválidas antes del transporte", async () => {
  const client = transport({ ...profile, telefono: null, email: null });
  const repository = createProfileRepository(client);
  expect(await repository.get("token")).toEqual({ ...profile, telefono: "", email: "" });
  await expect(repository.update("token", { ...profile, telefono: "123" })).rejects.toThrow("Revisa los datos del perfil.");
  expect(client.patch).not.toHaveBeenCalled();
});

test("una confirmación sin user válido no acredita una actualización", async () => {
  const client = transport(profile);
  client.patch.mockResolvedValueOnce({ data: { message: "ok", ...profile } });
  await expect(createProfileRepository(client).update("token", profile)).rejects.toThrow("No pudimos confirmar la actualización.");
});
