"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  RotateCcw,
  Package,
  AlertCircle,
} from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { cn, formatCurrency } from "@/lib/utils";
import type {
  Order,
  ReturnReason,
  CreateReturnDto,
} from "@/types/order.types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ErrorState } from "@/components/shared/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const REASONS: Array<{ value: ReturnReason; label: string }> = [
  { value: "damaged", label: "Item arrived damaged" },
  { value: "defective", label: "Item is defective" },
  { value: "wrong_item", label: "Wrong item delivered" },
  { value: "not_as_described", label: "Item not as described" },
  { value: "no_longer_needed", label: "No longer needed" },
  { value: "better_price_found", label: "Found a better price" },
  { value: "other", label: "Other" },
];

const returnSchema = z.object({
  items: z
    .array(
      z.object({
        orderItemId: z.string(),
        quantity: z.number().int().positive(),
        reason: z.enum([
          "damaged",
          "defective",
          "wrong_item",
          "not_as_described",
          "no_longer_needed",
          "better_price_found",
          "other",
        ]),
        comment: z.string().optional(),
      }),
    )
    .min(1, "Select at least one item to return"),
  pickupNotes: z.string().optional(),
});

type ReturnValues = z.infer<typeof returnSchema>;

export default function ReturnRequestPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const orderQuery = useQuery({
    queryKey: QUERY_KEYS.order(id),
    queryFn: () => api.get<Order>(`/orders/${id}`),
    enabled: !!id,
  });

  const [selectedItems, setSelectedItems] = useState<
    Record<
      string,
      { selected: boolean; quantity: number; reason: ReturnReason }
    >
  >({});

  const createReturnMutation = useMutation({
    mutationFn: (dto: CreateReturnDto) =>
      api.post<{ id: string; number: string }>("/orders/returns", dto),
    onSuccess: (data) => {
      toast.success("Return requested", {
        description: `Your return ${data.number} has been submitted.`,
      });
      router.push(`/orders/${id}`);
    },
    onError: (err) =>
      toast.error("Request failed", { description: getErrorMessage(err) }),
  });

  if (orderQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <ErrorState
        error={orderQuery.error}
        title="Order not found"
        description="We couldn't load this order to start a return."
      />
    );
  }

  const order = orderQuery.data;

  if (!order.isReturnable) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
            <AlertCircle className="h-6 w-6 text-warning" />
          </div>
          <p className="mt-3 text-sm font-medium">Return window closed</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            This order is no longer eligible for return. Our return window is
            typically 7 days from delivery.
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href={`/orders/${id}`}>Back to order</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const toggleItem = (itemId: string) => {
    const item = order.items.find((i) => i.id === itemId);
    if (!item) return;
    setSelectedItems((prev) => {
      if (prev[itemId]?.selected) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return {
        ...prev,
        [itemId]: {
          selected: true,
          quantity: item.quantity,
          reason: "no_longer_needed",
        },
      };
    });
  };

  const updateItem = (
    itemId: string,
    patch: Partial<{ quantity: number; reason: ReturnReason }>,
  ) =>
    setSelectedItems((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], ...patch },
    }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.values(selectedItems).filter((s) => s.selected);
    if (items.length === 0) {
      toast.error("Select at least one item to return");
      return;
    }
    createReturnMutation.mutate({
      orderId: order.id,
      items: Object.entries(selectedItems)
        .filter(([, v]) => v.selected)
        .map(([orderItemId, v]) => ({
          orderItemId,
          quantity: v.quantity,
          reason: v.reason,
        })),
      pickupNotes: (e.currentTarget as HTMLFormElement).pickupNotes?.value,
    });
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/orders/${id}`}>
          <ArrowLeft className="h-4 w-4" /> Back to order
        </Link>
      </Button>

      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <RotateCcw className="h-6 w-6 text-primary" /> Request a Return
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the items you&apos;d like to return from order{" "}
          <span className="font-medium text-foreground">{order.number}</span>.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items to return</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.items.map((item) => {
              const selected = selectedItems[item.id]?.selected ?? false;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    selected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border",
                  )}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleItem(item.id)}
                      className="mt-1"
                    />
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ordered: {item.quantity} ·{" "}
                        {formatCurrency(item.unitPrice, item.currency)} each
                      </p>
                    </div>
                    <span className="text-sm font-semibold">
                      {formatCurrency(item.lineTotal, item.currency)}
                    </span>
                  </label>

                  {selected && (
                    <div className="mt-3 grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Quantity</Label>
                        <Input
                          type="number"
                          min={1}
                          max={item.quantity}
                          value={selectedItems[item.id]?.quantity ?? 1}
                          onChange={(e) =>
                            updateItem(item.id, {
                              quantity: Math.min(
                                item.quantity,
                                Math.max(1, Number(e.target.value)),
                              ),
                            })
                          }
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Reason</Label>
                        <Select
                          value={selectedItems[item.id]?.reason}
                          onValueChange={(v) =>
                            updateItem(item.id, { reason: v as ReturnReason })
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REASONS.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Pickup details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pickup details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {order.shippingAddress && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="font-medium">
                  {order.shippingAddress.fullName}
                </p>
                <p className="text-muted-foreground">
                  {order.shippingAddress.line1}
                  {order.shippingAddress.line2
                    ? `, ${order.shippingAddress.line2}`
                    : ""}
                </p>
                <p className="text-muted-foreground">
                  {order.shippingAddress.city}, {order.shippingAddress.state}{" "}
                  {order.shippingAddress.postalCode}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The courier will pick up the return from this address.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="pickupNotes">
                Pickup instructions (optional)
              </Label>
              <Textarea
                id="pickupNotes"
                name="pickupNotes"
                placeholder="e.g. Ring the doorbell, package is at the reception desk…"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button asChild variant="ghost">
            <Link href={`/orders/${id}`}>Cancel</Link>
          </Button>
          <Button
            type="submit"
            variant="gradient"
            loading={createReturnMutation.isPending}
            disabled={
              !Object.values(selectedItems).some((s) => s.selected)
            }
          >
            <RotateCcw className="h-4 w-4" /> Submit return request
          </Button>
        </div>
      </form>
    </div>
  );
}
