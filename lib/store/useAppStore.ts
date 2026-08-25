import { create } from "zustand";
import { persist } from "zustand/middleware";
import { CartItem, ChatMessage, GeneratedModel, Product, SavedLook, Slot, StyleProfile } from "../types";

interface AppState {
  styleProfile: StyleProfile;
  cartItems: CartItem[];
  generatedModel: GeneratedModel | null;
  chatMessages: ChatMessage[];
  isGenerating: boolean;
  savedLooks: SavedLook[];

  setProfile: (profile: StyleProfile) => void;
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  removeSlot: (slot: Slot) => void;
  setCartItems: (items: CartItem[]) => void;
  clearCart: () => void;
  setGeneratedModel: (model: GeneratedModel | null) => void;
  setGenerating: (value: boolean) => void;
  addChatMessage: (message: ChatMessage) => void;
  saveLook: (name?: string) => void;
  loadLook: (id: string) => void;
  deleteLook: (id: string) => void;
  renameLook: (id: string, name: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      styleProfile: { freeText: "", occasion: "", region: "" },
      cartItems: [],
      generatedModel: null,
      chatMessages: [],
      isGenerating: false,
      savedLooks: [],

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

      saveLook: (name) =>
        set((state) => {
          if (!state.generatedModel) return state;
          const look: SavedLook = {
            id: `look_${Date.now()}`,
            name: name?.trim() || `Look – ${new Date().toLocaleString()}`,
            savedAt: new Date().toISOString(),
            profile: state.styleProfile,
            cartItems: state.cartItems,
            model: state.generatedModel,
          };
          return { savedLooks: [look, ...state.savedLooks] };
        }),

      loadLook: (id) =>
        set((state) => {
          const look = state.savedLooks.find((l) => l.id === id);
          if (!look) return state;
          return {
            styleProfile: look.profile,
            cartItems: look.cartItems,
            generatedModel: look.model,
          };
        }),

      deleteLook: (id) =>
        set((state) => ({ savedLooks: state.savedLooks.filter((l) => l.id !== id) })),

      renameLook: (id, name) =>
        set((state) => ({
          savedLooks: state.savedLooks.map((l) =>
            l.id === id && name.trim() ? { ...l, name: name.trim() } : l
          ),
        })),
    }),
    {
      name: "ai-styling-app-storage",
      partialize: (state) => ({
        styleProfile: state.styleProfile,
        cartItems: state.cartItems,
        generatedModel: state.generatedModel,
        chatMessages: state.chatMessages,
        savedLooks: state.savedLooks,
      }),
    }
  )
);
