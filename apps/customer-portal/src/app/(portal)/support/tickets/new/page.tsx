"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LifeBuoy, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TicketForm } from "@/components/support/ticket-form";
import { ROUTES } from "@/lib/constants";
import { toast } from "sonner";
import type { SupportTicket } from "@/types";

/**
 * New Ticket — wraps the reusable TicketForm. On success, redirects to
 * the ticket detail page (`/support/tickets/[id]`) and shows a toast.
 */
export default function NewTicketPage() {
  const router = useRouter();

  const handleSuccess = (ticket: SupportTicket) => {
    toast.success("Ticket created", {
      description: `${ticket.ticketNumber} — we'll be in touch shortly.`,
    });
    router.push(`/support/tickets/${ticket.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="New Support Ticket"
        description="Tell us what's going on and we'll route it to the right team."
        icon={LifeBuoy}
        actions={
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link href={ROUTES.supportTickets}>
              <ArrowLeft className="h-4 w-4" />
              Back to tickets
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ticket details</CardTitle>
        </CardHeader>
        <CardContent>
          <TicketForm
            onSuccess={handleSuccess}
            onCancel={() => router.back()}
          />
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Try the AI Assistant first
            </p>
            <p className="text-xs text-muted-foreground">
              Most questions — order tracking, returns, product info — can be
              answered instantly without a ticket.{" "}
              <Link
                href={ROUTES.aiAssistant}
                className="font-medium text-primary hover:underline"
              >
                Open the AI Assistant →
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
