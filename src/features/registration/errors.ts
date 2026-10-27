import { isAxiosError } from "axios";
import type { RegistrationOperation } from "./types";
import { PASSWORD_HELP } from "./validation";

// Solo mensajes conocidos del contrato; los errores del proveedor de correo
// pueden contener detalles internos y no deben trasladarse a la pantalla.
const SAFE_MESSAGES = new Map([
  ["Revisa que tu información sea correcta. Intenta de nuevo", "Revisa que tu información sea correcta. Intenta de nuevo."],
  ["El correo es obligatorio", "Escribe tu correo."],
  ["El correo no tiene un formato válido", "Escribe un correo válido."],
  ["El telefono es obligatorio", "Escribe tu teléfono."],
  ["El telefono debe tener exactamente 10 dígitos numéricos.", "El teléfono debe tener exactamente 10 dígitos."],
  ["El código es obligatorio", "Escribe el código que recibiste por correo."],
  ["El código debe tener 6 dígitos", "El código debe tener 6 dígitos."],
  ["El token ha expirado, solicita uno nuevo.", "El código venció. Solicita uno nuevo."],
  ["Se han agotado los intentos. Solicita un nuevo token.", "Se agotaron los intentos. Solicita un código nuevo."],
  ["Has agotado los intentos. Solicita un nuevo token.", "Se agotaron los intentos. Solicita un código nuevo."],
  ["Todos los campos son obligatorios", "Completa todos los campos obligatorios."],
  ["La contraseña debe tener mínimo 12 caracteres, una mayúscula, una minúscula, un número y un carácter especial (!#$%&¿?@*_-/), y sin recuencias(123)", PASSWORD_HELP],
]);

export class UnconfirmedResponseError extends Error {}

export function registrationErrorMessage(error: unknown, operation: RegistrationOperation): string {
  const uncertain = operation === "register"
    ? "No pudimos confirmar el registro. Revisa tu correo; si recibiste un código, usa «Ya tengo un código». Si no, comprueba tu conexión antes de reintentar."
    : operation === "verify"
      ? "No pudimos confirmar la verificación. Comprueba tu conexión y vuelve a intentarlo."
      : "No pudimos confirmar el reenvío. Revisa tu correo antes de volver a solicitarlo.";
  if (!isAxiosError(error) || !error.response) return uncertain;
  if (error.response.status === 429) return "Has realizado demasiados intentos. Espera un minuto antes de volver a intentarlo.";
  if (error.response.status >= 500) return uncertain;

  const data: unknown = error.response.data;
  const message = data && typeof data === "object" && "message" in data ? data.message : undefined;
  const messages = Array.isArray(message) ? message : [message];
  const safe: string[] = [];
  for (const value of messages) {
    if (typeof value !== "string") continue;
    if (operation === "register" && value === "Revisa que tu información sea correcta. Intenta de nuevo") {
      safe.push("Ya existe una cuenta con ese correo o teléfono. Si aún no verificaste tu cuenta, usa «Ya tengo un código».");
      continue;
    }
    if (operation === "register" && value.startsWith("Revisa que tu información sea correcta. Intenta de nuevo 1.")) {
      safe.push("El servidor no pudo enviar el correo de verificación. Inténtalo más tarde.");
      continue;
    }
    const mapped = SAFE_MESSAGES.get(value);
    if (mapped) safe.push(mapped);
    const remaining = /^El token es incorrecto\. Te quedan ([12]) intentos\.$/.exec(value);
    if (remaining) safe.push("Código incorrecto. Intentos restantes: " + remaining[1] + ".");
  }
  if (safe.length) return [...new Set(safe)].join("\n");
  return operation === "register"
    ? "No se pudo completar el registro. Revisa tus datos e inténtalo de nuevo. Si el problema continúa, solicita ayuda a la tienda."
    : "No se pudo completar la solicitud. Revisa el correo y el código; puedes solicitar uno nuevo.";
}
