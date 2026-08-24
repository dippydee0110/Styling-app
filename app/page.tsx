"use client";

import { useState } from "react";
import { useAppStore } from "../lib/store/useAppStore";
import { CartItem, ChatMessage, Product, Slot, StyleProfile } from "../lib/types";
import StyleIntakeForm from "../components/StyleIntakeForm";
import ModelCanvas from "../components/ModelCanvas";
import AlternativesPanel from "../components/AlternativesPanel";
import CartSidebar from "../components/CartSidebar";
import ChatAddBox from "../components/ChatAddBox";
import CheckoutFlow from "../components/CheckoutFlow";

export default function Home() {
  const {
    styleProfile,
    cartItems,
    generatedModel,
    chatMessages,
    isGenerating,
    setProfile,
    addItem,
    removeItem,
    removeSlot,
    setCartItems,
    setGeneratedModel,
    setGenerating,
    addChatMessage,
  } = useAppStore();

  const [activeSlot, setActiveSlot] = useState<Slot | null>(null);
  const [activeProductId, setActiveProductId] = useState<string | undefined>(undefined);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [isChatBusy, setIsChatBusy] = useState(false);

  async function syncModel(profile: StyleProfile, nextCartItems: CartItem[]) {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          cartItems: nextCartItems,
          previousImageUrl: generatedModel?.imageUrl,
        }),
      });
      const data = await res.json();
      setGeneratedModel(data.model);
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerate(profile: StyleProfile) {
    setProfile(profile);
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, cartItems: [] }),
      });
      const data = await res.json();
      setCartItems(data.cartItems);
      setGeneratedModel(data.model);
    } finally {
      setGenerating(false);
    }
  }

  function handleSlotClick(slot: Slot) {
    const item = cartItems.find((i) => i.slot === slot);
    setActiveSlot(slot);
    setActiveProductId(item?.id);
  }

  function handleFindSimilar(slot: Slot, productId: string) {
    setActiveSlot(slot);
    setActiveProductId(productId);
  }

  async function handleSelectAlternative(product: Product) {
    addItem(product);
    setActiveSlot(null);
    const next = [...cartItems.filter((i) => i.slot !== product.slot), { ...product, quantity: 1 }];
    await syncModel(styleProfile, next);
  }

  async function handleRemoveSlot(slot: Slot) {
    removeSlot(slot);
    const next = cartItems.filter((i) => i.slot !== slot);
    await syncModel(styleProfile, next);
  }

  async function handleRemoveItem(productId: string) {
    removeItem(productId);
    const next = cartItems.filter((i) => i.id !== productId);
    await syncModel(styleProfile, next);
  }

  async function handleSendChat(text: string) {
    addChatMessage({ id: `u_${Date.now()}`, role: "user", text });
    setIsChatBusy(true);
    try {
      const res = await fetch("/api/chat-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      const assistantMessage: ChatMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        text: data.reply,
        products: data.products,
      };
      addChatMessage(assistantMessage);
    } finally {
      setIsChatBusy(false);
    }
  }

  async function handleAddFromChat(product: Product) {
    addItem(product);
    const next = [...cartItems.filter((i) => i.slot !== product.slot), { ...product, quantity: 1 }];
    await syncModel(styleProfile, next);
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header>
        <h1 className="font-display text-2xl text-ink">AI Styling Studio</h1>
        <p className="text-sm text-ink/60">
          Describe yourself in plain English, see an AI model wear your recommended outfit, and shop it —
          swap, remove, and add pieces as you go.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <StyleIntakeForm initialProfile={styleProfile} isGenerating={isGenerating} onGenerate={handleGenerate} />
          <ModelCanvas
            model={generatedModel}
            cartItems={cartItems}
            onSlotClick={handleSlotClick}
            onRemoveSlot={handleRemoveSlot}
          />
        </div>

        <div className="space-y-6">
          <CartSidebar
            cartItems={cartItems}
            onRemove={handleRemoveItem}
            onFindSimilar={handleFindSimilar}
            onCheckout={() => setCheckoutOpen(true)}
          />
          <ChatAddBox
            messages={chatMessages}
            isBusy={isChatBusy}
            onSendMessage={handleSendChat}
            onAddProduct={handleAddFromChat}
          />
        </div>
      </div>

      {activeSlot && (
        <AlternativesPanel
          slot={activeSlot}
          currentProductId={activeProductId}
          onClose={() => setActiveSlot(null)}
          onSelect={handleSelectAlternative}
        />
      )}

      {checkoutOpen && <CheckoutFlow cartItems={cartItems} onClose={() => setCheckoutOpen(false)} />}
    </main>
  );
}
