import { create } from "axios";
import env from "../../config/env";
import { DELETION_SECRET, DELETION_UUID, parseDeletionRequest, parseDeletionResult, parseDeletionVerification } from "./parsers";

// Own transport: session interceptors must never replay confirmation or attach
// credentials to the receipt query. Tokens/codes are never logged or put in URLs.
export function createAccountDeletionApi(baseURL = env.apiUrl) {
  const client = create({ baseURL: baseURL.replace(/\/+$/, "") + "/users/account-deletion", timeout: 30000,
    withCredentials: false, headers: { "Content-Type": "application/json", Accept: "application/json" } });
  function path(requestId: string, action: string) {
    if (!DELETION_UUID.test(requestId)) throw new Error("INVALID_DELETION_REQUEST");
    return `/requests/${requestId}/${action}`;
  }
  function authenticated(accessToken: string, signal?: AbortSignal) {
    if (!accessToken.trim()) throw new Error("MISSING_DELETION_SESSION");
    return { signal, headers: { Authorization: `Bearer ${accessToken}` } };
  }
  return {
    async request(accessToken: string, signal?: AbortSignal) {
      return parseDeletionRequest((await client.post("/requests", {}, authenticated(accessToken, signal))).data);
    },
    async verify(requestId: string, code: string, accessToken: string, signal?: AbortSignal) {
      if (!/^[0-9]{6}$/.test(code)) throw new Error("INVALID_DELETION_CODE");
      return parseDeletionVerification((await client.post(path(requestId, "verify"), { code }, authenticated(accessToken, signal))).data);
    },
    async confirm(requestId: string, confirmationToken: string, accessToken: string, signal?: AbortSignal) {
      if (!DELETION_SECRET.test(confirmationToken)) throw new Error("INVALID_DELETION_AUTHORIZATION");
      return parseDeletionResult((await client.post(path(requestId, "confirm"), { confirmationToken, confirmed: true }, authenticated(accessToken, signal))).data, requestId);
    },
    async result(requestId: string, receiptToken: string, signal?: AbortSignal) {
      if (!DELETION_SECRET.test(receiptToken)) throw new Error("INVALID_DELETION_RECEIPT");
      return parseDeletionResult((await client.post(path(requestId, "result"), { receiptToken }, { signal, withCredentials: false })).data, requestId);
    },
  };
}
export const accountDeletionApi = createAccountDeletionApi();
