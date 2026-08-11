"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  StickyNote,
  Ticket as TicketIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCustomer } from "@/hooks/use-crm";
import {
  CUSTOMER_TYPE_LABELS,
} from "@/lib/constants";
import {
  cn,
  formatCurrency,
  formatDate,
  formatRelativeTime,
  getStatusColor,
} from "@/lib/utils";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: customer, isLoading, isError } = useCustomer(params.id);
  const [note, setNote] = useState("");

  if (isLoading) {
    return (
      <>
        <PageHeader title="Customer" />
        <Skeleton className="h-64 w-full" />
      </>
    );
  }

  if (isError || !customer) {
    return (
      <EmptyState
        title="Customer not found"
        description="This customer may have been deleted."
        action={
          <Button asChild size="sm">
            <Link href="/crm/customers">Back to customers</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        title={customer.name}
        description={`${CUSTOMER_TYPE_LABELS[customer.type]} customer · joined ${formatDate(customer.createdAt)}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/crm/customers">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left — contact + stats */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{customer.email ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{customer.phone ?? "—"}</span>
              </div>
              {customer.altPhone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{customer.altPhone}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <span>{customer.address}</span>
                </div>
              )}
              {customer.gstin && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">GSTIN:</span>
                  <span className="font-mono text-xs">{customer.gstin}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Stat
                label="Lifetime value"
                value={formatCurrency(customer.lifetimeValue, customer.currency)}
              />
              <Stat
                label="Total orders"
                value={String(customer.totalOrders ?? 0)}
              />
              <Stat
                label="Last order"
                value={customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "—"}
              />
              <Stat
                label="Status"
                value={
                  <Badge
                    variant="outline"
                    className={cn(getStatusColor(customer.status))}
                  >
                    {customer.status.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                }
              />
              {customer.assignedToName && (
                <Stat label="Account owner" value={customer.assignedToName} />
              )}
              {customer.tags && customer.tags.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Tags
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {customer.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link
                  href={`/tasks/new?relatedType=CUSTOMER&relatedId=${customer.id}&relatedLabel=${encodeURIComponent(customer.name)}`}
                >
                  <Plus className="h-4 w-4" /> Create task
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href={`/tickets/new?customerId=${customer.id}`}>
                  <TicketIcon className="h-4 w-4" /> Open support ticket
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link href={`/ai-assistant?prompt=${encodeURIComponent(`Summarise customer ${customer.name} history`)}`}>
                  <MessageCircle className="h-4 w-4" /> Summarise with AI
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right — orders, interactions, tickets, notes */}
        <div className="space-y-6 lg:col-span-2">
          <Tabs defaultValue="orders">
            <TabsList>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="interactions">Interactions</TabsTrigger>
              <TabsTrigger value="tickets">Tickets</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="orders">
              <Card>
                <CardHeader>
                  <CardTitle>Order history</CardTitle>
                  <CardDescription>
                    {customer.orders?.length ?? 0} orders on file.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {customer.orders && customer.orders.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order #</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="w-[120px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customer.orders.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono text-xs">
                              {o.number}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(o.createdAt)}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {formatCurrency(o.total, o.currency)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn(getStatusColor(o.status))}
                              >
                                {o.status.toLowerCase()}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No orders on record.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="interactions">
              <Card>
                <CardHeader>
                  <CardTitle>Conversation & interaction history</CardTitle>
                  <CardDescription>
                    Calls, emails, chats, and meetings — including AI interactions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {customer.interactions && customer.interactions.length > 0 ? (
                    <ol className="space-y-4">
                      {customer.interactions.map((i) => (
                        <li key={i.id} className="flex gap-3">
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                          <div>
                            <p className="text-sm font-medium">{i.summary}</p>
                            <p className="text-xs text-muted-foreground">
                              {i.type.toLowerCase()} ·{" "}
                              {i.handledBy ?? "Unknown"} ·{" "}
                              {formatRelativeTime(i.createdAt)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No interactions logged.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tickets">
              <Card>
                <CardHeader>
                  <CardTitle>Support tickets</CardTitle>
                </CardHeader>
                <CardContent>
                  {customer.ticketIds && customer.ticketIds.length > 0 ? (
                    <ul className="space-y-2">
                      {customer.ticketIds.map((tid) => (
                        <li key={tid}>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/tickets/${tid}`}>
                              <TicketIcon className="h-3.5 w-3.5" /> {tid}
                            </Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No support tickets.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notes">
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                  <CardDescription>
                    Internal notes about this customer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {customer.notes && customer.notes.length > 0 ? (
                    customer.notes.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-md border border-border bg-muted/30 p-3"
                      >
                        <p className="text-sm">{n.body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {n.authorName} · {formatRelativeTime(n.createdAt)}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No notes yet.</p>
                  )}
                  <Separator />
                  <div className="space-y-2">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add a note…"
                      rows={3}
                    />
                    <div className="flex justify-end">
                      <Button size="sm" disabled={!note.trim()}>
                        <StickyNote className="h-3.5 w-3.5" /> Save note
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
