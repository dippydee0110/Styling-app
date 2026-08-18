"use client";

import { useEffect, useState } from "react";
import { Product, Slot } from "../lib/types";

interface Props {
  slot: Slot;
  currentProductId?: string;
  onClose: () => void;
  onSelect: (product: Product) => void;
}

export default function AlternativesPanel({ slot, currentProductId, onClose, onSelect }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    const url = currentProductId
      ? `/api/products/${currentProductId}/similar`
      : `/api/products/search?slot=${slot}&limit=8`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setProducts(data.products ?? []);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slot, currentProductId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-paper p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg text-ink">Alternatives — {slot}</h3>
          <button onClick={onClose} className="text-sm text-ink/50 hover:text-ink">
            Close
          </button>
        </div>

        {isLoading && <p className="text-sm text-ink/50">Finding similar picks...</p>}
        {!isLoading && products.length === 0 && (
          <p className="text-sm text-ink/50">No alternatives found for this slot.</p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {products.map((product) => (
            <button
              key={product.id}
              onClick={() => onSelect(product)}
              className="flex flex-col overflow-hidden rounded-xl border border-sand bg-white text-left transition hover:border-accent hover:shadow-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.imageUrl} alt={product.name} className="aspect-square w-full object-cover" />
              <div className="flex flex-1 flex-col gap-0.5 p-2">
                <span className="text-xs font-medium leading-tight text-ink">{product.name}</span>
                <span className="text-[11px] text-ink/50">
                  {product.merchant.name} · {product.merchant.region}
                </span>
                <span className="mt-auto text-xs font-semibold text-accent">
                  ${product.price.toFixed(2)}{" "}
                  <span className="font-normal text-ink/40">+ ${product.shippingCost.toFixed(2)} ship</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
