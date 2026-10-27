import { useRouter } from "expo-router";
import { useState } from "react";
import { registrationApi } from "../../../api/registrationApi";
import type { FieldErrors, RegistrationForm } from "../types";
import { normalizeEmail, registrationPayload, validateRegistration } from "../validation";
import { useRegistrationRequest } from "./useRegistrationRequest";

const EMPTY_FORM: RegistrationForm = {
  nombre: "", aPaterno: "", aMaterno: "", email: "", telefono: "", passw: "", confirmPassword: "",
};

export function useRegisterViewModel() {
  const router = useRouter();
  const [form, setForm] = useState<RegistrationForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors<RegistrationForm>>({});
  const request = useRegistrationRequest();

  function setField(field: keyof RegistrationForm, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    request.clearError();
  }

  async function submit() {
    if (request.pending) return;
    const nextErrors = validateRegistration(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    await request.run("register", (signal) => registrationApi.register(registrationPayload(form), signal), (receipt) => {
      setForm(EMPTY_FORM);
      router.replace({ pathname: "/verify-email", params: { email: receipt.email } });
    });
  }

  function resumeVerification() {
    if (request.pending) return;
    const email = normalizeEmail(form.email);
    setForm(EMPTY_FORM);
    router.replace({ pathname: "/verify-email", params: email ? { email } : {} });
  }

  return { form, errors, setField, submit, resumeVerification, pending: request.pending !== null, error: request.error };
}
