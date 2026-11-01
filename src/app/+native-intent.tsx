import { sanitizeIncomingPath } from "../features/navigation/incomingLinks";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return sanitizeIncomingPath(path, { development: __DEV__ });
}
