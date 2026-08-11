"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  IndianRupee,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { customersService, ordersService, productsService } from "@/lib/services";
import { cn, formatCurrency } from "@/lib/utils";
import type { Customer, Product } from "@/types";

interface CartItem {
  product: Product;
  quantity: number;
}

export default function NewOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [shippingAddress, setShippingAddress] = useState("");

  const { data: customers } = useQuery({
    queryKey: ["customers", { search: customerSearch }],
    queryFn: () =>
      customersService.list({ search: customerSearch || undefined }),
  });

  const { data: products } = useQuery({
    queryKey: ["products", { search: productSearch }],
    queryFn: () =>
      productsService.list({ search: productSearch || undefined }),
  });

  // Pre-fill from URL params (deep link from product detail)
  useEffect(() => {
    const customerId = searchParams.get("customerId");
    const productId = searchParams.get("productId");
    if (customerId && customers) {
      const found = customers.find((c) => c.id === customerId);
      if (found) setSelectedCustomer(found);
    }
    if (productId && products) {
      const found = products.find((p) => p.id === productId);
      if (found && !cart.some((c) => c.product.id === found.id)) {
        setCart([...cart, { product: found, quantity: 1 }]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, products]);

  const { subtotal, tax, shipping, total, commission } = useMemo(() => {
    const sub = cart.reduce(
      (s, i) => s + i.product.distributorPrice * i.quantity,
      0,
    );
    const tx = Math.round(sub * 0.18);
    const sh = sub > 5000 ? 0 : 149;
    return {
      subtotal: sub,
      tax: tx,
      shipping: sh,
      total: sub + tx + sh,
      commission: cart.reduce(
        (s, i) =>
          s +
          Math.round(
            (i.product.distributorPrice * i.quantity * i.product.commissionRate) /
              100,
          ),
        0,
      ),
    };
  }, [cart]);

  const createMutation = useMutation({
    mutationFn: () => {
      if (!selectedCustomer) throw new Error("Select a customer first.");
      if (cart.length === 0) throw new Error("Add at least one product.");
      if (!shippingAddress.trim())
        throw new Error("Shipping address is required.");
      return ordersService.create({
        customerId: selectedCustomer.id,
        items: cart.map((c) => ({
          productId: c.product.id,
          quantity: c.quantity,
        })),
        shippingAddress: shippingAddress.trim(),
      });
    },
    onSuccess: (order) => {
      toast.success(`Order ${order.orderNumber} created successfully!`);
      router.push(`/orders/${order.id}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(1, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const addToCart = (product: Product) => {
    if (product.stock === 0) {
      toast.error(`${product.name} is out of stock.`);
      return;
    }
    if (cart.some((c) => c.product.id === product.id)) {
      toast.info(`${product.name} is already in your cart.`);
      return;
    }
    setCart([...cart, { product, quantity: 1 }]);
    toast.success(`${product.name} added to cart.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Order"
        description="Create an order for a customer."
        icon={ShoppingCart}
        breadcrumbs={[
          { label: "Orders", href: "/orders" },
          { label: "New Order" },
        ]}
        actions={
          <Button variant="outline" onClick={() => router.push("/orders")}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left — customer + product search + cart */}
        <div className="space-y-6 lg:col-span-2">
          {/* Customer selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserIcon className="h-4 w-4" />
                1. Select customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedCustomer ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                  <div>
                    <p className="font-medium text-foreground">
                      {selectedCustomer.firstName} {selectedCustomer.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {selectedCustomer.phone} · {selectedCustomer.email ?? "No email"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedCustomer(null)}
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search by name, email, or phone…"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {customers?.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          if (c.address) {
                            setShippingAddress(
                              `${c.address}${c.city ? `, ${c.city}` : ""}${c.state ? `, ${c.state}` : ""}${c.pincode ? ` - ${c.pincode}` : ""}`,
                            );
                          }
                        }}
                        className="flex w-full items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-accent/30"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {c.firstName} {c.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {c.phone} · {c.email ?? "No email"}
                          </p>
                        </div>
                        <Badge variant="secondary">{c.type}</Badge>
                      </button>
                    ))}
                    {customers && customers.length === 0 && (
                      <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                        No customers found.
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Product search */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" />
                2. Add products
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search products…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
                {products?.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p)}
                    disabled={p.stock === 0}
                    className="flex items-center gap-3 rounded-lg border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-accent/30 disabled:opacity-50"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                      {p.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.images[0]}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-full w-full p-2 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {p.name}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                        <IndianRupee className="h-3 w-3" />
                        {formatCurrency(p.distributorPrice)} · {p.commissionRate}%
                      </p>
                    </div>
                    <Plus className="h-4 w-4 shrink-0 text-primary" />
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Cart */}
          {cart.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="h-4 w-4" />
                  3. Cart ({cart.length} {cart.length === 1 ? "item" : "items"})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                      {item.product.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.product.images[0]}
                          alt={item.product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-full w-full p-2 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.product.distributorPrice)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => updateQty(item.product.id, -1)}
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => updateQty(item.product.id, 1)}
                        disabled={item.quantity >= item.product.stock}
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="w-24 text-right text-sm font-semibold">
                      {formatCurrency(
                        item.product.distributorPrice * item.quantity,
                      )}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(item.product.id)}
                      aria-label={`Remove ${item.product.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Shipping address */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Shipping address</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="shippingAddress" className="sr-only">
                Shipping address
              </Label>
              <Textarea
                id="shippingAddress"
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                placeholder="Full shipping address including city, state, and pincode…"
                rows={3}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right — order summary */}
        <div className="space-y-6">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-base">Order summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax (18% GST)</span>
                <span className="font-medium">{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-medium">
                  {shipping === 0 ? "FREE" : formatCurrency(shipping)}
                </span>
              </div>
              {shipping > 0 && (
                <p className="text-xs text-muted-foreground">
                  Free shipping on orders above ₹5,000.
                </p>
              )}
              <Separator />
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Your commission
                </p>
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(commission)}
                </p>
              </div>

              <Button
                className="w-full"
                loading={createMutation.isPending}
                disabled={!selectedCustomer || cart.length === 0}
                onClick={() => createMutation.mutate()}
              >
                <Check className="h-4 w-4" />
                Place Order
              </Button>

              {!selectedCustomer && (
                <p className="text-center text-xs text-muted-foreground">
                  Select a customer to continue.
                </p>
              )}
              {cart.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  Add at least one product.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
