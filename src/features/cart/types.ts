export interface CartItem {
  variantId: number; productId: number; name: string; sku: string;
  quantity: number; unitPrice: number; stock: number; active: boolean;
  image: string | null; attributes: Record<string, string>;
}
export interface Cart { id: number; items: CartItem[]; subtotal: number; itemCount: number }
