import { FALLBACK_PATH, sanitizeIncomingPath } from "../features/navigation/incomingLinks";

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  const safe = sanitizeIncomingPath(path, { development: __DEV__ });
  // Expo Go abre el proyecto con su propia URL (exp://<host>:<puerto>, sin ruta /--/).
  // Si el host de esa red no está en la lista de desarrollo, el arranque caía al catálogo;
  // en desarrollo, la apertura inicial del proyecto debe mostrar el inicio.
  // Los enlaces con ruta y las compilaciones de producción conservan el comportamiento validado.
  if (__DEV__ && initial && safe === FALLBACK_PATH && /^exps?:\/\//i.test(path) && !path.includes("/--/")) return "/";
  return safe;
}
