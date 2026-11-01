import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as Linking from "expo-linking";
import { accountDeletionApi } from "../src/features/privacy/accountDeletionApi";
import { usePrivacyViewModel } from "../src/features/privacy/hooks/usePrivacyViewModel";
import { PRIVACY_LINKS, SUPPORT_EMAIL } from "../src/features/privacy/config";
jest.mock("expo-linking", () => ({ openURL: jest.fn() }));
jest.mock("../src/features/privacy/accountDeletionApi", () => ({ accountDeletionApi: { request: jest.fn() } }));
async function completeForm(result: { current: ReturnType<typeof usePrivacyViewModel> }) {
  await act(() => { result.current.change("name", "Ana"); result.current.change("email", "ana@example.com"); result.current.change("confirmed", true); });
}
it("sends nothing until the user confirms and supplies required contact data", async () => {
  const { result } = await renderHook(usePrivacyViewModel);
  expect(result.current.form.confirmed).toBe(false);
  await act(() => result.current.submit());
  expect(accountDeletionApi.request).not.toHaveBeenCalled();
  expect(result.current.errors.confirmed).toBeTruthy();
});
it("deduplicates requests and confirms only a receipt after the backend responds", async () => {
  let finish!: (value: { receiptId: number }) => void;
  jest.mocked(accountDeletionApi.request).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result } = await renderHook(usePrivacyViewModel);
  await completeForm(result);
  await act(() => { result.current.submit(); result.current.submit(); });
  expect(accountDeletionApi.request).toHaveBeenCalledTimes(1); expect(result.current.receiptId).toBeNull();
  await act(() => finish({ receiptId: 17 }));
  expect(result.current.receiptId).toBe(17); expect(result.current.form.email).toBe(""); expect(result.current.form.confirmed).toBe(false);
});
it("aborts pending requests and explains that stopping the wait does not guarantee server cancellation", async () => {
  let finish!: (value: { receiptId: number }) => void;
  jest.mocked(accountDeletionApi.request).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { result } = await renderHook(usePrivacyViewModel);
  await completeForm(result); await act(() => result.current.submit());
  const signal = jest.mocked(accountDeletionApi.request).mock.calls[0][1]!;
  await act(() => result.current.cancel());
  expect(signal.aborted).toBe(true); expect(result.current.notice).toContain("podría haberse recibido");
  await act(() => finish({ receiptId: 99 }));
  expect(result.current.receiptId).toBeNull();
});
it("prepares an email draft without claiming it was sent or generating an API receipt", async () => {
  jest.mocked(Linking.openURL).mockResolvedValue(true);
  const { result } = await renderHook(usePrivacyViewModel);
  await completeForm(result); await act(() => result.current.prepareEmail());
  await waitFor(() => expect(result.current.notice).toContain("no confirma su envío"));
  expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining("mailto:" + SUPPORT_EMAIL));
  expect(accountDeletionApi.request).not.toHaveBeenCalled(); expect(result.current.receiptId).toBeNull();
});
it("opens only the verified fixed legal URLs and handles missing mail/browser apps", async () => {
  jest.mocked(Linking.openURL).mockRejectedValue(new Error("native internal secret"));
  const { result } = await renderHook(usePrivacyViewModel);
  await act(() => result.current.openLegal("privacy"));
  await waitFor(() => expect(result.current.linkError).toBeTruthy());
  expect(Linking.openURL).toHaveBeenCalledWith(PRIVACY_LINKS.privacy);
  expect(result.current.linkError).not.toContain("secret");
});
it("aborts network requests on unmount and never creates a late receipt", async () => {
  jest.mocked(accountDeletionApi.request).mockImplementation(() => new Promise(() => {}));
  const { result, unmount } = await renderHook(usePrivacyViewModel);
  await completeForm(result); await act(() => result.current.submit());
  const signal = jest.mocked(accountDeletionApi.request).mock.calls[0][1]!;
  await unmount(); expect(signal.aborted).toBe(true);
});
