import { useEffect, useRef, useState } from "react";
import { registrationErrorMessage } from "../errors";
import type { RegistrationOperation } from "../types";

export function useRegistrationRequest() {
  const [pending, setPending] = useState<RegistrationOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  async function run<T>(
    operation: RegistrationOperation,
    action: (signal: AbortSignal) => Promise<T>,
    onSuccess: (value: T) => void,
  ) {
    // El ref bloquea también dos pulsaciones en el mismo render.
    if (request.current || !mounted.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(operation);
    setError(null);
    try {
      const result = await action(controller.signal);
      if (mounted.current && !controller.signal.aborted) onSuccess(result);
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setError(registrationErrorMessage(cause, operation));
    } finally {
      request.current = null;
      if (mounted.current) setPending(null);
    }
  }

  return { pending, error, clearError: () => setError(null), run };
}
