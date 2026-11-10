import { isAxiosError } from "axios";
import { PASSWORD_HELP } from "../registration/validation";

/** Error conocido de `/users/reset-psw` traducido a un texto seguro y al paso donde se corrige. */
export interface ResetIssue { message: string; step: "code" | "password" }

const exact: Record<string, ResetIssue> = {
  "El token ha expirado. Solicita uno nuevo.": { message: "El código expiró. Solicita uno nuevo.", step: "code" },
  "Se han agotado los intentos. Solicita un nuevo token.": { message: "Se agotaron los intentos. Solicita un código nuevo.", step: "code" },
  "Has agotado los intentos. Solicita un nuevo token.": { message: "Se agotaron los intentos. Solicita un código nuevo.", step: "code" },
  "No hay un token válido asociado a este usuario. Solicita uno nuevo.": { message: "No hay un código vigente para este correo. Solicita uno nuevo.", step: "code" },
  "El token debe tener 6 dígitos.": { message: "Escribe los 6 dígitos del código.", step: "code" },
  "La nueva contraseña no puede ser igual a la actual.": { message: "La nueva contraseña no puede ser igual a la actual.", step: "password" },
};

// Sólo se muestran mensajes de esta lista; cualquier otro texto del servidor se descarta.
export function resetIssue(cause: unknown): ResetIssue | null {
  if (!isAxiosError(cause) || cause.response?.status !== 400) return null;
  const raw = (cause.response.data as { message?: unknown } | undefined)?.message;
  for (const value of Array.isArray(raw) ? raw : [raw]) {
    if (typeof value !== "string") continue;
    if (exact[value]) return exact[value];
    const remaining = /^El token es incorrecto\. Te quedan ([12]) intentos\.$/.exec(value);
    if (remaining) return { message: "Código incorrecto. Intentos restantes: " + remaining[1] + ".", step: "code" };
    if (value.startsWith("La contraseña debe tener mínimo 12 caracteres")) return { message: PASSWORD_HELP, step: "password" };
  }
  return null;
}
