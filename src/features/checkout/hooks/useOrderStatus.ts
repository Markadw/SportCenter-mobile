import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { checkoutApi } from "../../../api/checkoutApi";
import { purchaseError } from "../../cart/contracts";
import type { OrderStatus } from "../types";

export function useOrderStatus(token: string, id: number) {
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(false), lock = useRef(false);
  const request = useRef<AbortController | null>(null);
  const terminal = useRef(false);
  const refresh = useCallback(async () => {
    if (lock.current || !Number.isSafeInteger(id) || id < 1) return;
    lock.current = true; setLoading(true); setError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      const data = await checkoutApi.orderStatus(token, id, controller.signal);
      if (alive.current && !controller.signal.aborted) { setStatus(data); terminal.current = data.paid || data.stockIncident || ["pago_cancelado", "pago_rechazado", "reembolsado"].includes(data.state); }
    } catch (error) {
      if (alive.current && !controller.signal.aborted) setError(purchaseError(error, "No se pudo consultar el pago. Puedes volver a consultar sin crear otro pedido."));
    } finally {
      if (request.current === controller) lock.current = false;
      if (alive.current && !controller.signal.aborted) setLoading(false);
    }
  }, [id, token]);
  useEffect(() => {
    alive.current = true; terminal.current = false;
    void Promise.resolve().then(() => { if (alive.current) void refresh(); });
    let attempts = 0;
    const timer = setInterval(() => { if (++attempts <= 12 && !terminal.current && AppState.currentState === "active") void refresh(); }, 5000);
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
    return () => { alive.current = false; request.current?.abort(); lock.current = false; subscription.remove(); clearInterval(timer); };
  }, [refresh]);
  return { status, loading, error, refresh };
}
