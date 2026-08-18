"use client";

import { CartItem, Slot } from "../lib/types";
import { computeTotals, groupByMerchant } from "../lib/cartMath";

interface Props {
  cartItems: CartItem[];
  onRemove: (productId: string) => void;
  onFindSimilar: (slot: Slot, productId: string) => void;
  onCheckout: () => void;
}

export default function CartSidebar({ cartItems, onRemove, onFindSimilar, onCheckout }: Props) {
  const totals = computeTotals(cartItems);
  const groups = groupByMerchant(cartItems);

  return (
    <div className="rounded-2xl border border-sand bg-white/60 p-5 shadow-sm">
      <h2 className="font-display text-lg text-ink">Your look, shoppable</h2>

      {cartItems.length === 0 && (
        <p className="mt-2 text-sm text-ink/50">Nothing in your cart yet — generate a look or add items via chat.</p>
      )}

      <div className="mt-3 space-y-4">
        {groups.map((group) => (
          <div key={group.merchant.id} className="rounded-xl border border-sand/70 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-ink">{group.merchant.name}</span>
              <span className="text-xs text-ink/40">{group.merchant.region}</span>
            </div>
            <div className="mt-2 space-y-2">
              {group.items.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt={item.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">{item.name}</p>
                    <p className="text-[11px] text-ink/50">
                      ${item.price.toFixed(2)} · ship ${item.shippingCost.toFixed(2)}
                    </p>
                    <button
                      onClick={() => onFindSimilar(item.slot, item.id)}
                      className="text-[11px] text-accent2 underline underline-offset-2"
                    >
                      Find similar
                    </button>
                  </div>
                  <button
                    onClick={() => onRemove(item.id)}
                    title={`Remove ${item.name}`}
                    className="shrink-0 rounded-full px-2 py-1 text-xs text-ink/40 hover:bg-sand hover:text-ink"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between border-t border-sand/70 pt-2 text-xs text-ink/60">
              <span>Subtotal ${group.subtotal.toFixed(2)}</span>
              <span>Shipping ${group.shipping.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-1 border-t border-sand pt-3 text-sm">
        <div className="flex justify-between text-ink/70">
          <span>Items subtotal</span>
          <span>${totals.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-ink/70">
          <span>Total shipping</span>
          <span>${totals.shipping.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-base font-semibold text-ink">
          <span>Grand total</span>
          <span>${totals.grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <button
        onClick={onCheckout}
        disabled={cartItems.length === 0}
        className="mt-4 w-full rounded-xl bg-accent2 px-4 py-2.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Checkout ({groups.length} shop{groups.length === 1 ? "" : "s"})
      </button>
    </div>
  );
}
