import { CartItem, CartTotals, Merchant } from "./types";

export interface MerchantGroup {
  merchant: Merchant;
  items: CartItem[];
  subtotal: number;
  shipping: number;
  total: number;
}

export function groupByMerchant(cartItems: CartItem[]): MerchantGroup[] {
  const groups = new Map<string, MerchantGroup>();
  for (const item of cartItems) {
    const key = item.merchant.id;
    if (!groups.has(key)) {
      groups.set(key, { merchant: item.merchant, items: [], subtotal: 0, shipping: 0, total: 0 });
    }
    const group = groups.get(key)!;
    group.items.push(item);
    group.subtotal += item.price * item.quantity;
    group.shipping += item.shippingCost;
  }
  for (const group of groups.values()) {
    group.total = group.subtotal + group.shipping;
  }
  return Array.from(groups.values());
}

export function computeTotals(cartItems: CartItem[]): CartTotals {
  const groups = groupByMerchant(cartItems);
  const subtotal = groups.reduce((sum, g) => sum + g.subtotal, 0);
  const shipping = groups.reduce((sum, g) => sum + g.shipping, 0);
  return {
    itemCount: cartItems.reduce((sum, i) => sum + i.quantity, 0),
    subtotal,
    shipping,
    grandTotal: subtotal + shipping,
    currency: cartItems[0]?.currency ?? "USD",
  };
}
