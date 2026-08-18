import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem, ChatMessage, GeneratedModel, Product, Slot, StyleProfile } from "../types";

interface AppState {
  styleProfile: StyleProfile;
  cartItems: CartItem[];
  generatedModel: GeneratedModel | null;
  chatMessages: ChatMessage[];
  isGenerating: boolean;

  setProfile: (profile: StyleProfile) => void;
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  removeSlot: (slot: Slot) => void;
  setCartItems: (items: CartItem[]) => void;
  clearCart: () => void;
  setGeneratedModel: (model: GeneratedModel | null) => void;
  setGenerating: (value: boolean) => void;
  addChatMessage: (message: ChatMessage) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      styleProfile: { freeText: "", occasion: "", region: "" },
      cartItems: [],
      generatedModel: null,
      chatMessages: [],
      isGenerating: false,

      setProfile: (profile) => set({ styleProfile: profile }),

      addItem: (product) =>
        set((state) => ({
          cartItems: [
            ...state.cartItems.filter((item) => item.slot !== product.slot),
            { ...product, quantity: 1 },
          ],
        })),

      removeItem: (productId) =>
        set((state) => ({
          cartItems: state.cartItems.filter((item) => item.id !== productId),
        })),

      removeSlot: (slot) =>
        set((state) => ({
          cartItems: state.cartItems.filter((item) => item.slot !== slot),
        })),

      setCartItems: (items) => set({ cartItems: items }),

      clearCart: () => set({ cartItems: [] }),

      setGeneratedModel: (model) => set({ generatedModel: model }),

      setGenerating: (value) => set({ isGenerating: value }),

      addChatMessage: (message) =>
        set((state) => ({ chatMessages: [...state.chatMessages, message] })),
    }),
    {
      name: "ai-styling-app-storage",
      partialize: (state) => ({
        styleProfile: state.styleProfile,
        cartItems: state.cartItems,
        generatedModel: state.generatedModel,
        chatMessages: state.chatMessages,
      }),
    }
  )
);
