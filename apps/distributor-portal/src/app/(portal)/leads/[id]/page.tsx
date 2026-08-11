"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  Lightbulb,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  Tag,
  UserCheck,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { leadsService } from "@/lib/services";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from "@/lib/constants";
import {
  cn,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  getInitials,
  getScoreColor,
  getStatusColor,
} from "@/lib/utils";

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [noteBody, setNoteBody] = useState("");

  const { data: lead, isLoading, isError, error } = useQuery({
    queryKey: ["lead", params.id],
    queryFn: () => leadsService.get(params.id),
    enabled: !!params.id,
  });

  const { data: suggestion } = useQuery({
    queryKey: ["lead-next-action", params.id],
    queryFn: () => leadsService.suggestNextAction(params.id),
    enabled: !!params.id,
  });

  const addNoteMutation = useMutation({
    mutationFn: () => leadsService.addNote(params.id, noteBody),
    onSuccess: () => {
      toast.success("Note added.");
      setNoteBody("");
      queryClient.invalidateQueries({ queryKey: ["lead", params.id] });
    },
    onError: () => toast.error("Failed to add note."),
  });

  const convertMutation = useMutation({
    mutationFn: () => leadsService.convert(params.id),
    onSuccess: (lead) => {
      toast.success("Lead converted to customer!");
      queryClient.invalidateQueries({ queryKey: ["lead", params.id] });
      if (lead.convertedCustomerId) {
        router.push(`/customers/${lead.convertedCustomerId}`);
      }
    },
    onError: () => toast.error("Failed to convert lead."),
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

  if (isError || !lead) {
    return (
      <InlineAlert variant="error">
        Failed to load lead: {(error as Error)?.message ?? "Not found"}.{" "}
        <button
          type="button"
          onClick={() => router.push("/leads")}
          className="underline"
        >
          Back to leads
        </button>
      </InlineAlert>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${lead.firstName} ${lead.lastName}`}
        description={lead.interest ?? "No specific interest noted."}
        icon={UserCheck}
        breadcrumbs={[
          { label: "Leads", href: "/leads" },
          { label: `${lead.firstName} ${lead.lastName}` },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push("/leads")}>
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {lead.stage !== "CONVERTED" && lead.stage !== "LOST" && (
              <Button
                onClick={() => convertMutation.mutate()}
                loading={convertMutation.isPending}
              >
                <UserCheck className="h-4 w-4" />
                Convert to Customer
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — lead info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lead information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback>
                    {getInitials(`${lead.firstName} ${lead.lastName}`)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-foreground">
                    {lead.firstName} {lead.lastName}
                  </p>
                  {lead.company && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      {lead.company}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Stage</span>
                  <Badge className={cn("border-transparent", getStatusColor(lead.stage))}>
                    {LEAD_STAGE_LABELS[lead.stage]}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Source</span>
                  <Badge variant="secondary">
                    <Tag className="h-3 w-3" />
                    {LEAD_SOURCE_LABELS[lead.source]}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Score</span>
                  <span
                    className={cn(
                      "font-mono text-lg font-bold",
                      getScoreColor(lead.score),
                    )}
                  >
                    {lead.score}
                    <span className="text-xs text-muted-foreground"> / 100</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Assigned</span>
                  <span className="flex items-center gap-1 text-xs">
                    <Calendar className="h-3 w-3" />
                    {formatDate(lead.assignedAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last contact</span>
                  <span className="flex items-center gap-1 text-xs">
                    <Clock className="h-3 w-3" />
                    {lead.lastContactedAt
                      ? formatRelativeTime(lead.lastContactedAt)
                      : "Never"}
                  </span>
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Contact
                </p>
                <div className="space-y-1.5 text-sm">
                  {lead.email && (
                    <a
                      href={`mailto:${lead.email}`}
                      className="flex items-center gap-2 text-foreground hover:text-primary"
                    >
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {lead.email}
                    </a>
                  )}
                  {lead.phone && (
                    <a
                      href={`tel:${lead.phone}`}
                      className="flex items-center gap-2 text-foreground hover:text-primary"
                    >
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {lead.phone}
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Next Best Action */}
          <Card className="border-primary/30 bg-primary/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="h-4 w-4 text-primary" />
                AI Next Best Action
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggestion ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={
                        suggestion.priority === "CRITICAL"
                          ? "destructive"
                          : suggestion.priority === "HIGH"
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {suggestion.priority} priority
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {suggestion.action}
                  </p>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Suggested script
                    </p>
                    <p className="text-sm italic text-foreground">
                      “{suggestion.script}”
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      navigator.clipboard?.writeText(suggestion.script);
                      toast.success("Script copied to clipboard.");
                    }}
                  >
                    Copy script
                  </Button>
                </>
              ) : (
                <Skeleton className="h-16" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — timeline + add note */}
        <div className="space-y-6 lg:col-span-2">
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
                placeholder="Log a call outcome, next steps, or context for this lead…"
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-5 border-l border-border pl-6">
                {lead.activities.map((activity) => (
                  <li key={activity.id} className="relative">
                    <span className="absolute -left-[1.6rem] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-primary ring-4 ring-background" />
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {activity.title}
                      </p>
                      <time className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(activity.createdAt)}
                      </time>
                    </div>
                    {activity.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {activity.description}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {lead.notes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes ({lead.notes.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lead.notes.map((note) => (
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
        </div>
      </div>
    </div>
  );
}
