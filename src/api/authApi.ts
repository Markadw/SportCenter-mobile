import { create } from "axios";
import type { LoginCredentials, Session, StoredSession } from "../features/auth/types";
import { InvalidSessionResponse } from "../features/auth/errors";
import { normalizeLogin } from "../features/auth/validation";
import axiosClient from "./axios";
import { ENDPOINTS } from "./endpoints";
import env from "../config/env";

// Sin interceptores de sesión: renovar jamás provoca otra renovación recursiva.
const refreshTransport = create({
  baseURL: env.apiUrl,
  timeout: 15000,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
});

function readSession(data: unknown): Session {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new InvalidSessionResponse();
  const value = data as Record<string, unknown>;
  if (
    typeof value.accessToken !== "string" || !value.accessToken.trim() || /\s/.test(value.accessToken) ||
    typeof value.refreshToken !== "string" || !value.refreshToken.trim() || /\s/.test(value.refreshToken) ||
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
  async refresh(stored: StoredSession, signal?: AbortSignal): Promise<Session> {
    const { data } = await refreshTransport.post<unknown>("/users/refresh-token", {
      refreshToken: stored.refreshToken,
    }, { signal });
    const next = readSession(data);
    if (next.sessionId !== stored.sessionId) throw new InvalidSessionResponse();
    return next;
  },
  async logout(accessToken: string): Promise<void> {
    await axiosClient.post(ENDPOINTS.auth.logout, {}, { headers: { Authorization: `Bearer ${accessToken}` } });
  },
};
