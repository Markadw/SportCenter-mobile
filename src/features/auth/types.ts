export interface LoginCredentials {
  email: string;
  passw: string;
}

export type LoginFieldErrors = Partial<Record<keyof LoginCredentials, string>>;

export interface Session {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresAt: number;
}
