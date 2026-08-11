"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShoppingCart,
  ArrowLeft,
  MapPin,
  CreditCard,
  CheckCircle2,
  Truck,
  Loader2,
} from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  Customer,
  CustomerAddress,
  PaymentMethod,
} from "@/types/customer.types";
import type { CreateOrderResponse } from "@/types/order.types";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string; sub: string }> = [
  { value: "upi", label: "UPI", sub: "Google Pay, PhonePe, Paytm" },
  { value: "card", label: "Credit / Debit Card", sub: "Visa, Mastercard, RuPay" },
  { value: "netbanking", label: "Net Banking", sub: "All major banks" },
  { value: "wallet", label: "Wallet", sub: "Paytm, Amazon Pay" },
  { value: "cod", label: "Cash on Delivery", sub: "Pay when you receive" },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, currency, isEmpty, clearCart } = useCart();
  const { user } = useAuth();

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [notes, setNotes] = useState("");

  const customerId = user?.customerId ?? user?.id ?? "";
  const customerQuery = useQuery({
    queryKey: customerId
      ? QUERY_KEYS.customerProfile(customerId)
      : QUERY_KEYS.customer,
    queryFn: () => api.get<Customer>(`/customers/${customerId}`),
    enabled: !!customerId,
  });

  const shippingAddresses =
    customerQuery.data?.addresses.filter((a) => a.type === "shipping") ?? [];

  const defaultAddress = shippingAddresses.find((a) => a.isDefault);
  const effectiveAddressId =
    selectedAddressId ?? defaultAddress?.id ?? shippingAddresses[0]?.id ?? null;

  const placeOrder = useMutation({
    mutationFn: () =>
      api.post<CreateOrderResponse>("/orders", {
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        shippingAddressId: effectiveAddressId ?? undefined,
        paymentMethod,
        fulfillment: "delivery",
        notes: notes || undefined,
      }),
    onSuccess: (data) => {
      clearCart();
      toast.success("Order placed!", {
        description: `Your order ${data.order.number} has been confirmed.`,
      });
      if (data.paymentRedirectUrl) {
        window.location.href = data.paymentRedirectUrl;
      } else {
        router.push(`/orders/${data.order.id}`);
      }
    },
    onError: (err) =>
      toast.error("Checkout failed", { description: getErrorMessage(err) }),
  });

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <PageHeader title="Checkout" />
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Add products to your cart before checking out."
          action={
            <Button asChild variant="gradient" size="sm">
              <Link href="/products">Browse products</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const tax = Math.round(subtotal * 0.18);
  const shipping = subtotal >= 1000 ? 0 : 99;
  const total = subtotal + tax + shipping;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/products">
          <ArrowLeft className="h-4 w-4" /> Continue shopping
        </Link>
      </Button>

      <PageHeader title="Checkout" description="Review your order and complete your purchase." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          {/* Shipping address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-4 w-4" /> Shipping Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              {customerQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : shippingAddresses.length === 0 ? (
                <EmptyState
                  icon={MapPin}
                  title="No shipping address"
                  description="Add a shipping address in your profile to continue."
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link href="/profile?tab=address">Add address</Link>
                    </Button>
                  }
                />
              ) : (
                <RadioGroup
                  value={effectiveAddressId ?? undefined}
                  onValueChange={setSelectedAddressId}
                  className="space-y-2"
                >
                  {shippingAddresses.map((addr) => (
                    <label
                      key={addr.id}
                      htmlFor={`addr-${addr.id}`}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        effectiveAddressId === addr.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent",
                      )}
                    >
                      <RadioGroupItem
                        value={addr.id}
                        id={`addr-${addr.id}`}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{addr.fullName}</span>
                          {addr.isDefault && (
                            <Badge variant="secondary" className="text-[10px]">
                              Default
                            </Badge>
                          )}
                          {addr.label && (
                            <span className="text-xs text-muted-foreground">
                              · {addr.label}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-muted-foreground">
                          {addr.line1}
                          {addr.line2 ? `, ${addr.line2}` : ""}
                        </p>
                        <p className="text-muted-foreground">
                          {addr.city}, {addr.state} {addr.postalCode}
                        </p>
                        <p className="text-muted-foreground">{addr.phone}</p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              )}
            </CardContent>
          </Card>

          {/* Payment method */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4" /> Payment Method
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                className="space-y-2"
              >
                {PAYMENT_METHODS.map((method) => (
                  <label
                    key={method.value}
                    htmlFor={`pay-${method.value}`}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                      paymentMethod === method.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent",
                    )}
                  >
                    <RadioGroupItem
                      value={method.value}
                      id={`pay-${method.value}`}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{method.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {method.sub}
                      </p>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Order notes */}
          <Card>
            <CardContent className="p-6">
              <Label htmlFor="notes">Order notes (optional)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Delivery instructions, gift message, etc."
                className="mt-2"
              />
            </CardContent>
          </Card>
        </div>

        {/* Order summary */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.productId} className="flex gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Qty: {item.quantity}
                      </p>
                    </div>
                    <span className="text-sm font-medium">
                      {formatCurrency(item.unitPrice * item.quantity, currency)}
                    </span>
                  </li>
                ))}
              </ul>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(subtotal, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax (18% GST)</span>
                  <span>{formatCurrency(tax, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>
                    {shipping === 0 ? (
                      <span className="text-success">FREE</span>
                    ) : (
                      formatCurrency(shipping, currency)
                    )}
                  </span>
                </div>
                {shipping === 0 && (
                  <p className="flex items-center gap-1 text-xs text-success">
                    <Truck className="h-3 w-3" /> Free shipping applied
                  </p>
                )}
              </div>

              <Separator />

              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>

              <Button
                variant="gradient"
                className="w-full"
                size="lg"
                disabled={!effectiveAddressId}
                loading={placeOrder.isPending}
                onClick={() => placeOrder.mutate()}
              >
                {placeOrder.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Placing order…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Place order
                  </>
                )}
              </Button>

              {!effectiveAddressId && (
                <p className="text-center text-xs text-muted-foreground">
                  Select a shipping address to continue.
                </p>
              )}
              <p className="text-center text-[11px] text-muted-foreground">
                By placing this order you agree to our Terms of Service and
                Return Policy.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
