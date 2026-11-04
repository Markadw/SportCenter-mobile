import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { cartApi } from "../../../api/cartApi";
import { purchaseError } from "../contracts";
import type { Cart } from "../types";

export function useCartViewModel(token: string) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const locked = useRef(false);
  const reloadPending = useRef(false), currentToken = useRef(token);
  useEffect(() => { currentToken.current = token; }, [token]);
  const run = useCallback(async (action: (signal: AbortSignal) => Promise<Cart>, initial = false) => {
    if (locked.current || !mounted.current) return;
    let nextAction = action, fullReload = initial;
    while (mounted.current) {
      locked.current = true;
      const request = new AbortController(); controller.current = request;
      if (fullReload) setLoading(true); else setBusy(true);
      setError(null);
      let ownsRequest = false;
      try {
        const next = await nextAction(request.signal);
        if (mounted.current && controller.current === request && !request.signal.aborted) setCart(next);
      } catch (error) {
        if (mounted.current && controller.current === request && !request.signal.aborted) setError(purchaseError(error, "No pudimos actualizar el carrito. Revisa su estado antes de intentarlo de nuevo."));
      } finally {
        ownsRequest = controller.current === request;
        if (ownsRequest) {
          controller.current = null; locked.current = false;
          if (mounted.current && !request.signal.aborted) { setLoading(false); setBusy(false); }
        }
      }
      if (!ownsRequest || !mounted.current || request.signal.aborted || !reloadPending.current) return;
      // Reenfocar durante una petición conserva una sola lectura posterior, nunca otra mutación.
      reloadPending.current = false;
      nextAction = signal => cartApi.get(currentToken.current, signal); fullReload = true;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reloadPending.current = false; controller.current?.abort(); controller.current = null; locked.current = false; };
  }, []);
  const reload = useCallback(() => {
    if (locked.current) { if (mounted.current) reloadPending.current = true; return Promise.resolve(); }
    return run(signal => cartApi.get(token, signal), true);
  }, [run, token]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  return { cart, loading, busy, error, reload,
    update: (id: number, quantity: number) => run(signal => cartApi.update(token, id, quantity, signal)),
    remove: (id: number) => run(signal => cartApi.remove(token, id, signal)) };
}


export function useAddToCart(token: string | null, sessionId?: string) {
  const scope = sessionId ?? token ?? "guest";
  const [result, setResult] = useState<{ scope: string; message: string; error: boolean } | null>(null);
  const [busyScope, setBusyScope] = useState<string | null>(null);
  const currentToken = useRef(token), request = useRef<AbortController | null>(null);
  const locked = useRef(false), active = useRef(false), generation = useRef(0);
  useEffect(() => { currentToken.current = token; }, [token]);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; generation.current += 1; request.current?.abort(); request.current = null; locked.current = false; };
  }, [scope]);
  const add = async (variantId: number, quantity: number) => {
    const accessToken = currentToken.current;
    if (!accessToken || locked.current || !active.current) return;
    locked.current = true;
    const attempt = generation.current, controller = new AbortController(); request.current = controller;
    setBusyScope(scope); setResult(null);
    try {
      await cartApi.add(accessToken, variantId, quantity, controller.signal);
      if (active.current && generation.current === attempt && !controller.signal.aborted) setResult({ scope, message: "Agregado al carrito.", error: false });
    } catch (error) {
      if (active.current && generation.current === attempt && !controller.signal.aborted) {
        setResult({ scope, message: purchaseError(error, "No pudimos agregarlo. Consulta el carrito antes de volver a intentar."), error: true });
      }
    } finally {
      if (request.current === controller) { request.current = null; locked.current = false; }
      if (active.current && generation.current === attempt) setBusyScope(null);
    }
  };
  return { add, busy: !!token && busyScope === scope, result: result?.scope === scope ? result : null };
}
