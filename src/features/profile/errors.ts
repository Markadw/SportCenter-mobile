import { isAxiosError } from "axios";
export function accountErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    if (!error.response) return "No pudimos conectar. Revisa tu conexión y vuelve a intentarlo.";
    if (error.response.status === 401) return "Tu sesión venció. Vuelve a iniciar sesión.";
    if (error.response.status === 403) return "No tienes acceso a esta información.";
    if (error.response.status === 404) return "No encontramos esta información.";
    if (error.response.status === 429) return "Demasiados intentos. Espera un minuto y vuelve a intentarlo.";
    if (error.response.status === 400 || error.response.status === 409) return "No se pudo completar la solicitud. Revisa tus datos; el correo o teléfono pueden estar en uso.";
    return "El servidor no está disponible. Inténtalo más tarde.";
  }
  return "No pudimos completar la solicitud. Vuelve a intentarlo.";
}
