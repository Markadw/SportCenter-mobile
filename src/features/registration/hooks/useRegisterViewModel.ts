import { useRouter } from "expo-router";
import { useState } from "react";
import { registrationApi } from "../../../api/registrationApi";
import { createNecessaryProcessingReceipt } from "../../privacy/consentReceipt";
import { ConsentReceiptStorageError, consentReceiptStorage } from "../../privacy/consentReceiptStorage";
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
  const [necessaryProcessingAccepted, setAccepted] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const request = useRegistrationRequest();

  function setField(field: keyof RegistrationForm, value: string) {
    if (request.pending) return;
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setConsentError(null);
    setStorageError(null);
    request.clearError();
  }

  function setNecessaryProcessingAccepted(accepted: boolean) {
    if (request.pending) return;
    setAccepted(accepted);
    setConsentError(null);
    setStorageError(null);
    request.clearError();
  }

  function reset() {
    setForm(EMPTY_FORM);
    setErrors({});
    setAccepted(false);
    setConsentError(null);
    setStorageError(null);
  }

  async function submit() {
    if (request.pending) return;
    const nextErrors = validateRegistration(form);
    setErrors(nextErrors);
    setConsentError(null);
    setStorageError(null);
    request.clearError();
    if (Object.keys(nextErrors).length) return;
    if (!necessaryProcessingAccepted) {
      setConsentError("Acepta el tratamiento necesario para crear y gestionar tu cuenta.");
      return;
    }
    const acceptance = createNecessaryProcessingReceipt(true, Date.now());
    const payload = registrationPayload(form);
    await request.run("register", async (signal) => {
      try { await consentReceiptStorage.save(acceptance, signal); }
      catch {
        if (!signal.aborted) setStorageError(new ConsentReceiptStorageError().message);
        throw new ConsentReceiptStorageError();
      }
      return registrationApi.register(payload, signal);
    }, (receipt) => {
      reset();
      router.replace({ pathname: "/verify-email", params: { email: receipt.email } });
    });
  }

  function resumeVerification() {
    if (request.pending) return;
    const email = normalizeEmail(form.email);
    reset();
    router.replace({ pathname: "/verify-email", params: email ? { email } : {} });
  }

  return {
    form, errors, setField, submit, resumeVerification, necessaryProcessingAccepted,
    setNecessaryProcessingAccepted, consentError, pending: request.pending !== null,
    error: storageError ?? request.error,
  };
}
