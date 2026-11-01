import axiosClient from "../../api/axios";
import { deletionPayload, validateDeletion, type DeletionForm } from "./deletion";
export interface DeletionReceipt { receiptId: number }
export const accountDeletionApi = {
  async request(form: DeletionForm, signal?: AbortSignal): Promise<DeletionReceipt> {
    if (Object.keys(validateDeletion(form)).length) throw new Error("Revisa los datos de la solicitud.");
    // company/contact registra un mensaje para atención. No elimina ni desactiva cuentas.
    const { data } = await axiosClient.post<unknown>("/company/contact", deletionPayload(form), { signal });
    if (!data || typeof data !== "object" || Array.isArray(data) || !("id_mensaje" in data) || typeof data.id_mensaje !== "number" || !Number.isSafeInteger(data.id_mensaje) || data.id_mensaje <= 0) {
      throw new Error("No pudimos confirmar un folio de recepción.");
    }
    return { receiptId: data.id_mensaje };
  },
};
