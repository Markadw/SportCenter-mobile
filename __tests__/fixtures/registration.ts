import type { RegistrationForm } from "../../src/features/registration/types";

// Datos ficticios, exclusivamente para transporte simulado.
export const registrationForm: RegistrationForm = {
  nombre: "María", aPaterno: "López", aMaterno: "Pérez",
  email: "cliente@example.test", telefono: "7711234567",
  passw: "Deporte2026!A", confirmPassword: "Deporte2026!A",
};

export function httpError(message: unknown, status = 400) {
  return { isAxiosError: true, response: { status, data: { message } } };
}
