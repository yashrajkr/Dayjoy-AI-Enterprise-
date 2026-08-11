"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Package,
  Download,
  RotateCcw,
  Truck,
  MapPin,
  CreditCard,
  CheckCircle2,
  Clock,
  Package2,
  Home,
  ArrowLeft,
} from "lucide-react";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  getStatusColor,
  titleCase,
} from "@/lib/utils";
import type { Order, OrderTrackingEvent } from "@/types/order.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { EmptyState } from "@/components/ui/empty-state";

const TRACKING_ICONS: Record<string, typeof Clock> = {
  pending: Clock,
  confirmed: CheckCircle2,
  processing: Package2,
  shipped: Package,
  in_transit: Truck,
  out_for_delivery: Truck,
  delivered: Home,
  cancelled: Package,
  returned: Package,
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const orderQuery = useQuery({
    queryKey: QUERY_KEYS.order(id),
    queryFn: () => api.get<Order>(`/orders/${id}`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });

  if (orderQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <ErrorState
        error={orderQuery.error}
        title="Order not found"
        description="This order may have been removed or you don't have access to view it."
        onRetry={() => orderQuery.refetch()}
      />
    );
  }

  const order = orderQuery.data;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <Link href="/orders" className="hover:text-foreground">
          Orders
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{order.number}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {order.number}
            </h1>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                getStatusColor(order.status),
              )}
            >
              {titleCase(order.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Placed on {formatDateTime(order.placedAt)}
            {order.estimatedDeliveryAt && order.status !== "delivered" && (
              <>
                {" · "}
                Estimated delivery{" "}
                <span className="font-medium text-foreground">
                  {formatDate(order.estimatedDeliveryAt)}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/orders/${order.id}/invoice`}>
              <Download className="h-4 w-4" /> Invoice
            </Link>
          </Button>
          {order.isReturnable && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/orders/${order.id}/return`}>
                <RotateCcw className="h-4 w-4" /> Return
              </Link>
            </Button>
          )}
          {order.isReorderable && (
            <Button variant="gradient" size="sm">
              <Package className="h-4 w-4" /> Reorder
            </Button>
          )}
        </div>
      </div>

      {/* Tracking timeline */}
      {order.tracking && order.tracking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-4 w-4" /> Order Tracking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-6 border-l border-border pl-6">
              {order.tracking.map((event, idx) => {
                const Icon = TRACKING_ICONS[event.status] ?? Clock;
                return (
                  <li key={event.id} className="relative">
                    <span
                      className={cn(
                        "absolute -left-[31px] flex h-7 w-7 items-center justify-center rounded-full border-2",
                        event.completed
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground",
                        event.current && "ring-4 ring-primary/20",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div
                      className={cn(
                        event.completed
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <p className="text-sm font-medium">{event.label}</p>
                      {event.description && (
                        <p className="text-xs">{event.description}</p>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDateTime(event.timestamp)}
                        {event.location && ` · ${event.location}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {order.trackingNumber && (
              <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <span className="text-muted-foreground">Tracking #: </span>
                <span className="font-medium">{order.trackingNumber}</span>
                {order.carrier && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {order.carrier}
                  </span>
                )}
                {order.trackingUrl && (
                  <a
                    href={order.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-primary hover:underline"
                  >
                    Track shipment →
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Items */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Items ({order.itemCount})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.items.map((item) => (
              <Link
                key={item.id}
                href={item.productSlug ? `/products/${item.productSlug}` : "#"}
                className="flex gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
              >
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-foreground">
                    {item.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    SKU: {item.sku} · Qty: {item.quantity}
                  </p>
                  {item.status && item.status !== order.status && (
                    <Badge
                      variant="secondary"
                      className="mt-1 text-[10px]"
                    >
                      {titleCase(item.status)}
                    </Badge>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {formatCurrency(item.lineTotal, item.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(item.unitPrice, item.currency)} each
                  </p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Order summary + addresses */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatCurrency(order.totals.subtotal, order.currency)} />
              {order.totals.discount > 0 && (
                <Row
                  label="Discount"
                  value={`- ${formatCurrency(order.totals.discount, order.currency)}`}
                  className="text-success"
                />
              )}
              <Row label="Shipping" value={formatCurrency(order.totals.shipping, order.currency)} />
              <Row label="Tax" value={formatCurrency(order.totals.tax, order.currency)} />
              <Separator className="my-2" />
              <Row
                label="Total"
                value={formatCurrency(order.totals.total, order.currency)}
                className="text-base font-semibold"
              />
            </CardContent>
          </Card>

          {order.shippingAddress && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4" /> Shipping Address
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  {order.shippingAddress.fullName}
                </p>
                <p>{order.shippingAddress.line1}</p>
                {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
                <p>
                  {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                  {order.shippingAddress.postalCode}
                </p>
                <p>{order.shippingAddress.country}</p>
                <p className="mt-1">📞 {order.shippingAddress.phone}</p>
              </CardContent>
            </Card>
          )}

          {order.payment && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4" /> Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row
                  label="Method"
                  value={titleCase(order.payment.method)}
                />
                <Row
                  label="Status"
                  value={
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium",
                        getStatusColor(order.payment.status),
                      )}
                    >
                      {titleCase(order.payment.status)}
                    </span>
                  }
                />
                {order.payment.reference && (
                  <Row label="Reference" value={order.payment.reference} />
                )}
                {order.payment.paidAt && (
                  <Row
                    label="Paid"
                    value={formatDateTime(order.payment.paidAt)}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Button asChild variant="ghost" size="sm">
        <Link href="/orders">
          <ArrowLeft className="h-4 w-4" /> Back to orders
        </Link>
      </Button>
    </div>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-foreground", className)}>{value}</span>
    </div>
  );
}
