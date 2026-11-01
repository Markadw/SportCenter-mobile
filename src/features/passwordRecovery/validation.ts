import { emailError, normalizeEmail, PASSWORD_HELP } from "../registration/validation";
export interface RecoveryForm { email: string; token: string; psw: string; confirmation: string }
export type RecoveryErrors = Partial<Record<keyof RecoveryForm, string>>;
export function validateRecovery(form: RecoveryForm, reset: boolean): RecoveryErrors {
  const errors: RecoveryErrors = {}, invalidEmail = emailError(form.email);
  if (invalidEmail) errors.email = invalidEmail;
  if (reset) {
    if (!/^\d{6}$/.test(form.token.trim())) errors.token = "Escribe los 6 dígitos del código.";
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!#$%&¿?@*_/-])[A-Za-z\d!#$%&¿?@*_/-]{12,}$/.test(form.psw)) errors.psw = PASSWORD_HELP;
    if (!form.confirmation || form.confirmation !== form.psw) errors.confirmation = "Las contraseñas no coinciden.";
  }
  return errors;
}
export function recoveryPayload(form: RecoveryForm) {
  return { email: normalizeEmail(form.email), psw: form.psw, token: form.token.trim() };
}
