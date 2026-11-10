import { TERMS } from "../../features/legal/documents";
import { LegalDocumentScreen } from "../../features/legal/LegalDocumentScreen";

export default function TermsRoute() {
  return <LegalDocumentScreen heading="Términos y condiciones" document={TERMS} />;
}
