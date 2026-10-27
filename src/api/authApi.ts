import type { LoginCredentials, Session } from "../features/auth/types";
import { InvalidSessionResponse } from "../features/auth/errors";
import { normalizeLogin } from "../features/auth/validation";
import axiosClient from "./axios";
import { ENDPOINTS } from "./endpoints";

function readSession(data: unknown): Session {
  if (!data || typeof data !== "object") throw new InvalidSessionResponse();
  const value = data as Record<string, unknown>;
  if (
    typeof value.accessToken !== "string" || !value.accessToken.trim() ||
    typeof value.refreshToken !== "string" || !value.refreshToken.trim() ||
    typeof value.sessionId !== "string" || !value.sessionId.trim() ||
    typeof value.accessTokenExpiresIn !== "string"
  ) throw new InvalidSessionResponse();
  const duration = /^(\d+)(s|m|h)$/.exec(value.accessTokenExpiresIn);
  if (!duration) throw new InvalidSessionResponse();
  const units: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };
  const ttl = Number(duration[1]) * units[duration[2]];
  if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > 86_400_000) throw new InvalidSessionResponse();
  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    sessionId: value.sessionId,
    expiresAt: Date.now() + ttl,
  };
}

export const authApi = {
  async login(credentials: LoginCredentials, signal?: AbortSignal): Promise<Session> {
    const { data } = await axiosClient.post<unknown>(ENDPOINTS.auth.login, normalizeLogin(credentials), { signal });
    return readSession(data);
  },
  async logout(accessToken: string): Promise<void> {
    await axiosClient.post(ENDPOINTS.auth.logout, {}, { headers: { Authorization: `Bearer ${accessToken}` } });
  },
};
