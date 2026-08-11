"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  IndianRupee,
  MapPin,
  Package,
  Phone,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Separator } from "@/components/ui/separator";
import { ordersService } from "@/lib/services";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDateTime,
  getStatusColor,
} from "@/lib/utils";

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const { data: order, isLoading, isError, error } = useQuery({
    queryKey: ["order", params.id],
    queryFn: () => ordersService.get(params.id),
    enabled: !!params.id,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-3/4" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <InlineAlert variant="error">
        Failed to load order: {(error as Error)?.message ?? "Not found"}.{" "}
        <button
          type="button"
          onClick={() => router.push("/orders")}
          className="underline"
        >
          Back to orders
        </button>
      </InlineAlert>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.orderNumber}
        description={`Placed on ${formatDateTime(order.createdAt)}`}
        icon={ShoppingCart}
        breadcrumbs={[
          { label: "Orders", href: "/orders" },
          { label: order.orderNumber },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/orders")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {order.invoiceUrl && (
              <Button
                variant="outline"
                onClick={() => {
                  toast.info("Invoice download started.");
                  window.open(order.invoiceUrl!, "_blank");
                }}
              >
                <Download className="h-4 w-4" />
                Invoice
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — items + timeline */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 p-4">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                      {item.productImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.productImage}
                          alt={item.productName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-full w-full p-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {item.productName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.unitPrice)} × {item.quantity}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground">
                        {formatCurrency(item.lineTotal)}
                      </p>
                      <p className="flex items-center justify-end gap-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                        <IndianRupee className="h-3 w-3" />
                        {formatCurrency(item.commissionEarned)} commission
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Truck className="h-4 w-4" />
                Order timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-5 border-l border-border pl-6">
                {order.timeline.map((entry, idx) => {
                  const isLast = idx === order.timeline.length - 1;
                  return (
                    <li key={entry.id} className="relative">
                      <span
                        className={cn(
                          "absolute -left-[1.6rem] top-1 flex h-3 w-3 items-center justify-center rounded-full ring-4 ring-background",
                          isLast ? "bg-primary" : "bg-emerald-500",
                        )}
                      >
                        {!isLast && (
                          <CheckCircle2 className="h-3 w-3 text-white" />
                        )}
                      </span>
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {entry.label}
                        </p>
                        <time className="shrink-0 text-xs text-muted-foreground">
                          {formatDateTime(entry.timestamp)}
                        </time>
                      </div>
                      {entry.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {entry.description}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Right column — summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium">{formatCurrency(order.tax)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span className="font-medium">
                  {order.shipping === 0 ? "FREE" : formatCurrency(order.shipping)}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-3 text-center">
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Commission earned
                </p>
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(order.commissionEarned)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="font-medium text-foreground">{order.customerName}</p>
              <a
                href={`tel:${order.customerPhone}`}
                className="flex items-center gap-2 text-muted-foreground hover:text-primary"
              >
                <Phone className="h-3.5 w-3.5" />
                {order.customerPhone}
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Shipping address</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{order.shippingAddress}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tracking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge
                  className={cn(
                    "border-transparent",
                    getStatusColor(order.status),
                  )}
                >
                  {ORDER_STATUS_LABELS[order.status]}
                </Badge>
              </div>
              {order.trackingNumber && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Tracking #</span>
                  {order.trackingUrl ? (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {order.trackingNumber} →
                    </a>
                  ) : (
                    <span className="font-mono text-xs">
                      {order.trackingNumber}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
