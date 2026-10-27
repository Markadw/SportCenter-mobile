import { useState } from "react";
import { registrationApi } from "../../../api/registrationApi";
import type { FieldErrors } from "../types";
import { emailError, normalizeEmail } from "../validation";
import { useRegistrationRequest } from "./useRegistrationRequest";

interface VerificationForm { email: string; token: string }

export function useVerificationViewModel(initialEmail: string) {
  const [form, setForm] = useState<VerificationForm>({ email: normalizeEmail(initialEmail), token: "" });
  const [errors, setErrors] = useState<FieldErrors<VerificationForm>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const request = useRegistrationRequest();

  function setField(field: keyof VerificationForm, value: string) {
    setForm((previous) => ({ ...previous, [field]: value, ...(field === "email" ? { token: "" } : {}) }));
    setErrors({});
    setNotice(null);
    request.clearError();
  }

  function validate(requireCode: boolean): boolean {
    const nextErrors: FieldErrors<VerificationForm> = {};
    const invalidEmail = emailError(form.email);
    if (invalidEmail) nextErrors.email = invalidEmail;
    if (requireCode && !/^\d{6}$/.test(form.token.trim())) nextErrors.token = "Escribe el código de 6 dígitos.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function verify() {
    if (request.pending || verified || !validate(true)) return;
    setNotice(null);
    await request.run("verify", (signal) => registrationApi.verify(form.email, form.token, signal), () => {
      setForm((previous) => ({ ...previous, token: "" }));
      setVerified(true);
    });
  }

  async function resend() {
    if (request.pending || verified || !validate(false)) return;
    setNotice(null);
    await request.run("resend", (signal) => registrationApi.resend(form.email, signal), () => {
      setForm((previous) => ({ ...previous, token: "" }));
      setErrors({});
      setNotice("Enviamos un código nuevo a tu correo. Revisa también la carpeta de spam; el código anterior deja de servir.");
    });
  }

  return { form, errors, notice, verified, pending: request.pending, error: request.error, setField, verify, resend };
}
