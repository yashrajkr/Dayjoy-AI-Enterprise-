"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingBag, Trash2, ArrowRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { useCart } from "@/hooks/use-cart";
import { formatCurrency } from "@/lib/utils";

/**
 * CartDrawer — slide-in cart panel toggled by the cart icon in the
 * header and by `addItem` (the cart opens automatically when an item
 * is added so the customer gets immediate feedback).
 */
export function CartDrawer() {
  const router = useRouter();
  const {
    items,
    isOpen,
    setCartOpen,
    updateQuantity,
    removeItem,
    subtotal,
    currency,
    itemCount,
    isEmpty,
  } = useCart();

  const handleCheckout = () => {
    setCartOpen(false);
    router.push("/checkout");
  };

  return (
    <Sheet open={isOpen} onOpenChange={setCartOpen}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Your Cart
            {itemCount > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({itemCount} {itemCount === 1 ? "item" : "items"})
              </span>
            )}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Review the items in your shopping cart and proceed to checkout.
          </SheetDescription>
        </SheetHeader>

        {isEmpty ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={ShoppingBag}
              title="Your cart is empty"
              description="Browse the catalogue and add products you love."
              action={
                <Button asChild variant="gradient" size="sm">
                  <Link href="/products" onClick={() => setCartOpen(false)}>
                    Start shopping
                  </Link>
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-2">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.div
                    key={item.productId}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex gap-3 rounded-lg border border-border p-3"
                  >
                    <Link
                      href={`/products/${item.slug}`}
                      onClick={() => setCartOpen(false)}
                      className="shrink-0"
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-16 w-16 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted">
                          <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </Link>

                    <div className="flex flex-1 flex-col">
                      <Link
                        href={`/products/${item.slug}`}
                        onClick={() => setCartOpen(false)}
                        className="line-clamp-2 text-sm font-medium hover:text-primary"
                      >
                        {item.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatCurrency(item.unitPrice, currency)} each
                      </p>

                      <div className="mt-auto flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              updateQuantity(item.productId, item.quantity - 1)
                            }
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center text-sm font-medium">
                            {item.quantity}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              updateQuantity(item.productId, item.quantity + 1)
                            }
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <button
                          onClick={() => removeItem(item.productId)}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="border-t border-border p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">
                  {formatCurrency(subtotal, currency)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Shipping & taxes calculated at checkout.
              </p>
              <Separator className="my-3" />
              <div className="flex flex-col gap-2">
                <Button
                  variant="gradient"
                  className="w-full"
                  onClick={handleCheckout}
                >
                  Checkout
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setCartOpen(false)}
                >
                  Continue shopping
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
