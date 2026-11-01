import { NECESSARY_PROCESSING_NOTICE_VERSION, PRIVACY_LINKS } from "./config";
export interface NecessaryProcessingReceipt {
  accepted: true;
  scope: "necessary-account-service";
  noticeVersion: string;
  acceptedAt: string;
  privacyUrl: string;
  termsUrl: string;
}
// Recibo local sin identificadores personales. El llamador controla fecha y persistencia.
// No constituye consentimiento de marketing ni prueba de registro en el servidor.
export function createNecessaryProcessingReceipt(accepted: boolean, timestamp: number): NecessaryProcessingReceipt {
  if (!accepted) throw new Error("Se requiere aceptación explícita del tratamiento necesario.");
  if (!Number.isSafeInteger(timestamp) || timestamp <= 0 || Number.isNaN(new Date(timestamp).getTime())) throw new Error("Fecha de aceptación inválida.");
  return {
    accepted: true, scope: "necessary-account-service", noticeVersion: NECESSARY_PROCESSING_NOTICE_VERSION,
    acceptedAt: new Date(timestamp).toISOString(), privacyUrl: PRIVACY_LINKS.privacy, termsUrl: PRIVACY_LINKS.terms,
  };
}
