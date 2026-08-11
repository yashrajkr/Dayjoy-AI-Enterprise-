"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { QUERY_KEYS, APP_NAME_FULL } from "@/lib/constants";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import type { Order } from "@/types/order.types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ErrorState } from "@/components/shared/states";

/**
 * Printable invoice page — fetches the order and renders a clean
 * invoice layout optimised for "Print to PDF" via the browser.
 *
 * A global "print" button is shown on screen (hidden when printing)
 * and the page uses `print:` Tailwind variants to strip chrome.
 */
export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const orderQuery = useQuery({
    queryKey: QUERY_KEYS.order(id),
    queryFn: () => api.get<Order>(`/orders/${id}`),
    enabled: !!id,
  });

  if (orderQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <ErrorState
        error={orderQuery.error}
        title="Invoice unavailable"
        description="We couldn't load this invoice. The order may not exist."
      />
    );
  }

  const order = orderQuery.data;

  return (
    <div className="space-y-4">
      {/* Toolbar — hidden when printing */}
      <div className="flex items-center justify-between print:hidden">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.history.back()}
        >
          ← Back to order
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          {order.invoice?.url && (
            <Button asChild variant="gradient" size="sm">
              <a href={order.invoice.url} download target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" /> Download PDF
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Invoice */}
      <Card className="print:border-0 print:shadow-none">
        <CardContent className="p-8 sm:p-12">
          {/* Header */}
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg brand-gradient">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-semibold">{APP_NAME_FULL}</span>
              </div>
              <p className="mt-2 max-w-xs text-xs text-muted-foreground">
                Dayjoy AI Enterprise Pvt. Ltd.
                <br />
                Bengaluru, Karnataka, India
                <br />
                support@dayjoyai.com · +91 80000 00000
              </p>
            </div>
            <div className="sm:text-right">
              <h1 className="text-2xl font-bold tracking-tight">INVOICE</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Invoice #{order.invoice?.number ?? order.number}
              </p>
              <p className="text-sm text-muted-foreground">
                Issued: {formatDate(order.invoice?.issuedAt ?? order.placedAt)}
              </p>
              <p className="text-sm text-muted-foreground">
                Order: {order.number}
              </p>
            </div>
          </div>

          <Separator className="my-8" />

          {/* Bill to / Ship to */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Bill to
              </p>
              {order.billingAddress ? (
                <div className="mt-2 text-sm">
                  <p className="font-medium">{order.billingAddress.fullName}</p>
                  <p className="text-muted-foreground">
                    {order.billingAddress.line1}
                  </p>
                  {order.billingAddress.line2 && (
                    <p className="text-muted-foreground">
                      {order.billingAddress.line2}
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    {order.billingAddress.city}, {order.billingAddress.state}{" "}
                    {order.billingAddress.postalCode}
                  </p>
                  <p className="text-muted-foreground">
                    {order.billingAddress.country}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Same as shipping address
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ship to
              </p>
              {order.shippingAddress && (
                <div className="mt-2 text-sm">
                  <p className="font-medium">{order.shippingAddress.fullName}</p>
                  <p className="text-muted-foreground">
                    {order.shippingAddress.line1}
                  </p>
                  {order.shippingAddress.line2 && (
                    <p className="text-muted-foreground">
                      {order.shippingAddress.line2}
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                    {order.shippingAddress.postalCode}
                  </p>
                  <p className="text-muted-foreground">
                    {order.shippingAddress.country}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4 text-center">Qty</th>
                  <th className="py-2 pr-4 text-right">Unit price</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-border">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-8 w-8 rounded border border-border object-cover"
                          />
                        )}
                        <div>
                          <p className="font-medium text-foreground">
                            {item.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            SKU: {item.sku}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-center">{item.quantity}</td>
                    <td className="py-3 pr-4 text-right">
                      {formatCurrency(item.unitPrice, item.currency)}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatCurrency(item.lineTotal, item.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>
                  {formatCurrency(order.totals.subtotal, order.currency)}
                </span>
              </div>
              {order.totals.discount > 0 && (
                <div className="flex justify-between text-success">
                  <span>Discount</span>
                  <span>
                    - {formatCurrency(order.totals.discount, order.currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>
                  {formatCurrency(order.totals.shipping, order.currency)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCurrency(order.totals.tax, order.currency)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span>{formatCurrency(order.totals.total, order.currency)}</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-muted-foreground">Amount paid</span>
                <span
                  className={cn(
                    order.paymentStatus === "paid"
                      ? "text-success"
                      : "text-muted-foreground",
                  )}
                >
                  {order.paymentStatus === "paid"
                    ? formatCurrency(order.totals.total, order.currency)
                    : "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground">
            <p>
              Thank you for shopping with {APP_NAME_FULL}! For questions about
              this invoice, contact support@dayjoyai.com.
            </p>
            <p className="mt-1">
              This is a computer-generated invoice and does not require a
              signature.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
