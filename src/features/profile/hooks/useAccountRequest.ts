import { useEffect, useRef, useState } from "react";
import { accountErrorMessage } from "../errors";
export function useAccountRequest(scopeKey = "") {
  const [state, setState] = useState<{ scope: string; pending: boolean; error: string | null }>({ scope: scopeKey, pending: false, error: null });
  const request = useRef<AbortController | null>(null), mounted = useRef(true), generation = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { generation.current += 1; mounted.current = false; request.current?.abort(); request.current = null; };
  }, [scopeKey]);
  async function run<T>(action: (signal: AbortSignal) => Promise<T>, onSuccess: (value: T) => void) {
    if (request.current || !mounted.current) return;
    const attempt = generation.current;
    const controller = new AbortController(); request.current = controller;
    setState({ scope: scopeKey, pending: true, error: null });
    try { const value = await action(controller.signal); if (mounted.current && !controller.signal.aborted && generation.current === attempt) onSuccess(value); }
    catch (cause) { if (mounted.current && !controller.signal.aborted && generation.current === attempt) setState({ scope: scopeKey, pending: true, error: accountErrorMessage(cause) }); }
    finally { if (request.current === controller) { request.current = null; if (mounted.current && generation.current === attempt) setState(previous => ({ ...previous, pending: false })); } }
  }
  function cancel() { generation.current += 1; request.current?.abort(); request.current = null; if (mounted.current) setState(previous => ({ ...previous, pending: false })); }
  return { pending: state.scope === scopeKey && state.pending, error: state.scope === scopeKey ? state.error : null, run, cancel,
    clearError: () => setState(previous => ({ ...previous, error: null })) };
}
