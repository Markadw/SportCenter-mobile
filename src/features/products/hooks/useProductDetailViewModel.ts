import { useEffect, useState } from "react";
import { productsApi, type Product } from "../../../api";

interface DetailResult { request: string; product: Product | null; error: string | null }

export function useProductDetailViewModel(id: string) {
  const [attempt, setAttempt] = useState(0);
  const request = `${id}:${attempt}`;
  const validId = /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0;
  const [result, setResult] = useState<DetailResult | null>(null);
  const [selection, setSelection] = useState<{ request: string; id: number } | null>(null);
  useEffect(() => {
    if (!validId) return;
    let active = true;
    void productsApi.getById(id).then(product => {
      if (active) setResult({ request, product, error: product ? null : "Producto no encontrado" });
    }).catch((e: unknown) => {
      if (active) setResult({ request, product: null, error: e instanceof Error ? e.message : "No se pudo cargar el producto" });
    });
    return () => { active = false; };
  }, [id, request, validId]);
  const current = result?.request === request ? result : null;
  const product = current?.product ?? null;
  const selected = (selection?.request === request ? product?.variants.find(v => v.id === selection.id) : null)
    ?? product?.variants.find(v => v.stock > 0) ?? product?.variants[0] ?? null;
  return { product, isLoading: validId && !current,
    error: validId ? current?.error ?? null : "Producto no encontrado", selected,
    selectVariant: (variantId: number) => setSelection({ request, id: variantId }), retry: () => setAttempt(a => a + 1) };
}
