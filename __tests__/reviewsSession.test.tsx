import { act, renderHook, waitFor } from "@testing-library/react-native";
import { reviewsApi } from "../src/api/reviewsApi";
import { useReviewsViewModel } from "../src/features/reviews/hooks/useReviewsViewModel";
import { syntheticReviewSessionToken } from "./fixtures/reviewPreferences";
jest.mock("expo-secure-store", () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 4, getItemAsync: jest.fn().mockResolvedValue(null), setItemAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../src/api/reviewsApi", () => ({ reviewsApi: { list: jest.fn(), eligibility: jest.fn(), create: jest.fn(), report: jest.fn() } }));
const review = { id: 3, productId: 2, authorId: 9, author: "Ana", rating: 5, comment: "Producto excelente", date: "2026-01-01" };
beforeEach(() => {
  jest.mocked(reviewsApi.list).mockResolvedValue({ reviews: [], total: 0, average: 0 });
  jest.mocked(reviewsApi.eligibility).mockResolvedValue({ canReview: true, hasDeliveredPurchase: true, hasReview: false });
});
async function prepare(result: { current: ReturnType<typeof useReviewsViewModel> }, comment = "Producto excelente") {
  await act(() => { result.current.change("rating", 5); result.current.change("comment", comment); result.current.changeTerms(true); });
}
it("refresh de accessToken conserva POST, formulario y elegibilidad hasta registrar su confirmación real", async () => {
  let complete!: (value: typeof review) => void, token = syntheticReviewSessionToken(9, "stable-session", 1), signal: AbortSignal | undefined;
  const oldToken = token;
  jest.mocked(reviewsApi.create).mockImplementationOnce((_token, _product, _form, abortSignal) => { signal = abortSignal; return new Promise(resolve => { complete = resolve; }); });
  const { result, rerender } = await renderHook(() => useReviewsViewModel("2", token, "stable-session"));
  await waitFor(() => expect(result.current.eligibility.data?.canReview).toBe(true));
  await prepare(result);
  await act(() => result.current.submit());
  token = syntheticReviewSessionToken(9, "stable-session", 2); await rerender({});
  expect(signal?.aborted).toBe(false);
  expect(result.current.publication.pending).toBe(true); expect(result.current.published).toBe(false);
  expect(result.current.form).toEqual({ rating: 5, comment: "Producto excelente" });
  expect(result.current.acceptedTerms).toBe(true);
  expect(reviewsApi.eligibility).toHaveBeenCalledTimes(1); expect(reviewsApi.list).toHaveBeenCalledTimes(1);
  await act(() => complete(review));
  await waitFor(() => expect(result.current.published).toBe(true));
  expect(result.current.publication.pending).toBe(false);
  expect(result.current.form).toEqual({ rating: 0, comment: "" }); expect(result.current.acceptedTerms).toBe(false);
  expect(reviewsApi.create).toHaveBeenCalledTimes(1);
  expect(reviewsApi.create).toHaveBeenCalledWith(oldToken, 2, { rating: 5, comment: "Producto excelente" }, expect.any(AbortSignal));
  await waitFor(() => expect(reviewsApi.eligibility).toHaveBeenCalledTimes(2));
  expect(reviewsApi.eligibility).toHaveBeenLastCalledWith(token, 2, expect.any(AbortSignal));
});
it("la siguiente publicación usa el token renovado sin perder el texto de una solicitud rechazada", async () => {
  jest.mocked(reviewsApi.create).mockRejectedValueOnce({ isAxiosError: true, response: { status: 400 } }).mockResolvedValueOnce(review);
  let token = syntheticReviewSessionToken(9, "retry-session", 1);
  const { result, rerender } = await renderHook(() => useReviewsViewModel("2", token, "retry-session"));
  await waitFor(() => expect(result.current.eligibility.data?.canReview).toBe(true));
  await prepare(result);
  await act(() => result.current.submit());
  await waitFor(() => expect(result.current.publication.error).toBeTruthy());
  token = syntheticReviewSessionToken(9, "retry-session", 2); await rerender({});
  expect(result.current.form.comment).toBe("Producto excelente");
  await act(() => result.current.submit());
  await waitFor(() => expect(result.current.published).toBe(true));
  expect(reviewsApi.create).toHaveBeenNthCalledWith(2, token, 2, { rating: 5, comment: "Producto excelente" }, expect.any(AbortSignal));
});
it("cambio de cuenta aborta el POST previo, limpia datos y una respuesta tardía no confirma ni desbloquea otra publicación", async () => {
  let oldComplete!: (value: typeof review) => void, newComplete!: (value: typeof review) => void;
  let token = syntheticReviewSessionToken(9, "old-account"), sessionId = "old-account", oldSignal: AbortSignal | undefined;
  jest.mocked(reviewsApi.create).mockImplementationOnce((_token, _product, _form, signal) => { oldSignal = signal; return new Promise(resolve => { oldComplete = resolve; }); })
    .mockImplementationOnce(() => new Promise(resolve => { newComplete = resolve; }));
  const { result, rerender } = await renderHook(() => useReviewsViewModel("2", token, sessionId));
  await waitFor(() => expect(result.current.eligibility.data?.canReview).toBe(true));
  await prepare(result, "Comentario de la cuenta anterior");
  await act(() => result.current.changeReport("email", "old@example.com"));
  await act(() => result.current.submit());
  token = syntheticReviewSessionToken(10, "new-account"); sessionId = "new-account"; await rerender({});
  await waitFor(() => expect(result.current.eligibility.data?.canReview).toBe(true));
  expect(oldSignal?.aborted).toBe(true);
  expect(result.current.publication.pending).toBe(false); expect(result.current.published).toBe(false);
  expect(result.current.form).toEqual({ rating: 0, comment: "" }); expect(result.current.acceptedTerms).toBe(false);
  expect(result.current.reportForm.email).toBe("");
  await prepare(result, "Comentario de la cuenta nueva");
  await act(() => result.current.submit());
  await act(() => oldComplete(review));
  expect(result.current.publication.pending).toBe(true); expect(result.current.published).toBe(false);
  expect(result.current.form.comment).toBe("Comentario de la cuenta nueva");
  await act(() => newComplete({ ...review, id: 4, authorId: 10, comment: "Comentario de la cuenta nueva" }));
  await waitFor(() => expect(result.current.published).toBe(true));
  expect(result.current.publication.pending).toBe(false);
});
