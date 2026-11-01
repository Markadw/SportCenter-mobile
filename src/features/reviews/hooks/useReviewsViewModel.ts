import { useCallback, useEffect, useRef, useState } from "react";
import { reviewsApi } from "../../../api/reviewsApi";
import { useAccountResource } from "../../profile/hooks/useAccountResource";
import { useAccountRequest } from "../../profile/hooks/useAccountRequest";
import { validId } from "../../orders/contract";
import type { ReportForm, ReviewForm } from "../types";
import { validateReport, validateReview } from "../validation";
import { useReviewAuthorPreferences } from "./useReviewAuthorPreferences";
interface Composer {
  scope: string; form: ReviewForm; errors: Partial<Record<keyof ReviewForm, string>>;
  acceptedTerms: boolean; termsError: string | null; published: boolean;
}
interface ReportState {
  scope: string; id: number | null; form: ReportForm; errors: Partial<Record<keyof ReportForm, string>>; receipt: number | null;
}
const emptyComposer = (scope: string): Composer => ({ scope, form: { rating: 0, comment: "" }, errors: {}, acceptedTerms: false, termsError: null, published: false });
const emptyReport = (scope: string): ReportState => ({ scope, id: null, form: { name: "", email: "", reason: "" }, errors: {}, receipt: null });
export function useReviewsViewModel(id: string, accessToken?: string, sessionId?: string) {
  const valid = validId(id), productId = Number(id), scope = (sessionId ?? accessToken ?? "guest") + ":" + id;
  const currentToken = useRef(accessToken);
  useEffect(() => { currentToken.current = accessToken; }, [accessToken]);
  const loader = useCallback((signal: AbortSignal) => reviewsApi.list(productId, signal), [productId]);
  const eligibilityLoader = useCallback((signal: AbortSignal) => reviewsApi.eligibility(currentToken.current!, productId, signal), [productId]);
  const resource = useAccountResource(id, loader, valid), eligibility = useAccountResource(scope, eligibilityLoader, valid && !!accessToken);
  const [composerState, setComposer] = useState(() => emptyComposer(scope)), [reportState, setReportState] = useState(() => emptyReport(scope));
  const preferences = useReviewAuthorPreferences(accessToken, sessionId), blocked = preferences.authors;
  const composer = composerState.scope === scope ? composerState : emptyComposer(scope), reportData = reportState.scope === scope ? reportState : emptyReport(scope);
  const { form, errors, acceptedTerms, termsError, published } = composer;
  const { id: reportId, form: reportForm, errors: reportErrors, receipt } = reportData;
  // La identidad se mantiene al renovar accessToken, pero cambia al entrar en otra sesión o producto.
  const publication = useAccountRequest(scope), report = useAccountRequest(scope);
  function change(key: keyof ReviewForm, value: string | number) {
    setComposer(previous => {
      const base = previous.scope === scope ? previous : emptyComposer(scope);
      return { ...base, form: key === "rating" ? { ...base.form, rating: Number(value) } : { ...base.form, comment: String(value) }, errors: { ...base.errors, [key]: undefined } };
    });
    publication.clearError();
  }
  function changeTerms(accepted: boolean) {
    setComposer(previous => ({ ...(previous.scope === scope ? previous : emptyComposer(scope)), acceptedTerms: accepted, termsError: null }));
  }
  function submit() {
    const token = currentToken.current;
    if (!token || !eligibility.data?.canReview || published) return;
    const next = validateReview(form);
    setComposer(previous => ({ ...(previous.scope === scope ? previous : emptyComposer(scope)), errors: next,
      termsError: acceptedTerms ? null : "Acepta los términos de uso de las reseñas antes de publicar." }));
    if (Object.keys(next).length || !acceptedTerms) return;
    void publication.run(signal => reviewsApi.create(token, productId, form, signal), () => {
      // Registrar primero la confirmación real; después actualizar lista y elegibilidad con el token vigente.
      setComposer({ ...emptyComposer(scope), published: true });
      resource.retry(); eligibility.retry();
    });
  }
  async function blockAuthor(reviewId: number) {
    const author = resource.data?.reviews.find(review => review.id === reviewId)?.authorId;
    if (!author) return;
    const hidden = await preferences.hide(author);
    if (hidden && reportId === reviewId) closeReport();
  }
  const unblockAll = preferences.restoreAll;
  function openReport(reviewId: number) {
    if (!resource.data?.reviews.some(review => review.id === reviewId)) return;
    report.cancel(); report.clearError();
    setReportState(previous => {
      const base = previous.scope === scope ? previous : emptyReport(scope);
      return { ...base, id: reviewId, errors: {}, receipt: null, form: { ...base.form, reason: "" } };
    });
  }
  function closeReport() {
    report.cancel(); report.clearError();
    setReportState(previous => ({ ...(previous.scope === scope ? previous : emptyReport(scope)), id: null, errors: {} }));
  }
  function changeReport(key: keyof ReportForm, value: string) {
    setReportState(previous => {
      const base = previous.scope === scope ? previous : emptyReport(scope);
      return { ...base, form: { ...base.form, [key]: value }, errors: { ...base.errors, [key]: undefined } };
    });
    report.clearError();
  }
  function sendReport() {
    const review = resource.data?.reviews.find(row => row.id === reportId);
    if (!review) return;
    const next = validateReport(reportForm);
    setReportState(previous => ({ ...(previous.scope === scope ? previous : emptyReport(scope)), errors: next }));
    if (Object.keys(next).length) return;
    void report.run(signal => reviewsApi.report(review, reportForm, signal), value => {
      setReportState(previous => {
        const base = previous.scope === scope ? previous : emptyReport(scope);
        return { ...base, receipt: value, id: null, form: { ...base.form, reason: "" } };
      });
    });
  }
  return { valid, resource, eligibility, reviews: resource.data?.reviews.filter(review => !blocked.has(review.authorId)) ?? [],
    form, errors, change, submit, publication, published, acceptedTerms, termsError, changeTerms,
    blockedCount: blocked.size, blockAuthor, unblockAll, preferences,
    reportId, reportForm, reportErrors, changeReport, openReport, closeReport, sendReport, report, receipt };
}
