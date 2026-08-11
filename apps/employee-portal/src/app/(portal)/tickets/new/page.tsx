"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { QUERY_KEYS, TICKET_CATEGORY_LABELS } from "@/lib/constants";
import type {
  TicketCategory,
  TicketPriority,
} from "@/types/ticket.types";

const ticketSchema = z.object({
  subject: z.string().min(3, "Subject must be at least 3 characters"),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  category: z.enum([
    "ORDER",
    "PRODUCT",
    "PAYMENT",
    "SHIPPING",
    "RETURN",
    "REFUND",
    "ACCOUNT",
    "TECHNICAL",
    "OTHER",
  ]),
  customerId: z.string().min(1, "Customer is required"),
  channel: z.enum(["WEB", "EMAIL", "PHONE", "WHATSAPP", "CHAT"]),
});

type TicketFormValues = z.infer<typeof ticketSchema>;

const PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const CATEGORIES: TicketCategory[] = [
  "ORDER",
  "PRODUCT",
  "PAYMENT",
  "SHIPPING",
  "RETURN",
  "REFUND",
  "ACCOUNT",
  "TECHNICAL",
  "OTHER",
];
const CHANNELS = ["WEB", "EMAIL", "PHONE", "WHATSAPP", "CHAT"] as const;

// Quick customer pick list — in production this would be a search-as-you-type
// wired to `GET /api/customers?search=…`.
const RECENT_CUSTOMERS = [
  { id: "cus_001", name: "Rajesh Kumar" },
  { id: "cus_002", name: "Sunita Traders" },
  { id: "cus_003", name: "Meena Iyer" },
  { id: "cus_004", name: "Anil Verma" },
  { id: "cus_005", name: "Wellness Roots Pvt Ltd" },
];

export default function NewTicketPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const preselectedCustomer = searchParams.get("customerId") ?? "";

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TicketFormValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      subject: "",
      description: "",
      priority: "MEDIUM",
      category: "OTHER",
      customerId: preselectedCustomer,
      channel: "WEB",
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: TicketFormValues) =>
      api.post("/support-tickets", values).catch(() => undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tickets });
      toast.success("Ticket created");
      router.push("/tickets");
    },
  });

  const onSubmit = (values: TicketFormValues) => {
    createMutation.mutate(values);
  };

  const busy = createMutation.isPending;

  return (
    <>
      <PageHeader
        title="New support ticket"
        description="Open a ticket on behalf of a customer."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/tickets">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Ticket</CardTitle>
            <CardDescription>What is this about?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject">
                Subject <span className="text-destructive">*</span>
              </Label>
              <Input
                id="subject"
                placeholder="e.g. GST invoice missing for order #ORD-22931"
                aria-invalid={!!errors.subject}
                {...register("subject")}
              />
              {errors.subject && (
                <p className="text-xs text-destructive">
                  {errors.subject.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={5}
                placeholder="Add the full context, what the customer is asking for, and any troubleshooting already done…"
                {...register("description")}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={watch("priority")}
                  onValueChange={(v) =>
                    setValue("priority", v as TicketPriority, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={watch("category")}
                  onValueChange={(v) =>
                    setValue("category", v as TicketCategory, {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {TICKET_CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Channel</Label>
                <Select
                  value={watch("channel")}
                  onValueChange={(v) =>
                    setValue("channel", v as (typeof CHANNELS)[number], {
                      shouldValidate: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
            <CardDescription>
              Which customer is this ticket for?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="customerId">
              Customer <span className="text-destructive">*</span>
            </Label>
            <Select
              value={watch("customerId")}
              onValueChange={(v) =>
                setValue("customerId", v, { shouldValidate: true })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a customer" />
              </SelectTrigger>
              <SelectContent>
                {RECENT_CUSTOMERS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customerId && (
              <p className="text-xs text-destructive">
                {errors.customerId.message}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button asChild variant="outline" type="button" disabled={busy}>
            <Link href="/tickets">Cancel</Link>
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Create ticket
              </>
            )}
          </Button>
        </div>
      </form>
    </>
  );
}
