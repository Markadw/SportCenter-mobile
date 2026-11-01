export interface OrderItem { variantId: number; productId: number | null; name: string; quantity: number; unitPrice: number; total: number }
export interface ShipmentEvent { status: string; title: string; description: string; location: string | null; date: string }
export interface Order { id: number; status: string; shipmentStatus: string | null; total: number; createdAt: string; items: OrderItem[] }
export interface OrderTracking { id: number; status: string; shipmentStatus: string | null; total: number; trackingNumber: string | null; carrier: string | null; estimatedAt: string | null; shippedAt: string | null; deliveredAt: string | null; address: string; events: ShipmentEvent[] }
