import type { LoginCredentials, LoginFieldErrors } from "./types";

export function normalizeLogin(values: LoginCredentials): LoginCredentials {
  return { email: values.email.trim().toLowerCase(), passw: values.passw };
}

export function validateLogin(values: LoginCredentials): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const email = values.email.trim();
  if (!email) errors.email = "Escribe tu correo.";
  else if (email.length > 100 || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    errors.email = "Escribe un correo válido.";
  }
  if (!values.passw.trim()) errors.passw = "Escribe tu contraseña.";
  else if (values.passw.length < 8) errors.passw = "La contraseña debe tener al menos 8 caracteres.";
  return errors;
}
