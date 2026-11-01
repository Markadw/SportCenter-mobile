import axiosClient from "./axios";
import { emailError, normalizeEmail } from "../features/registration/validation";
import { recoveryPayload, validateRecovery, type RecoveryForm } from "../features/passwordRecovery/validation";
function confirmResponse(data: unknown) {
  if (!data || typeof data !== "object" || !("message" in data) || typeof data.message !== "string" || !data.message.trim()) throw new Error("No pudimos confirmar la solicitud.");
}
export const passwordRecoveryApi = {
  async requestCode(email: string, signal?: AbortSignal): Promise<void> {
    if (emailError(email)) throw new Error("Escribe un correo válido.");
    const { data } = await axiosClient.post<unknown>("/users/verify-user-email", { email: normalizeEmail(email) }, { signal });
    confirmResponse(data);
  },
  async reset(form: RecoveryForm, signal?: AbortSignal): Promise<void> {
    if (Object.keys(validateRecovery(form, true)).length) throw new Error("Revisa los datos de recuperación.");
    // reset-psw valida y consume el código; verify-user-token lo consumiría antes.
    const { data } = await axiosClient.post<unknown>("/users/reset-psw", recoveryPayload(form), { signal });
    confirmResponse(data);
  },
};
