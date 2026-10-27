import { isAxiosError } from "axios";

export class InvalidSessionResponse extends Error {
  constructor() {
    super("No pudimos confirmar una sesión válida. Vuelve a intentarlo.");
  }
}

export function loginErrorMessage(error: unknown): string {
  if (error instanceof InvalidSessionResponse) return error.message;
  if (!isAxiosError(error) || !error.response) {
    return "No pudimos conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.";
  }
  const { status, data } = error.response;
  if (status === 429) return "Has realizado demasiados intentos. Espera un minuto antes de volver a intentarlo.";
  if (status >= 500) return "El servidor no está disponible. Inténtalo más tarde.";
  if (status === 400 && data && typeof data === "object" && data.code === 2) {
    return "Tu cuenta todavía no está verificada. Revisa el correo que recibiste para activarla.";
  }
  if (status === 400 || status === 401) return "El correo o la contraseña no son correctos. Revisa tus datos.";
  return "No se pudo iniciar sesión. Inténtalo de nuevo más tarde.";
}
