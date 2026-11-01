import { useEffect, useRef, useState } from "react";
import { accountErrorMessage } from "../errors";
interface Resource<T> { key: string; status: "loading" | "ready" | "error" | "cancelled"; data: T | null; error: string | null }
export function useAccountResource<T>(key: string, loader: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const [attempt, setAttempt] = useState(0), [resource, setResource] = useState<Resource<T> | null>(null);
  const request = useRef<AbortController | null>(null);
  const requestKey = key + ":" + attempt;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(); request.current = controller;
    void loader(controller.signal).then(data => { if (!controller.signal.aborted) setResource({ key: requestKey, status: "ready", data, error: null }); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setResource({ key: requestKey, status: "error", data: null, error: accountErrorMessage(cause) }); });
    return () => { controller.abort(); if (request.current === controller) request.current = null; };
  }, [requestKey, loader, enabled]);
  function cancel() {
    request.current?.abort(); request.current = null;
    setResource({ key: requestKey, status: "cancelled", data: null, error: null });
  }
  const current = enabled && resource?.key === requestKey ? resource : null;
  return { data: current?.data ?? null, error: current?.error ?? null,
    status: current?.status ?? "loading", cancel, retry: () => setAttempt(value => value + 1) };
}
