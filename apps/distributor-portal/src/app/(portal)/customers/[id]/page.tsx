"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  IndianRupee,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Plus,
  Sparkles,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { customersService } from "@/lib/services";
import { CUSTOMER_TYPE_LABELS } from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDate,
  formatRelativeTime,
  getInitials,
  getStatusColor,
} from "@/lib/utils";
import type { OrderStatus } from "@/types";

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
  REFUNDED: "Refunded",
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [noteBody, setNoteBody] = useState("");

  const { data: customer, isLoading, isError, error } = useQuery({
    queryKey: ["customer", params.id],
    queryFn: () => customersService.get(params.id),
    enabled: !!params.id,
  });

  const { data: orders } = useQuery({
    queryKey: ["customer-orders", params.id],
    queryFn: () => customersService.getOrders(params.id),
    enabled: !!params.id,
  });

  const { data: conversations } = useQuery({
    queryKey: ["customer-conversations", params.id],
    queryFn: () => customersService.getConversations(params.id),
    enabled: !!params.id,
  });

  const addNoteMutation = useMutation({
    mutationFn: () => customersService.addNote(params.id, noteBody),
    onSuccess: () => {
      toast.success("Note added.");
      setNoteBody("");
      queryClient.invalidateQueries({ queryKey: ["customer", params.id] });
    },
    onError: () => toast.error("Failed to add note."),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-3/4" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-1" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (isError || !customer) {
    return (
      <InlineAlert variant="error">
        Failed to load customer: {(error as Error)?.message ?? "Not found"}.{" "}
        <button
          type="button"
          onClick={() => router.push("/customers")}
          className="underline"
        >
          Back to customers
        </button>
      </InlineAlert>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${customer.firstName} ${customer.lastName}`}
        description={`${CUSTOMER_TYPE_LABELS[customer.type]} customer since ${formatDate(customer.createdAt)}`}
        icon={User}
        breadcrumbs={[
          { label: "Customers", href: "/customers" },
          { label: `${customer.firstName} ${customer.lastName}` },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/customers")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button onClick={() => router.push(`/orders/new?customerId=${customer.id}`)}>
              <Plus className="h-4 w-4" />
              Create Order
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — customer info */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Customer profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14">
                <AvatarFallback>
                  {getInitials(`${customer.firstName} ${customer.lastName}`)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-foreground">
                  {customer.firstName} {customer.lastName}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="secondary">
                    {CUSTOMER_TYPE_LABELS[customer.type]}
                  </Badge>
                  <Badge
                    className={cn(
                      "border-transparent",
                      getStatusColor(customer.status),
                    )}
                  >
                    {customer.status}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {customer.email && (
                <a
                  href={`mailto:${customer.email}`}
                  className="flex items-center gap-2 text-foreground hover:text-primary"
                >
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  {customer.email}
                </a>
              )}
              <a
                href={`tel:${customer.phone}`}
                className="flex items-center gap-2 text-foreground hover:text-primary"
              >
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                {customer.phone}
              </a>
              {customer.company && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  {customer.company}
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5" />
                  <span>
                    {customer.address}
                    {customer.city && `, ${customer.city}`}
                    {customer.state && `, ${customer.state}`}
                    {customer.pincode && ` - ${customer.pincode}`}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Lifetime value</p>
                <p className="text-lg font-semibold text-foreground">
                  {formatCurrency(customer.ltv)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Total orders</p>
                <p className="text-lg font-semibold text-foreground">
                  {customer.totalOrders}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right column — tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="orders">
            <TabsList>
              <TabsTrigger value="orders">Order history</TabsTrigger>
              <TabsTrigger value="conversations">Conversations</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="orders">
              <Card>
                <CardContent className="p-0">
                  {!orders || orders.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No orders yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3 font-medium">Order #</th>
                            <th className="px-4 py-3 font-medium">Items</th>
                            <th className="px-4 py-3 font-medium">Total</th>
                            <th className="px-4 py-3 font-medium">Status</th>
                            <th className="px-4 py-3 font-medium">Date</th>
                            <th className="px-4 py-3 font-medium text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {orders.map((o) => (
                            <tr key={o.id} className="hover:bg-muted/30">
                              <td className="px-4 py-3 font-mono text-xs">
                                {o.orderNumber}
                              </td>
                              <td className="px-4 py-3">{o.items.length}</td>
                              <td className="px-4 py-3 font-medium">
                                {formatCurrency(o.total)}
                              </td>
                              <td className="px-4 py-3">
                                <Badge
                                  className={cn(
                                    "border-transparent",
                                    getStatusColor(o.status),
                                  )}
                                >
                                  {ORDER_STATUS_LABELS[o.status]}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {formatDate(o.createdAt)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  asChild
                                >
                                  <Link href={`/orders/${o.id}`}>View</Link>
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="conversations">
              <Card>
                <CardContent className="p-0">
                  {!conversations || conversations.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No AI conversations with this customer yet.
                    </div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {conversations.map((conv) => (
                        <li key={conv.id} className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-foreground">
                                {conv.title}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {conv.preview}
                              </p>
                            </div>
                            <Badge variant="secondary">{conv.channel}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {conv.messageCount} messages · {formatRelativeTime(conv.lastMessageAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="h-4 w-4" />
                    Add note
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Note a preference, complaint, or follow-up reminder…"
                    rows={3}
                  />
                  <Button
                    size="sm"
                    onClick={() => addNoteMutation.mutate()}
                    disabled={!noteBody.trim() || addNoteMutation.isPending}
                    loading={addNoteMutation.isPending}
                  >
                    Add note
                  </Button>
                </CardContent>
              </Card>

              {customer.notes.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Notes ({customer.notes.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {customer.notes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-lg border border-border bg-muted/30 p-3"
                      >
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{note.author}</span>
                          <time>{formatRelativeTime(note.createdAt)}</time>
                        </div>
                        <p className="text-sm text-foreground">{note.body}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
