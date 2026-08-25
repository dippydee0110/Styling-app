"use client";

import { CartItem, GeneratedModel, Slot } from "../lib/types";
import { SLOT_REGIONS, VIEWBOX, regionToPercent } from "../lib/slotLayout";

interface Props {
  model: GeneratedModel | null;
  cartItems: CartItem[];
  isGenerating: boolean;
  onSlotClick: (slot: Slot) => void;
  onRemoveSlot: (slot: Slot) => void;
}

export default function ModelCanvas({ model, cartItems, isGenerating, onSlotClick, onRemoveSlot }: Props) {
  const itemBySlot = new Map(cartItems.map((item) => [item.slot, item]));

  return (
    <div className="rounded-2xl border border-sand bg-white/60 p-5 shadow-sm">
      <h2 className="font-display text-lg text-ink">Your AI model</h2>
      {model?.summary && <p className="mt-1 text-sm text-ink/60">{model.summary}</p>}

      <div
        className="relative mx-auto mt-4 overflow-hidden rounded-xl bg-paper"
        style={{ width: "100%", maxWidth: 320, aspectRatio: `${VIEWBOX.width} / ${VIEWBOX.height}` }}
      >
        {model ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={model.imageUrl}
              alt="Generated AI styling model"
              className={`h-full w-full object-cover transition-opacity ${isGenerating ? "opacity-40" : ""}`}
            />
            {!isGenerating &&
              Object.entries(SLOT_REGIONS).map(([slotKey, region]) => {
                const slot = slotKey as Slot;
                const item = itemBySlot.get(slot);
                if (!item) return null;
                const pos = regionToPercent(region);
                return (
                  <div key={slot} className="hotspot group" style={pos} onClick={() => onSlotClick(slot)} title={`${item.name} — click to see alternatives`}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveSlot(slot);
                      }}
                      title={`Remove ${item.name}`}
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-paper opacity-0 shadow transition group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
          </>
        ) : !isGenerating ? (
          <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-ink/50">
            Describe your style and generate a look to see your AI model here.
          </div>
        ) : null}

        {isGenerating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper/70 p-6 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-sm font-medium text-ink">Generating your photorealistic look…</p>
            <p className="text-xs text-ink/60">
              Free-tier image generation can take up to a minute — thanks for your patience.
            </p>
          </div>
        )}
      </div>
      {model && !isGenerating && (
        <p className="mt-3 text-center text-xs text-ink/40">
          Click any highlighted area on the model to see alternatives, or click the × to remove it.
        </p>
      )}
    </div>
  );
}
