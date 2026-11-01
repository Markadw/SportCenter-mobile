import axiosClient from "../src/api/axios";
import { passwordRecoveryApi } from "../src/api/passwordRecoveryApi";
import { validateRecovery } from "../src/features/passwordRecovery/validation";
jest.mock("../src/api/axios", () => ({ __esModule: true, default: { post: jest.fn() } }));
const form = { email: " Ana@Example.com ", token: "123456", psw: "SeguraNueva456!", confirmation: "SeguraNueva456!" };
it("requests the real recovery email endpoint", async () => {
  (axiosClient.post as jest.Mock).mockResolvedValue({ data: { message: "ok" } });
  await passwordRecoveryApi.requestCode(form.email);
  expect(axiosClient.post).toHaveBeenCalledWith("/users/verify-user-email", { email: "ana@example.com" }, expect.any(Object));
});
it("resets directly without prematurely consuming OTP or leaking confirmation", async () => {
  (axiosClient.post as jest.Mock).mockResolvedValue({ data: { message: "ok" } });
  const signal = new AbortController().signal;
  await passwordRecoveryApi.reset(form, signal);
  expect(axiosClient.post).toHaveBeenCalledTimes(1);
  expect(axiosClient.post).toHaveBeenCalledWith("/users/reset-psw", { email: "ana@example.com", token: "123456", psw: form.psw }, { signal });
});
it("rejects invalid code, weak password and mismatched confirmation before sending", async () => {
  const invalid = { ...form, token: "abcdef", psw: "short", confirmation: "other" };
  expect(Object.keys(validateRecovery(invalid, true))).toEqual(expect.arrayContaining(["token", "psw", "confirmation"]));
  await expect(passwordRecoveryApi.reset(invalid)).rejects.toThrow();
  expect(axiosClient.post).not.toHaveBeenCalled();
});
it("does not accept a malformed success response", async () => {
  (axiosClient.post as jest.Mock).mockResolvedValue({ data: { token: "private" } });
  await expect(passwordRecoveryApi.requestCode(form.email)).rejects.toThrow();
});
