import axiosClient from "./axios";
import { numeric, object, positiveId, text } from "../features/orders/contract";
import type { Review, ReviewsPage, ReviewEligibility, ReviewForm, ReportForm } from "../features/reviews/types";
import { normalizeComment, validateReport, validateReview } from "../features/reviews/validation";
import { normalizeEmail } from "../features/registration/validation";
export function parseReview(data: unknown, fallbackAuthor?: string): Review {
  const value = object(data), rating = numeric(value.calificacion, true);
  if (rating < 1 || rating > 5) throw new Error("Reseña inválida.");
  return { id: positiveId(value.id_review), productId: positiveId(value.id_producto), authorId: positiveId(value.id_usuario),
    author: text(value.usuario, fallbackAuthor), rating, comment: text(value.comentario), date: text(value.fecha) };
}
export function parseReviews(data: unknown, productId: number): ReviewsPage {
  const value = object(data), summary = object(value.summary);
  if (!Array.isArray(value.reviews)) throw new Error("Reseñas inválidas.");
  const reviews = value.reviews.map(row => parseReview(row)), average = numeric(summary.promedio), total = numeric(summary.total, true);
  if (average > 5 || reviews.some(review => review.productId !== productId)) throw new Error("Reseñas inválidas.");
  return { reviews, average, total };
}
export function parseEligibility(data: unknown): ReviewEligibility {
  const value = object(data);
  if (typeof value.canReview !== "boolean" || typeof value.hasDeliveredPurchase !== "boolean" || typeof value.hasReview !== "boolean" ||
    value.canReview !== (value.hasDeliveredPurchase && !value.hasReview)) throw new Error("Elegibilidad inválida.");
  return { canReview: value.canReview, hasDeliveredPurchase: value.hasDeliveredPurchase, hasReview: value.hasReview };
}
export const reviewsApi = {
  async list(productId: number, signal?: AbortSignal): Promise<ReviewsPage> {
    positiveId(productId);
    const { data } = await axiosClient.get<unknown>("/products/reviews/product/" + productId, { signal });
    return parseReviews(data, productId);
  },
  async eligibility(accessToken: string, productId: number, signal?: AbortSignal): Promise<ReviewEligibility> {
    positiveId(productId);
    const { data } = await axiosClient.get<unknown>("/products/reviews/product/" + productId + "/eligibility", { signal, headers: { Authorization: "Bearer " + accessToken } });
    return parseEligibility(data);
  },
  async create(accessToken: string, productId: number, form: ReviewForm, signal?: AbortSignal): Promise<Review> {
    positiveId(productId);
    if (Object.keys(validateReview(form)).length) throw new Error("Revisa tu reseña.");
    const { data } = await axiosClient.post<unknown>("/products/reviews", { id_producto: productId, calificacion: form.rating, comentario: normalizeComment(form.comment) }, { signal, headers: { Authorization: "Bearer " + accessToken } });
    const review = parseReview(data, "Tú");
    if (review.productId !== productId) throw new Error("No pudimos confirmar tu reseña.");
    return review;
  },
  async report(review: Pick<Review, "id" | "productId">, form: ReportForm, signal?: AbortSignal): Promise<number> {
    positiveId(review.id); positiveId(review.productId);
    if (Object.keys(validateReport(form)).length) throw new Error("Revisa los datos del reporte.");
    const { data } = await axiosClient.post<unknown>("/company/contact", {
      nombre: form.name.trim(), email: normalizeEmail(form.email),
      asunto: "Reporte de reseña #" + review.id + " · producto #" + review.productId,
      mensaje: "Reseña #" + review.id + " del producto #" + review.productId + "\nMotivo: " + form.reason.trim(),
    }, { signal });
    return positiveId(object(data).id_mensaje);
  },
};
