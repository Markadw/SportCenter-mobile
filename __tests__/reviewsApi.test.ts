import axiosClient from "../src/api/axios";
import { reviewsApi, parseEligibility, parseReviews } from "../src/api/reviewsApi";
import { validateReview } from "../src/features/reviews/validation";
jest.mock("../src/api/axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const review = { id_review: 3, id_producto: 2, id_usuario: 9, usuario: "Ana", calificacion: 5, comentario: "Producto excelente", fecha: "2026-01-01" };
it("reads the public summary and only allowed review fields", async () => {
  (axiosClient.get as jest.Mock).mockResolvedValue({ data: { reviews: [{ ...review, email: "secret", passw: "secret" }], summary: { total: 1, promedio: 5 } } });
  const result = await reviewsApi.list(2);
  expect(result).toEqual({ reviews: [{ id: 3, productId: 2, authorId: 9, author: "Ana", rating: 5, comment: "Producto excelente", date: "2026-01-01" }], total: 1, average: 5 });
  expect(axiosClient.get).toHaveBeenCalledWith("/products/reviews/product/2", expect.any(Object));
});
it("uses server eligibility and rejects contradictory eligibility", async () => {
  (axiosClient.get as jest.Mock).mockResolvedValue({ data: { canReview: false, hasDeliveredPurchase: false, hasReview: false, reason: "internal" } });
  expect(await reviewsApi.eligibility("token", 2)).toEqual({ canReview: false, hasDeliveredPurchase: false, hasReview: false });
  expect(axiosClient.get).toHaveBeenCalledWith("/products/reviews/product/2/eligibility", expect.objectContaining({ headers: { Authorization: "Bearer token" } }));
  expect(() => parseEligibility({ canReview: true, hasDeliveredPurchase: false, hasReview: false })).toThrow();
});
it("posts review using authenticated user rather than client author identity", async () => {
  (axiosClient.post as jest.Mock).mockResolvedValue({ data: review });
  await reviewsApi.create("token", 2, { rating: 5, comment: "  Producto   excelente  " });
  expect(axiosClient.post).toHaveBeenCalledWith("/products/reviews", { id_producto: 2, calificacion: 5, comentario: "Producto excelente" }, expect.objectContaining({ headers: { Authorization: "Bearer token" } }));
});
it("matches comment and rating restrictions before posting", async () => {
  for (const form of [{ rating: 0, comment: "Producto excelente" }, { rating: 5, comment: "corto" }, { rating: 5, comment: "<script>malicioso</script>" }, { rating: 5, comment: "Producto excelente; hola" }]) {
    expect(Object.keys(validateReview(form)).length).toBeGreaterThan(0);
    await expect(reviewsApi.create("token", 2, form)).rejects.toThrow();
  }
  expect(axiosClient.post).not.toHaveBeenCalled();
});
it("sends reports to actual contact schema with a verified review reference", async () => {
  (axiosClient.post as jest.Mock).mockResolvedValue({ data: { id_mensaje: 12, interno: "secret" } });
  const signal = new AbortController().signal;
  expect(await reviewsApi.report({ id: 3, productId: 2 }, { name: " Ana ", email: " ANA@example.com ", reason: "Contenido ofensivo en la reseña" }, signal)).toBe(12);
  expect(axiosClient.post).toHaveBeenCalledWith("/company/contact", { nombre: "Ana", email: "ana@example.com", asunto: "Reporte de reseña #3 · producto #2", mensaje: "Reseña #3 del producto #2\nMotivo: Contenido ofensivo en la reseña" }, { signal });
});
it("rejects malformed summaries and mismatched products", () => {
  expect(() => parseReviews({ reviews: [review], summary: { total: 1, promedio: 9 } }, 2)).toThrow();
  expect(() => parseReviews({ reviews: [review], summary: { total: 1, promedio: 5 } }, 99)).toThrow();
});
