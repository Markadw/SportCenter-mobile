import type { FieldErrors, RegistrationForm, RegistrationPayload } from "./types";

const EMAIL = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
// Mismo conjunto de caracteres y reglas que user-account.service del backend.
const PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!#$%&¿?@*_/-])[A-Za-z\d!#$%&¿?@*_/-]{12,}$/;

export const PASSWORD_HELP =
  "Usa al menos 12 caracteres, mayúscula, minúscula, número y un símbolo de esta lista: ! # $ % & ¿ ? @ * _ / - (sin espacios).";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailError(email: string): string | undefined {
  if (!email.trim()) return "Escribe tu correo.";
  if (!EMAIL.test(normalizeEmail(email))) return "Escribe un correo válido.";
  if (normalizeEmail(email).length > 100) return "El correo admite hasta 100 caracteres.";
}

export function registrationPayload(form: RegistrationForm): RegistrationPayload {
  return {
    nombre: form.nombre.trim(),
    aPaterno: form.aPaterno.trim(),
    aMaterno: form.aMaterno.trim(),
    email: normalizeEmail(form.email),
    telefono: form.telefono.trim(),
    passw: form.passw,
  };
}

export function validateRegistration(form: RegistrationForm): FieldErrors<RegistrationForm> {
  const errors: FieldErrors<RegistrationForm> = {};
  const data = registrationPayload(form);
  const names = [
    ["nombre", 30, "nombre"],
    ["aPaterno", 40, "apellido paterno"],
    ["aMaterno", 40, "apellido materno"],
  ] as const;
  for (const [key, limit, label] of names) {
    if (!data[key]) errors[key] = "Escribe tu " + label + ".";
    else if (data[key].length > limit) errors[key] = "El " + label + " admite hasta " + limit + " caracteres.";
  }
  const invalidEmail = emailError(data.email);
  if (invalidEmail) errors.email = invalidEmail;
  if (!/^\d{10}$/.test(data.telefono)) errors.telefono = "Escribe los 10 dígitos de tu teléfono, sin espacios ni prefijo.";
  if (!PASSWORD.test(data.passw)) errors.passw = PASSWORD_HELP;
  if (!form.confirmPassword) errors.confirmPassword = "Confirma tu contraseña.";
  else if (form.confirmPassword !== form.passw) errors.confirmPassword = "Las contraseñas no coinciden.";
  return errors;
}
