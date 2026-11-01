import { useCallback } from "react";
import { ordersApi } from "../../../api/ordersApi";
import { useAccountResource } from "../../profile/hooks/useAccountResource";
import { validId } from "../contract";
export function useOrdersViewModel(accessToken?: string) {
  const loader = useCallback((signal: AbortSignal) => ordersApi.list(accessToken!, signal), [accessToken]);
  return useAccountResource(accessToken ?? "", loader, !!accessToken);
}
export function useOrderDetailViewModel(id: string, accessToken?: string) {
  const valid = validId(id);
  const loader = useCallback((signal: AbortSignal) => ordersApi.detail(accessToken!, Number(id), signal), [accessToken, id]);
  const resource = useAccountResource((accessToken ?? "") + ":" + id, loader, !!accessToken && valid);
  return { ...resource, valid };
}
