import { emailError, normalizeEmail } from "../registration/validation";
import type { Profile, ProfileErrors } from "./types";
export function normalizeProfile(form: Profile): Profile {
  return { nombre: form.nombre.trim(), aPaterno: form.aPaterno.trim(), aMaterno: form.aMaterno.trim(), email: normalizeEmail(form.email), telefono: form.telefono.trim() };
}
export function validateProfile(form: Profile): ProfileErrors {
  const data = normalizeProfile(form), errors: ProfileErrors = {};
  for (const [key, max] of [["nombre", 30], ["aPaterno", 40], ["aMaterno", 40]] as const) {
    if (!data[key]) errors[key] = "Este campo es obligatorio.";
    else if (data[key].length > max) errors[key] = "Admite hasta " + max + " caracteres.";
  }
  const invalidEmail = emailError(data.email);
  if (invalidEmail) errors.email = invalidEmail;
  if (!/^\d{10}$/.test(data.telefono)) errors.telefono = "Escribe los 10 dígitos de tu teléfono.";
  return errors;
}
