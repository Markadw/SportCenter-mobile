import { emailError, normalizeEmail } from "../registration/validation";
import { SUPPORT_EMAIL } from "./config";
export interface DeletionForm { name: string; email: string; details: string; confirmed: boolean }
export type DeletionErrors = Partial<Record<keyof DeletionForm, string>>;
export const EMPTY_DELETION_FORM: DeletionForm = { name: "", email: "", details: "", confirmed: false };
export function validateDeletion(form: DeletionForm): DeletionErrors {
  const errors: DeletionErrors = {};
  if (!form.name.trim() || form.name.trim().length > 100) errors.name = "Escribe tu nombre (hasta 100 caracteres).";
  const invalidEmail = emailError(form.email); if (invalidEmail) errors.email = invalidEmail;
  if (form.details.trim().length > 1000) errors.details = "Admite hasta 1000 caracteres.";
  if (!form.confirmed) errors.confirmed = "Confirma que deseas solicitar la eliminación de tu cuenta y sus datos asociados.";
  return errors;
}
export function deletionPayload(form: DeletionForm) {
  return {
    nombre: form.name.trim(), email: normalizeEmail(form.email), asunto: "Solicitud de eliminación de cuenta y datos · Sport Center",
    mensaje: "Solicito la eliminación de mi cuenta de Sport Center y de los datos personales asociados.\nCorreo de la cuenta: " + normalizeEmail(form.email) +
      "\nEntiendo que el equipo debe validar la solicitud y que su recepción no confirma una eliminación." + (form.details.trim() ? "\nInformación adicional: " + form.details.trim() : ""),
  };
}
export function deletionMailto(form: DeletionForm): string {
  const payload = deletionPayload(form);
  return "mailto:" + SUPPORT_EMAIL + "?subject=" + encodeURIComponent(payload.asunto) + "&body=" + encodeURIComponent("Nombre: " + payload.nombre + "\n" + payload.mensaje);
}
