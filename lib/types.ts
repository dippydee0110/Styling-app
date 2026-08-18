export type Slot =
  | "top"
  | "bottom"
  | "dress"
  | "outerwear"
  | "bag"
  | "scarf"
  | "shoes"
  | "jewelry"
  | "belt"
  | "headwear";

export interface Merchant {
  id: string;
  name: string;
  region: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  slot: Slot;
  price: number;
  currency: string;
  merchant: Merchant;
  shippingCost: number;
  estimatedDeliveryDays: number;
  imageColor: string;
  imageUrl: string;
  description: string;
  purchaseUrl: string;
  tags: string[];
}

export interface CartItem extends Product {
  quantity: number;
}

export interface StyleProfile {
  freeText: string;
  occasion?: string;
  region?: string;
}

export interface GeneratedModel {
  id: string;
  summary: string;
  imageUrl: string;
  wornSlots: Partial<Record<Slot, string>>; // slot -> productId
  generatedAt: string;
  source: "mock" | "real";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  products?: Product[];
}

export interface MerchantOrder {
  merchantId: string;
  merchantName: string;
  region: string;
  items: CartItem[];
  subtotal: number;
  shipping: number;
  total: number;
  estimatedDeliveryDate: string;
  status: "confirmed" | "failed";
  confirmationId: string;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  shipping: number;
  grandTotal: number;
  currency: string;
}
