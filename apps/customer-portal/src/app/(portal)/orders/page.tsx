"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Package,
  ChevronRight,
  Download,
  RotateCcw,
} from "lucide-react";
import { api } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDate,
  getStatusColor,
  titleCase,
} from "@/lib/utils";
import type { Order, OrderStatus } from "@/types/order.types";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { EmptyState } from "@/components/ui/empty-state";

const STATUS_FILTERS: Array<{ value: OrderStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
];

export default function OrdersPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <OrdersInner />
    </Suspense>
  );
}

function OrdersInner() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") as OrderStatus | null;
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState<OrderStatus | "all">(
    initialStatus ?? "all",
  );

  const params = useMemo(
    () => ({
      search: search || undefined,
      status: activeStatus !== "all" ? [activeStatus] : undefined,
      limit: 20,
      sort: "date_desc",
    }),
    [search, activeStatus],
  );

  const ordersQuery = useQuery({
    queryKey: [...QUERY_KEYS.orders, params],
    queryFn: () => api.paginated<Order>("/orders", params),
    staleTime: 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Orders"
        description="Track, reorder, return, and download invoices for your orders."
        actions={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order number…"
              className="w-56 pl-9"
            />
          </div>
        }
      />

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveStatus("all")}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            activeStatus === "all"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          All
        </button>
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setActiveStatus(value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              activeStatus === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {ordersQuery.isLoading ? (
            <LoadingState label="Loading your orders…" />
          ) : ordersQuery.isError ? (
            <ErrorState
              error={ordersQuery.error}
              onRetry={() => ordersQuery.refetch()}
            />
          ) : !ordersQuery.data?.data.length ? (
            <EmptyState
              icon={Package}
              title={
                search || activeStatus !== "all"
                  ? "No matching orders"
                  : "You haven't placed any orders yet"
              }
              description={
                search || activeStatus !== "all"
                  ? "Try a different search term or status filter."
                  : "Browse our products and place your first order."
              }
              action={
                activeStatus !== "all" || search ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setActiveStatus("all");
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button asChild variant="gradient" size="sm">
                    <Link href="/products">Browse products</Link>
                  </Button>
                )
              }
              className="rounded-none border-0"
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersQuery.data.data.map((order) => (
                      <TableRow key={order.id} className="cursor-pointer">
                        <TableCell>
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-medium text-foreground hover:text-primary"
                          >
                            {order.number}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(order.placedAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {order.items.slice(0, 3).map((item, idx) =>
                              item.imageUrl ? (
                                <img
                                  key={idx}
                                  src={item.imageUrl}
                                  alt=""
                                  className="h-8 w-8 rounded border border-border object-cover"
                                />
                              ) : null,
                            )}
                            {order.items.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{order.items.length - 3}
                              </span>
                            )}
                            <span className="text-sm text-muted-foreground">
                              {order.itemCount}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(order.totals.total, order.currency)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              getStatusColor(order.status),
                            )}
                          >
                            {titleCase(order.status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                            >
                              <Link href={`/orders/${order.id}`}>
                                View <ChevronRight className="h-3 w-3" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <ul className="divide-y divide-border md:hidden">
                {ordersQuery.data.data.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/orders/${order.id}`}
                      className="flex items-center gap-3 p-4 transition-colors hover:bg-accent"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {order.items[0]?.imageUrl ? (
                          <img
                            src={order.items[0].imageUrl}
                            alt=""
                            className="h-full w-full rounded-lg object-cover"
                          />
                        ) : (
                          <Package className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {order.number}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(order.placedAt)} ·{" "}
                          {order.itemCount} items
                        </p>
                        <span
                          className={cn(
                            "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                            getStatusColor(order.status),
                          )}
                        >
                          {titleCase(order.status)}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {formatCurrency(order.totals.total, order.currency)}
                        </p>
                        <ChevronRight className="ml-auto mt-1 h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
