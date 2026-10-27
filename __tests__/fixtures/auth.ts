export const loginCredentials = { email: "cliente@example.test", passw: "clave123" };

export const loginResponse = {
  accessToken: "access-token-de-prueba",
  refreshToken: "refresh-token-de-prueba",
  sessionId: "sesion-de-prueba",
  accessTokenExpiresIn: "15m",
  refreshTokenExpiresIn: "7d",
};

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
