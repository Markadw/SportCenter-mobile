import { jwtDecode } from "jwt-decode";

// Sólo controla la presentación. El backend verifica la firma, sesión y permisos.
export function canRequestAccountDeletion(accessToken?: string): boolean {
  if (!accessToken || accessToken.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)) return false;
  try {
    const value = jwtDecode<unknown>(accessToken);
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const claims = value as Record<string, unknown>;
    return claims.rol === 1 && typeof claims.id_usuario === "number" && Number.isSafeInteger(claims.id_usuario) && claims.id_usuario > 0;
  } catch { return false; }
}
