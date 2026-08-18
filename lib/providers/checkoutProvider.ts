import { CartItem, MerchantOrder } from "../types";
import { groupByMerchant } from "../cartMath";

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function confirmationId(merchantId: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${merchantId.replace("m_", "").slice(0, 4).toUpperCase()}-${rand}`;
}

/**
 * SIMULATED checkout orchestration. There is no mature, generally-available
 * "agentic commerce" standard today for an assistant to place real orders
 * with arbitrary independent merchants, so this mocks the shape a real
 * integration would have: split the cart by merchant, "place" one order per
 * merchant, and return a confirmation + delivery estimate for each.
 *
 * TODO(real provider): once a standard like Stripe's Agentic Commerce
 * Protocol (or a merchant's own checkout API) is wired up behind
 * CHECKOUT_PROVIDER_API_KEY, replace the body of this function with real
 * per-merchant order calls, keeping the MerchantOrder[] return shape.
 */
export async function placeOrders(cartItems: CartItem[]): Promise<MerchantOrder[]> {
  const groups = groupByMerchant(cartItems);

  return groups.map((group) => {
    const maxDeliveryDays = Math.max(...group.items.map((i) => i.estimatedDeliveryDays));
    return {
      merchantId: group.merchant.id,
      merchantName: group.merchant.name,
      region: group.merchant.region,
      items: group.items,
      subtotal: group.subtotal,
      shipping: group.shipping,
      total: group.total,
      estimatedDeliveryDate: addDays(maxDeliveryDays),
      status: "confirmed",
      confirmationId: confirmationId(group.merchant.id),
    };
  });
}
