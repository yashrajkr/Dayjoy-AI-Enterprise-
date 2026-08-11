"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem } from "@/types/product.types";
import { STORAGE_KEYS } from "@/lib/constants";

interface CartState {
  items: CartItem[];
  isOpen: boolean;

  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setCartOpen: (open: boolean) => void;
  toggleCart: () => void;

  /** Derived: total item count (sum of quantities). */
  itemCount: () => number;
  /** Derived: cart subtotal in the cart's currency. */
  subtotal: () => number;
}

/**
 * Cart store — persisted to `localStorage` so an unauthenticated
 * customer's cart survives refreshes and is available to merge on
 * login. Prices are snapshotted at add-time; the cart drawer re-checks
 * them server-side before checkout.
 */
export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,

      addItem: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find(
            (i) => i.productId === item.productId,
          );
          if (existing) {
            const max = item.maxStock ?? Infinity;
            return {
              items: state.items.map((i) =>
                i.productId === item.productId
                  ? {
                      ...i,
                      quantity: Math.min(i.quantity + quantity, max),
                    }
                  : i,
              ),
              isOpen: true,
            };
          }
          return {
            items: [...state.items, { ...item, quantity }],
            isOpen: true,
          };
        }),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        })),

      updateQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items
            .map((i) => {
              if (i.productId !== productId) return i;
              const max = i.maxStock ?? Infinity;
              return {
                ...i,
                quantity: Math.max(0, Math.min(quantity, max)),
              };
            })
            .filter((i) => i.quantity > 0),
        })),

      clearCart: () => set({ items: [] }),
      setCartOpen: (isOpen) => set({ isOpen }),
      toggleCart: () => set((s) => ({ isOpen: !s.isOpen })),

      itemCount: () =>
        get().items.reduce((sum, i) => sum + i.quantity, 0),

      subtotal: () =>
        get().items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
    }),
    {
      name: STORAGE_KEYS.CART,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
