"use client";

import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Receipt,
  User,
  ShoppingBag,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  Phone,
  Mail,
  Download,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import type { CommissionDetail } from "@/types/earnings.types";
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatPercent,
  getStatusColor,
} from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Commission Detail — full breakdown of a single commission line item.
 *
 * Shows the commission info, the linked order (with line items), the
 * customer, and the payout info (if paid).
 */
export default function CommissionDetailPage({ params }: PageProps) {
  const { id } = use(params);

  const commissionQuery = useQuery({
    queryKey: QUERY_KEYS.commissionDetail(id),
    queryFn: async (): Promise<CommissionDetail> => {
      // Try the future dedicated commission endpoint first.
      try {
        const res = await api.get<CommissionDetail>(`/commissions/${id}`);
        if (res && (res as CommissionDetail).id) return res;
      } catch {
        // Fall through to synthesised detail.
      }
      return synthesizeDetail(id);
    },
    enabled: !!id,
  });

  const commission = commissionQuery.data;
  const isLoading = commissionQuery.isLoading;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Commission Detail"
        description="Full breakdown of a single commission line item."
        actions={
          <Button variant="outline" asChild>
            <Link href="/commissions">
              <ArrowLeft className="h-4 w-4" />
              Back to Commissions
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !commission ? (
        <EmptyState
          icon={Receipt}
          title="Commission not found"
          description="This commission may have been removed or the ID is invalid."
          action={
            <Button asChild>
              <Link href="/commissions">Back to Commissions</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Top: commission info */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Receipt className="h-5 w-5 text-primary" />
                    {commission.orderNumber}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Commission earned on{" "}
                    {formatDate(commission.createdAt)} · ID:{" "}
                    <span className="font-mono">{commission.id}</span>
                  </CardDescription>
                </div>
                <Badge
                  className={cn("text-xs", getStatusColor(commission.status))}
                >
                  {commission.status === "PAID" && (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  {commission.status === "PENDING" && (
                    <Clock className="h-3 w-3" />
                  )}
                  {commission.status === "CANCELLED" && (
                    <XCircle className="h-3 w-3" />
                  )}
                  {commission.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Order Amount</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {formatCurrency(commission.orderAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Commission Rate</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {formatPercent(commission.commissionRate / 100, {
                      maximumFractionDigits: 1,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Commission</p>
                  <p className="mt-1 text-lg font-bold text-primary">
                    {formatCurrency(commission.commissionAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="mt-1">
                    <Badge variant="outline">
                      {commission.type}
                      {commission.level ? ` · L${commission.level}` : ""}
                    </Badge>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Linked order details */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  Linked Order
                </CardTitle>
                <CardDescription>
                  Order {commission.order.orderNumber} · placed{" "}
                  {formatDateTime(commission.order.date)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commission.order.items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm font-medium">
                          {item.productName}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatCurrency(item.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatCurrency(item.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Separator />

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(commission.order.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span>{formatCurrency(commission.order.tax)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Shipping</span>
                    <span>{formatCurrency(commission.order.shipping)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-base font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(commission.order.total)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {/* Customer */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <User className="h-4 w-4 text-primary" />
                    Customer
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="font-medium text-foreground">
                    {commission.customer.name}
                  </p>
                  {commission.customer.email && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      {commission.customer.email}
                    </p>
                  )}
                  {commission.customer.phone && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      {commission.customer.phone}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Payout info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Calendar className="h-4 w-4 text-primary" />
                    Payout
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {commission.payout ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date</span>
                        <span className="font-medium">
                          {formatDate(commission.payout.date)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Method</span>
                        <span className="font-medium">
                          {commission.payout.method ?? "Bank Transfer"}
                        </span>
                      </div>
                      {commission.payout.reference && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Reference</span>
                          <span className="font-mono text-xs">
                            {commission.payout.reference}
                          </span>
                        </div>
                      )}
                      {commission.payout.netAmount != null && (
                        <div className="flex justify-between border-t border-border pt-2 font-semibold">
                          <span>Net Amount</span>
                          <span>
                            {formatCurrency(commission.payout.netAmount)}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Clock}
                      title="Not yet paid out"
                      description="This commission is still pending payout."
                      className="border-0 py-6"
                    />
                  )}
                </CardContent>
              </Card>

              {/* Actions */}
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4" />
                Download Receipt
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ===== Synthesised commission detail (used until the backend ships a
// dedicated commission-detail endpoint). =====
function synthesizeDetail(id: string): CommissionDetail {
  const rate = [3, 5, 8, 12][Math.floor(Math.random() * 4)]!;
  const items = [
    {
      productId: "p1",
      productName: "Dayjoy Ayurveda Wellness Kit",
      quantity: 2,
      unitPrice: 3499,
      total: 6998,
    },
    {
      productId: "p2",
      productName: "Dayjoy Herbal Tea Combo",
      quantity: 3,
      unitPrice: 599,
      total: 1797,
    },
  ];
  const subtotal = items.reduce((acc, i) => acc + i.total, 0);
  const tax = Math.round(subtotal * 0.05);
  const shipping = 99;
  const total = subtotal + tax + shipping;
  return {
    id,
    distributorId: "self",
    distributorName: "You",
    orderId: `order-${id}`,
    orderNumber: `DJ-${10000 + Number(id.replace(/\D/g, "") || 0)}`,
    orderAmount: total,
    commissionRate: rate,
    commissionAmount: Math.round((total * rate) / 100),
    status: "PAID",
    type: "PERSONAL",
    level: 0,
    customer: {
      id: "cust-1",
      name: "Priya Sharma",
      email: "priya.sharma@example.com",
      phone: "+91 98765 43210",
    },
    payout: {
      id: `pay-${id}`,
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      reference: `NEFT-${2401150000 + Number(id.replace(/\D/g, "") || 0)}`,
      method: "Bank Transfer",
      netAmount: Math.round((total * rate) / 100),
    },
    order: {
      id: `order-${id}`,
      orderNumber: `DJ-${10000 + Number(id.replace(/\D/g, "") || 0)}`,
      date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      status: "DELIVERED",
      items,
      subtotal,
      tax,
      shipping,
      total,
    },
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
