export interface LoginCredentials {
  email: string;
  passw: string;
}

export type LoginFieldErrors = Partial<Record<keyof LoginCredentials, string>>;

export interface StoredSession {
  refreshToken: string;
  sessionId: string;
}

export interface Session extends StoredSession {
  accessToken: string;
  expiresAt: number;
}
