import { useState } from "react";
import * as Linking from "expo-linking";
import { useAccountRequest } from "../../profile/hooks/useAccountRequest";
import { accountDeletionApi } from "../accountDeletionApi";
import { PRIVACY_LINKS } from "../config";
import { deletionMailto, EMPTY_DELETION_FORM, validateDeletion, type DeletionErrors, type DeletionForm } from "../deletion";
export function usePrivacyViewModel() {
  const [form, setForm] = useState<DeletionForm>(EMPTY_DELETION_FORM), [errors, setErrors] = useState<DeletionErrors>({});
  const [receiptId, setReceiptId] = useState<number | null>(null), [notice, setNotice] = useState<string | null>(null);
  const request = useAccountRequest(), external = useAccountRequest();
  function change(key: keyof DeletionForm, value: string | boolean) {
    setForm(previous => key === "confirmed" ? { ...previous, confirmed: value === true } : { ...previous, [key]: String(value) });
    setErrors(previous => ({ ...previous, [key]: undefined })); setReceiptId(null); setNotice(null); request.clearError(); external.clearError();
  }
  function check() { const next = validateDeletion(form); setErrors(next); return !Object.keys(next).length; }
  function submit() {
    if (!check()) return;
    setNotice(null);
    void request.run(signal => accountDeletionApi.request(form, signal), value => {
      setReceiptId(value.receiptId); setForm(EMPTY_DELETION_FORM); setErrors({});
    });
  }
  function prepareEmail() {
    if (!check() || request.pending) return;
    setNotice(null);
    void external.run(() => Linking.openURL(deletionMailto(form)), () => {
      setNotice("Se abrió tu aplicación de correo. Revisa y envía el mensaje; abrirlo no confirma su envío ni la eliminación de la cuenta.");
    });
  }
  function openLegal(kind: keyof typeof PRIVACY_LINKS) {
    setNotice(null); void external.run(() => Linking.openURL(PRIVACY_LINKS[kind]), () => {});
  }
  function cancel() {
    request.cancel();
    setNotice("Cancelaste la espera. La solicitud podría haberse recibido; consulta a soporte antes de reenviarla.");
  }
  return {
    form, errors, receiptId, notice, change, submit, prepareEmail, openLegal, cancel, pending: request.pending, opening: external.pending,
    error: request.error ? "No pudimos confirmar la recepción de tu solicitud. Puedes reintentar o preparar un correo a soporte." : null,
    linkError: external.error ? "No se pudo abrir el enlace. Usa la dirección o el correo que aparece en esta pantalla." : null,
  };
}
