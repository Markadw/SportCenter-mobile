import type { Profile } from "../types";
import { normalizeProfile, validateProfile } from "../validation";

/** Puerto que consume el ViewModel; el transporte se decide en la composición de la app. */
export interface ProfileRepository {
  get(accessToken: string, signal?: AbortSignal): Promise<Profile>;
  update(accessToken: string, form: Profile, signal?: AbortSignal): Promise<Profile>;
}

interface ProfileRequestConfig {
  signal?: AbortSignal;
  headers: { Authorization: string };
}

/** El adaptador sólo necesita respuestas desconocidas, sin acoplar el dominio a Axios. */
export interface ProfileTransport {
  get(url: string, config: ProfileRequestConfig): Promise<{ data: unknown }>;
  patch(url: string, payload: Profile, config: ProfileRequestConfig): Promise<{ data: unknown }>;
}

export function parseProfile(data: unknown): Profile {
  if (!data || typeof data !== "object") throw new Error("No pudimos leer tu perfil.");
  const value = data as Record<string, unknown>;
  const result: Profile = { nombre: "", aPaterno: "", aMaterno: "", email: "", telefono: "" };
  for (const key of Object.keys(result) as (keyof Profile)[]) {
    // El contrato permite NULL sólo en estos datos de contacto; el editor los muestra para completarlos.
    if ((key === "telefono" || key === "email") && value[key] === null) { result[key] = ""; continue; }
    if (typeof value[key] !== "string") throw new Error("No pudimos leer tu perfil.");
    result[key] = value[key];
  }
  return result;
}

/** Factory: cada instancia conserva su propio transporte, sin estado ni cliente global. */
export function createProfileRepository(transport: ProfileTransport): ProfileRepository {
  return {
    async get(accessToken, signal) {
      const { data } = await transport.get("/users/profile", { signal, headers: { Authorization: "Bearer " + accessToken } });
      return parseProfile(data);
    },
    async update(accessToken, form, signal) {
      const payload = normalizeProfile(form);
      if (Object.keys(validateProfile(payload)).length) throw new Error("Revisa los datos del perfil.");
      const { data } = await transport.patch("/users/update-profile", payload, { signal, headers: { Authorization: "Bearer " + accessToken } });
      if (!data || typeof data !== "object" || !("user" in data)) throw new Error("No pudimos confirmar la actualización.");
      return parseProfile(data.user);
    },
  };
}
