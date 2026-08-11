"use client";

import { useCartStore } from "@/store/cart.store";
import type { CartItem } from "@/types/product.types";

/**
 * `useCart` — thin selector wrapper around the Zustand cart store.
 *
 * Components subscribe to the slices they need (item count vs. subtotal
 * vs. items) — calling this hook returns all of them, but each value is
 * a stable reference thanks to Zustand's shallow equality, so
 * re-renders are minimal.
 */
export function useCart() {
  const items = useCartStore((s) => s.items);
  const isOpen = useCartStore((s) => s.isOpen);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const clearCart = useCartStore((s) => s.clearCart);
  const setCartOpen = useCartStore((s) => s.setCartOpen);
  const toggleCart = useCartStore((s) => s.toggleCart);
  const itemCount = useCartStore((s) => s.itemCount);
  const subtotal = useCartStore((s) => s.subtotal);

  const count = itemCount();
  const total = subtotal();
  const currency = items[0]?.currency ?? "INR";

  return {
    items,
    isOpen,
    itemCount: count,
    subtotal: total,
    currency,
    isEmpty: items.length === 0,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    setCartOpen,
    toggleCart,
  };
}

export type UseCartReturn = ReturnType<typeof useCart>;
export type { CartItem };
