import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { useReviewAuthorPreferences } from "../src/features/reviews/hooks/useReviewAuthorPreferences";
import { syntheticReviewSessionToken } from "./fixtures/reviewPreferences";
import * as localIdentity from "../src/features/reviews/preferences/localIdentity";
jest.mock("expo-secure-store", () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 4, getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
const native = new Map<string, string>();
beforeEach(() => {
  native.clear(); jest.replaceProperty(Platform, "OS", "ios");
  jest.mocked(SecureStore.getItemAsync).mockReset().mockImplementation(async key => native.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockReset().mockImplementation(async (key, value) => { native.set(key, value); });
});
afterEach(() => jest.restoreAllMocks());
it("restores hidden authors after remount and another login of the same real account, while isolating other accounts", async () => {
  const first = await renderHook(() => useReviewAuthorPreferences(syntheticReviewSessionToken(51, "first-login"), "first-login"));
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  await act(async () => { await first.result.current.hide(9); });
  expect(first.result.current.authors.has(9)).toBe(true);
  await first.unmount();
  const same = await renderHook(() => useReviewAuthorPreferences(syntheticReviewSessionToken(51, "second-login"), "second-login"));
  await waitFor(() => expect(same.result.current.ready).toBe(true));
  expect([...same.result.current.authors]).toEqual([9]);
  await same.unmount();
  const other = await renderHook(() => useReviewAuthorPreferences(syntheticReviewSessionToken(52, "other-login"), "other-login"));
  await waitFor(() => expect(other.result.current.ready).toBe(true));
  expect([...other.result.current.authors]).toEqual([]);
});
it("restores all hidden authors and persists that choice", async () => {
  native.set("sport-center.review-authors.account.53", JSON.stringify({ version: 1, authors: [8, 9] }));
  const { result } = await renderHook(() => useReviewAuthorPreferences(syntheticReviewSessionToken(53, "restore-session"), "restore-session"));
  await waitFor(() => expect(result.current.authors.size).toBe(2));
  await act(async () => { await result.current.restoreAll(); });
  expect(result.current.authors.size).toBe(0);
  expect(JSON.parse(native.get("sport-center.review-authors.account.53")!)).toEqual({ version: 1, authors: [] });
});
it("reports malformed storage without claiming preferences loaded, and supports explicit reset", async () => {
  native.set("sport-center.review-authors.account.54", "{broken");
  const { result } = await renderHook(() => useReviewAuthorPreferences(syntheticReviewSessionToken(54, "malformed-store"), "malformed-store"));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.ready).toBe(false); expect(result.current.notice).toBeNull();
  await act(async () => { await result.current.restoreAll(); });
  expect(result.current.ready).toBe(true); expect(result.current.error).toBeNull();
});
it("does not hide optimistically or claim persistence when a secure write fails", async () => {
  jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("internal secret"));
  const { result } = await renderHook(() => useReviewAuthorPreferences(syntheticReviewSessionToken(55, "failed-write"), "failed-write"));
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => { await result.current.hide(9); });
  expect(result.current.authors.size).toBe(0); expect(result.current.notice).toBeNull();
  expect(result.current.error).toContain("No pudimos guardar"); expect(result.current.error).not.toContain("secret");
});
it("late preference reads from a previous session never filter the next account", async () => {
  let finish!: (value: string) => void, sessionId = "old-pref-session", token = syntheticReviewSessionToken(56, sessionId);
  jest.mocked(SecureStore.getItemAsync).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = await renderHook(() => useReviewAuthorPreferences(token, sessionId));
  await waitFor(() => expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1));
  sessionId = "new-pref-session"; token = syntheticReviewSessionToken(57, sessionId); await rerender({});
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(() => finish(JSON.stringify({ version: 1, authors: [9] })));
  expect(result.current.authors.size).toBe(0);
});
it("refresh with the same user and session keeps the namespace and does not interrupt a write", async () => {
  let finish!: () => void, token = syntheticReviewSessionToken(58, "refresh-pref-session", 1);
  jest.mocked(SecureStore.setItemAsync).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = await renderHook(() => useReviewAuthorPreferences(token, "refresh-pref-session"));
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(() => { void result.current.hide(9); });
  await waitFor(() => expect(result.current.saving).toBe(true));
  token = syntheticReviewSessionToken(58, "refresh-pref-session", 2); await rerender({});
  expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(2);
  await act(() => finish());
  expect(result.current.authors.has(9)).toBe(true);
  expect(result.current.saving).toBe(false); expect(result.current.error).toBeNull();
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith("sport-center.review-authors.account.58", expect.any(String), expect.any(Object));
});
it("a missing or inconsistent token claim disables preference persistence instead of selecting another account", async () => {
  const { result } = await renderHook(() => useReviewAuthorPreferences(syntheticReviewSessionToken(59, "wrong-session"), "actual-session"));
  expect(result.current.ready).toBe(false); expect(result.current.error).toBeTruthy();
  await act(async () => { await result.current.hide(9); });
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled(); expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
it("a refreshed token cannot silently switch the namespace user within one session", async () => {
  let token = syntheticReviewSessionToken(60, "mismatch-refresh", 1);
  const { result, rerender } = await renderHook(() => useReviewAuthorPreferences(token, "mismatch-refresh"));
  await waitFor(() => expect(result.current.ready).toBe(true));
  token = syntheticReviewSessionToken(61, "mismatch-refresh", 2); await rerender({});
  expect(result.current.ready).toBe(false); expect(result.current.error).toBeTruthy();
  expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);
});
it("guest preferences restore independently without storing a session credential", async () => {
  const first = await renderHook(() => useReviewAuthorPreferences());
  await waitFor(() => expect(first.result.current.ready).toBe(true));
  await act(async () => { await first.result.current.hide(9); }); await first.unmount();
  const next = await renderHook(() => useReviewAuthorPreferences());
  await waitFor(() => expect(next.result.current.ready).toBe(true));
  expect(next.result.current.authors.has(9)).toBe(true);
  expect([...native.keys()]).toEqual(["sport-center.review-authors.guest"]);
});

it("does not enable reset for an owner whose session binding failed", async () => {
  jest.spyOn(localIdentity, "bindReviewPreferenceOwner").mockImplementationOnce(() => { throw new Error("binding failed"); });
  const { result } = await renderHook(() => useReviewAuthorPreferences(syntheticReviewSessionToken(62, "failed-binding"), "failed-binding"));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  expect(result.current.canReset).toBe(false);
  await act(async () => { await result.current.restoreAll(); });
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
