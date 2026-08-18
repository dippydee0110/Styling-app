"use client";

import { useState } from "react";
import { CartItem, MerchantOrder } from "../lib/types";
import { groupByMerchant, computeTotals } from "../lib/cartMath";

interface Props {
  cartItems: CartItem[];
  onClose: () => void;
}

export default function CheckoutFlow({ cartItems, onClose }: Props) {
  const [orders, setOrders] = useState<MerchantOrder[] | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = groupByMerchant(cartItems);
  const totals = computeTotals(cartItems);

  async function handlePlaceOrders() {
    setIsPlacing(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cartItems }),
      });
      if (!res.ok) throw new Error("Checkout failed");
      const data = await res.json();
      setOrders(data.orders);
    } catch {
      setError("Something went wrong placing your orders. Please try again.");
    } finally {
      setIsPlacing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-paper p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg text-ink">
            {orders ? "Orders confirmed" : "Review & checkout"}
          </h3>
          <button onClick={onClose} className="text-sm text-ink/50 hover:text-ink">
            Close
          </button>
        </div>

        {!orders && (
          <>
            <p className="mb-3 text-xs text-ink/50">
              This is a simulated checkout — no real charge is made. Each shop is billed and shipped
              separately.
            </p>
            <div className="space-y-3">
              {groups.map((group) => (
                <div key={group.merchant.id} className="rounded-xl border border-sand p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-ink">{group.merchant.name}</span>
                    <span className="text-xs text-ink/40">{group.merchant.region}</span>
                  </div>
                  <ul className="mt-1 text-xs text-ink/60">
                    {group.items.map((item) => (
                      <li key={item.id}>
                        {item.name} — ${item.price.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex justify-between text-xs text-ink/70">
                    <span>Subtotal ${group.subtotal.toFixed(2)} + Shipping ${group.shipping.toFixed(2)}</span>
                    <span className="font-semibold">${group.total.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-between text-base font-semibold text-ink">
              <span>Grand total ({groups.length} shops)</span>
              <span>${totals.grandTotal.toFixed(2)}</span>
            </div>

            {error && <p className="mt-2 text-sm text-accent">{error}</p>}

            <button
              onClick={handlePlaceOrders}
              disabled={isPlacing}
              className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:opacity-50"
            >
              {isPlacing ? "Placing orders..." : `Place ${groups.length} order${groups.length === 1 ? "" : "s"}`}
            </button>
          </>
        )}

        {orders && (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.merchantId} className="rounded-xl border border-accent2/40 bg-accent2/5 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium text-ink">{order.merchantName}</span>
                  <span className="text-xs font-medium text-accent2">Confirmed</span>
                </div>
                <p className="mt-1 text-xs text-ink/60">Confirmation #{order.confirmationId}</p>
                <p className="text-xs text-ink/60">
                  Estimated delivery{" "}
                  {new Date(order.estimatedDeliveryDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <p className="mt-1 text-xs font-semibold text-ink">Total ${order.total.toFixed(2)}</p>
              </div>
            ))}
            <p className="text-xs text-ink/40">
              Simulated confirmations — wire a real agentic-commerce provider in
              lib/providers/checkoutProvider.ts to place real orders.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
