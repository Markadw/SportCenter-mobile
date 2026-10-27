import { UnconfirmedResponseError } from "../features/registration/errors";
import type { RegistrationPayload, RegistrationReceipt } from "../features/registration/types";
import { normalizeEmail } from "../features/registration/validation";
import axiosClient from "./axios";
import { ENDPOINTS } from "./endpoints";

// Render puede arrancar en frío. No se reintentan automáticamente los POST.
const REQUEST_TIMEOUT = 45000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function confirmMessage(path: string, body: object, expected: string, signal?: AbortSignal): Promise<void> {
  const { data } = await axiosClient.post<unknown>(path, body, { timeout: REQUEST_TIMEOUT, signal });
  if (!isRecord(data) || data.message !== expected) throw new UnconfirmedResponseError();
}

export const registrationApi = {
  async register(payload: RegistrationPayload, signal?: AbortSignal): Promise<RegistrationReceipt> {
    // Lista explícita: confirmación de contraseña, rol y estado nunca se envían.
    const body: RegistrationPayload = {
      nombre: payload.nombre.trim(),
      aPaterno: payload.aPaterno.trim(),
      aMaterno: payload.aMaterno.trim(),
      email: normalizeEmail(payload.email),
      telefono: payload.telefono.trim(),
      passw: payload.passw,
    };
    const { data } = await axiosClient.post<unknown>(ENDPOINTS.registration.create, body, {
      timeout: REQUEST_TIMEOUT, signal,
    });
    if (!isRecord(data) || typeof data.id_usuario !== "number" || !Number.isInteger(data.id_usuario) ||
        data.id_usuario <= 0 || typeof data.email !== "string" || normalizeEmail(data.email) !== body.email) {
      throw new UnconfirmedResponseError();
    }
    // El backend devuelve más datos del usuario. Descartar hash y código de
    // verificación; confirmar usando únicamente el código del correo.
    return { email: body.email };
  },

  verify(email: string, token: string, signal?: AbortSignal): Promise<void> {
    return confirmMessage(ENDPOINTS.registration.verify, { email: normalizeEmail(email), token: token.trim() },
      "Cuenta verificada correctamente.", signal);
  },

  resend(email: string, signal?: AbortSignal): Promise<void> {
    return confirmMessage(ENDPOINTS.registration.resend, { email: normalizeEmail(email) },
      "Codigo enviado correctamente. Revise su bandeja de entrada.", signal);
  },
};
