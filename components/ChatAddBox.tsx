"use client";

import { useState } from "react";
import { ChatMessage, Product } from "../lib/types";

interface Props {
  messages: ChatMessage[];
  isBusy: boolean;
  onSendMessage: (text: string) => Promise<void>;
  onAddProduct: (product: Product) => void;
}

export default function ChatAddBox({ messages, isBusy, onSendMessage, onAddProduct }: Props) {
  const [input, setInput] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    await onSendMessage(text);
  }

  return (
    <div className="rounded-2xl border border-sand bg-white/60 p-5 shadow-sm">
      <h2 className="font-display text-lg text-ink">Add anything, anytime</h2>
      <p className="mt-1 text-sm text-ink/60">
        e.g. &ldquo;add a red belt under $30&rdquo; or &ldquo;show me a wool scarf&rdquo;
      </p>

      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
        {messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                message.role === "user" ? "bg-accent text-paper" : "bg-sand/70 text-ink"
              }`}
            >
              {message.text}
            </div>
            {message.products && message.products.length > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {message.products.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => onAddProduct(product)}
                    className="flex items-center gap-2 rounded-lg border border-sand bg-white p-1.5 text-left transition hover:border-accent"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={product.imageUrl} alt={product.name} className="h-9 w-9 rounded-md object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-medium text-ink">{product.name}</span>
                      <span className="block text-[11px] text-accent">${product.price.toFixed(2)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe an item to add..."
          className="flex-1 rounded-xl border border-sand bg-paper p-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={isBusy || !input.trim()}
          className="rounded-xl bg-ink px-4 py-2 text-sm text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
