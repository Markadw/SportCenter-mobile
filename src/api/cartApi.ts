import axiosClient from "./axios";
import { parseCart, validateQuantity } from "../features/cart/contracts";

const config = (token: string, signal?: AbortSignal) => ({ headers: { Authorization: `Bearer ${token}` }, signal });
export const cartApi = {
  async get(token: string, signal?: AbortSignal) {
    const { data } = await axiosClient.get<unknown>("/products/cart", config(token, signal)); return parseCart(data);
  },
  async add(token: string, variantId: number, quantity: number, signal?: AbortSignal) {
    validateQuantity(variantId, quantity);
    const { data } = await axiosClient.post<unknown>("/products/cart/items", { id_variante: variantId, cantidad: quantity }, config(token, signal)); return parseCart(data);
  },
  async update(token: string, variantId: number, quantity: number, signal?: AbortSignal) {
    validateQuantity(variantId, quantity, true);
    const { data } = await axiosClient.put<unknown>(`/products/cart/items/${variantId}`, { cantidad: quantity }, config(token, signal)); return parseCart(data);
  },
  async remove(token: string, variantId: number, signal?: AbortSignal) {
    validateQuantity(variantId, 1);
    const { data } = await axiosClient.delete<unknown>(`/products/cart/items/${variantId}`, config(token, signal)); return parseCart(data);
  },
};
