import { PRIVACY } from "../../features/legal/documents";
import { LegalDocumentScreen } from "../../features/legal/LegalDocumentScreen";

export default function PrivacyNoticeRoute() {
  return <LegalDocumentScreen heading="Política de privacidad" document={PRIVACY} />;
}
