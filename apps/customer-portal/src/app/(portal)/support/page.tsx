"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { LifeBuoy, BookOpen, Send, Search } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api";
import { QUERY_KEYS } from "@/lib/constants";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";

const ticketSchema = z.object({
  subject: z.string().min(5, "Subject must be at least 5 characters"),
  category: z.enum([
    "order",
    "payment",
    "product",
    "shipping",
    "account",
    "other",
  ]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  orderId: z.string().optional(),
  description: z.string().min(20, "Please describe your issue in at least 20 characters"),
});

type TicketValues = z.infer<typeof ticketSchema>;

const CATEGORIES = [
  { value: "order", label: "Order issue" },
  { value: "payment", label: "Payment / refund" },
  { value: "product", label: "Product question" },
  { value: "shipping", label: "Shipping / delivery" },
  { value: "account", label: "Account access" },
  { value: "other", label: "Something else" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export default function SupportPage() {
  const [kbQuery, setKbQuery] = useState("");
  const [kbResults, setKbResults] = useState<
    Array<{ id: string; title: string; snippet: string; url?: string }>
  >([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TicketValues>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      subject: "",
      category: "order",
      priority: "normal",
      description: "",
    },
  });

  const category = watch("category");
  const priority = watch("priority");

  const createTicket = useMutation({
    mutationFn: (values: TicketValues) =>
      api.post<{ id: string; number: string }>("/support/tickets", values),
    onSuccess: (data) => {
      toast.success("Ticket created", {
        description: `Your ticket ${data.number} has been submitted. We'll be in touch soon.`,
      });
      reset();
    },
    onError: (err) =>
      toast.error("Submission failed", { description: getErrorMessage(err) }),
  });

  const kbSearch = useMutation({
    mutationFn: (query: string) =>
      api.post<Array<{ id: string; title: string; snippet: string; url?: string }>>(
        "/knowledge/query",
        { query },
      ),
    onSuccess: (data) => setKbResults(data),
    onError: (err) =>
      toast.error("Search failed", { description: getErrorMessage(err) }),
  });

  const onSubmit = (values: TicketValues) => createTicket.mutateAsync(values);

  const onKbSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kbQuery.trim()) return;
    kbSearch.mutate(kbQuery.trim());
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        description="Get instant answers from our knowledge base, or open a ticket and our team will help you out."
      />

      {/* Knowledge base search */}
      <Card id="kb">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" /> Knowledge Base
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={onKbSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={kbQuery}
                onChange={(e) => setKbQuery(e.target.value)}
                placeholder="Search articles — 'how to return', 'track order'…"
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="gradient" loading={kbSearch.isPending}>
              Search
            </Button>
          </form>

          {kbSearch.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : kbResults.length > 0 ? (
            <ul className="space-y-2">
              {kbResults.map((article) => (
                <li
                  key={article.id}
                  className="rounded-lg border border-border p-3 transition-colors hover:bg-accent"
                >
                  <p className="text-sm font-medium text-foreground">
                    {article.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {article.snippet}
                  </p>
                  {article.url && (
                    <a
                      href={article.url}
                      className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                    >
                      Read article →
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : kbSearch.isSuccess ? (
            <EmptyState
              icon={Search}
              title="No matching articles"
              description="Try different keywords, or open a support ticket below."
            />
          ) : null}
        </CardContent>
      </Card>

      <Separator />

      {/* Support ticket form */}
      <Card id="contact">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="h-4 w-4" /> Open a Support Ticket
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                placeholder="Brief summary of your issue"
                {...register("subject")}
              />
              {errors.subject && (
                <p className="text-xs text-destructive">
                  {errors.subject.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={category}
                  onValueChange={(v) =>
                    setValue("category", v as TicketValues["category"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={priority}
                  onValueChange={(v) =>
                    setValue("priority", v as TicketValues["priority"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="orderId">Order # (optional)</Label>
                <Input
                  id="orderId"
                  placeholder="DJ-12345"
                  {...register("orderId")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Describe your issue</Label>
              <Textarea
                id="description"
                rows={5}
                placeholder="Tell us what happened. The more detail, the faster we can help."
                {...register("description")}
              />
              {errors.description && (
                <p className="text-xs text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="gradient"
                loading={isSubmitting || createTicket.isPending}
              >
                <Send className="h-4 w-4" /> Submit ticket
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
