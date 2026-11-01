import { isAxiosError } from "axios";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { checkoutApi } from "../../../api/checkoutApi";
import { purchaseError } from "../../cart/contracts";
import { SessionRequestError } from "../../auth/context/SessionController";
import { activateCheckoutDraft, readCheckoutDraft, saveCheckoutDraft, subscribeCheckoutDraft } from "../draft";
import { validateAddress } from "../contracts";
import type { CheckoutDraft, CheckoutSummary } from "../types";

interface Scope { sessionId: string; active: boolean }
interface Operation { scope: Scope; controller: AbortController; token: string }
interface SummaryResult { sessionId: string; token: string; data: CheckoutSummary | null; loading: boolean; error: string | null }
interface MutationResult { sessionId: string; busy: boolean; error: string | null }

export function useCheckoutViewModel(token: string, sessionId: string) {
  const snapshot = useCallback(() => readCheckoutDraft(sessionId), [sessionId]);
  const draft = useSyncExternalStore(subscribeCheckoutDraft, snapshot, snapshot);
  const [summaryResult, setSummaryResult] = useState<SummaryResult | null>(null);
  const [mutation, setMutation] = useState<MutationResult | null>(null);
  const scope = useRef<Scope | null>(null);
  const summaryRequest = useRef<Operation | null>(null);
  const confirmRequest = useRef<Operation | null>(null);
  const latestSummary = useRef<{ sessionId: string; token: string; data: CheckoutSummary } | null>(null);

  // La sesión, no la rotación de accessToken, delimita la vida de una confirmación.
  useEffect(() => {
    const current: Scope = { sessionId, active: true }; scope.current = current;
    activateCheckoutDraft(sessionId);
    return () => {
      current.active = false;
      if (summaryRequest.current?.scope === current) { summaryRequest.current.controller.abort(); summaryRequest.current = null; }
      if (confirmRequest.current?.scope === current) { confirmRequest.current.controller.abort(); confirmRequest.current = null; }
      latestSummary.current = null;
    };
  }, [sessionId]);

  const change = useCallback((values: Partial<CheckoutDraft>) => {
    if (!scope.current?.active || scope.current.sessionId !== sessionId) return;
    saveCheckoutDraft(sessionId, { ...readCheckoutDraft(sessionId), ...values });
  }, [sessionId]);

  const loadSummary = useCallback(async (shippingId: number | null, promo: string) => {
    const current = scope.current;
    if (!current?.active || current.sessionId !== sessionId) return;
    summaryRequest.current?.controller.abort();
    const operation: Operation = { scope: current, controller: new AbortController(), token };
    summaryRequest.current = operation; latestSummary.current = null;
    setSummaryResult(previous => ({ sessionId, token, data: previous?.sessionId === sessionId && previous.token === token ? previous.data : null, loading: true, error: null }));
    try {
      const data = await checkoutApi.summary(token, shippingId, promo, operation.controller.signal);
      if (current.active && !operation.controller.signal.aborted && summaryRequest.current === operation) {
        latestSummary.current = { sessionId, token, data };
        setSummaryResult({ sessionId, token, data, loading: false, error: null });
        change({ shippingId: data.selectedShipping.id, appliedPromo: promo.trim() });
      }
    } catch (error) {
      if (current.active && !operation.controller.signal.aborted && summaryRequest.current === operation) {
        setSummaryResult(previous => ({ sessionId, token, data: previous?.sessionId === sessionId && previous.token === token ? previous.data : null,
          loading: false, error: purchaseError(error, "No se pudo calcular el resumen. Revisa el envío y cupón.") }));
      }
    } finally {
      if (summaryRequest.current === operation) {
        summaryRequest.current = null;
        if (current.active) setSummaryResult(previous => previous?.sessionId === sessionId && previous.token === token ? { ...previous, loading: false } : previous);
      }
    }
  }, [token, sessionId, change]);

  // Volver desde el estado del pago o carrito solicita cantidades y totales actuales.
  useFocusEffect(useCallback(() => {
    const current = scope.current, currentDraft = readCheckoutDraft(sessionId);
    void loadSummary(currentDraft.shippingId, currentDraft.appliedPromo);
    return () => {
      if (summaryRequest.current?.scope === current && summaryRequest.current.token === token) {
        summaryRequest.current.controller.abort(); summaryRequest.current = null;
      }
      latestSummary.current = null;
    };
  }, [loadSummary, sessionId, token]));

  const recalculate = async (shippingId: number | null, promo: string) => {
    if (confirmRequest.current) return;
    await loadSummary(shippingId, promo);
  };
  const confirm = async () => {
    const current = scope.current, result = latestSummary.current;
    if (!current?.active || current.sessionId !== sessionId || confirmRequest.current || summaryRequest.current ||
      !result || result.sessionId !== sessionId || result.token !== token) return null;
    const d = readCheckoutDraft(sessionId), summary = result.data;
    if (d.prepared || d.uncertain) return null;
    const validation = d.addressId == null ? validateAddress(d.address) : summary.addresses.some(a => a.id === d.addressId) ? null : "Selecciona una dirección válida.";
    if (validation) { setMutation({ sessionId, busy: false, error: validation }); return null; }
    if (summary.items.some(i => !i.active || i.stock < i.quantity)) { setMutation({ sessionId, busy: false, error: "Hay productos sin existencias suficientes. Revisa tu carrito." }); return null; }
    if (!summary.items.length) { setMutation({ sessionId, busy: false, error: "El carrito está vacío." }); return null; }
    if (!summary.selectedShipping.active) { setMutation({ sessionId, busy: false, error: "No hay un método de envío disponible. Intenta más tarde." }); return null; }
    if (d.promo.trim() !== d.appliedPromo) { setMutation({ sessionId, busy: false, error: "Aplica el cupón para revisar el total antes de continuar." }); return null; }
    const operation: Operation = { scope: current, controller: new AbortController(), token };
    confirmRequest.current = operation; setMutation({ sessionId, busy: true, error: null });
    // La incertidumbre sobre un POST se conserva al salir; nunca se repite automáticamente.
    change({ uncertain: true });
    try {
      const prepared = await checkoutApi.confirm(token, { metodo_pago: "mercado_pago",
        ...(d.addressId != null ? { id_direccion_envio: d.addressId } : { direccion: d.address }),
        ...(d.shippingId != null ? { id_metodo_envio: d.shippingId } : {}),
        ...(d.appliedPromo ? { codigo_promocion: d.appliedPromo } : {}) }, operation.controller.signal);
      if (current.active && !operation.controller.signal.aborted && confirmRequest.current === operation) {
        change({ prepared, uncertain: false });
        return prepared;
      }
      return null;
    } catch (error) {
      if (current.active && !operation.controller.signal.aborted && confirmRequest.current === operation) {
        // 400 del contrato actual implica rollback; 401/403 y SessionRequestError no ejecutaron la compra.
        // Otros estados (incluido 408/429) no confirman que la orden no se haya creado.
        const rejected = error instanceof SessionRequestError ||
          (isAxiosError(error) && !!error.response && [400, 401, 403].includes(error.response.status));
        if (rejected) change({ uncertain: false });
        setMutation({ sessionId, busy: true, error: rejected ? purchaseError(error, "El servidor rechazó la operación. Revisa los datos y el carrito.") :
          "No pudimos confirmar si se creó el pedido. Revisa tus pedidos antes de volver a comprar." });
      }
      return null;
    } finally {
      if (confirmRequest.current === operation) {
        confirmRequest.current = null;
        if (current.active) setMutation(previous => previous?.sessionId === sessionId ? { ...previous, busy: false } : previous);
      }
    }
  };
  const summaryForToken = summaryResult?.sessionId === sessionId && summaryResult.token === token ? summaryResult : null;
  return { draft, summary: summaryForToken?.data ?? null, loading: summaryForToken?.loading ?? true,
    busy: mutation?.sessionId === sessionId && mutation.busy,
    error: (mutation?.sessionId === sessionId ? mutation.error : null) ?? summaryForToken?.error ?? null,
    change, recalculate, confirm };
}
