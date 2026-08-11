"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Mail,
  Phone,
  Send,
  StickyNote,
  UserCircle2,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useLead } from "@/hooks/use-crm";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
} from "@/lib/constants";
import type { LeadStatus } from "@/types/crm.types";
import {
  cn,
  formatCurrency,
  formatDate,
  formatRelativeTime,
  getStatusColor,
} from "@/lib/utils";

const STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
];

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { lead, isLoading, isError, updateLead, convertLead, addNote } =
    useLead(params.id);
  const [note, setNote] = useState("");

  if (isLoading) {
    return (
      <>
        <PageHeader title="Lead" />
        <Skeleton className="h-64 w-full" />
      </>
    );
  }

  if (isError || !lead) {
    return (
      <EmptyState
        title="Lead not found"
        description="This lead may have been deleted."
        action={
          <Button asChild size="sm">
            <Link href="/crm/leads">Back to leads</Link>
          </Button>
        }
      />
    );
  }

  const handleStatusChange = async (status: LeadStatus) => {
    try {
      await updateLead({ status });
      toast.success(`Status: ${LEAD_STATUS_LABELS[status]}`);
    } catch {
      toast.error("Could not update status");
    }
  };

  const handleConvert = async () => {
    try {
      const res = await convertLead();
      if (res?.customerId) {
        toast.success("Converted! Redirecting to customer…");
        router.push(`/crm/customers/${res.customerId}`);
      }
    } catch {
      toast.error("Could not convert lead");
    }
  };

  const handleAddNote = async () => {
    if (!note.trim()) return;
    try {
      await addNote(note.trim());
      setNote("");
      toast.success("Note added");
    } catch {
      toast.error("Could not add note");
    }
  };

  return (
    <>
      <PageHeader
        title={lead.name}
        description={`${LEAD_SOURCE_LABELS[lead.source]} · created ${formatRelativeTime(lead.createdAt)}`}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/crm/leads">
                <ArrowLeft className="h-4 w-4" /> Back
              </Link>
            </Button>
            {lead.status !== "WON" && lead.status !== "LOST" && (
              <Button size="sm" onClick={handleConvert}>
                <CheckCircle2 className="h-4 w-4" /> Convert to customer
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left — info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{lead.email ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{lead.phone ?? "—"}</span>
              </div>
              {lead.company && (
                <div className="flex items-center gap-2">
                  <UserCircle2 className="h-4 w-4 text-muted-foreground" />
                  <span>{lead.company}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Status
                </Label>
                <Select
                  value={lead.status}
                  onValueChange={(v) => handleStatusChange(v as LeadStatus)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {LEAD_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Stat
                label="Lead score"
                value={
                  <Badge
                    variant="outline"
                    className={cn(getStatusColor(lead.status === "WON" ? "won" : lead.status))}
                  >
                    {lead.score ?? 0}/100
                  </Badge>
                }
              />
              <Stat
                label="Budget"
                value={lead.budget ? formatCurrency(lead.budget, lead.currency) : "—"}
              />
              <Stat
                label="Interested in"
                value={lead.interestedIn ?? "—"}
              />
              <Stat
                label="Assigned to"
                value={lead.assignedToName ?? "—"}
              />
              <Stat
                label="Expected close"
                value={lead.expectedCloseDate ? formatDate(lead.expectedCloseDate) : "—"}
              />
              {lead.convertedAt && (
                <Stat
                  label="Converted at"
                  value={formatDate(lead.convertedAt)}
                />
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
                  href={`/tasks/new?relatedType=LEAD&relatedId=${lead.id}&relatedLabel=${encodeURIComponent(lead.name)}`}
                >
                  <StickyNote className="h-4 w-4" /> Create follow-up task
                </Link>
              </Button>
              {lead.status !== "WON" && lead.status !== "LOST" && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleConvert}
                >
                  <CheckCircle2 className="h-4 w-4" /> Convert to customer
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right — timeline + notes */}
        <div className="space-y-6 lg:col-span-2">
          {lead.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {lead.notes}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Activity timeline</CardTitle>
              <CardDescription>
                Everything that&apos;s happened with this lead.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lead.activity && lead.activity.length > 0 ? (
                <ol className="space-y-4">
                  {lead.activity.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <div>
                        <p className="text-sm font-medium">{a.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.type.replace(/_/g, " ").toLowerCase()} ·{" "}
                          {a.actorName ?? "System"} ·{" "}
                          {formatRelativeTime(a.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No activity yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add note</CardTitle>
              <CardDescription>
                Notes are logged to the activity timeline.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="e.g. Spoke with lead, sent pricing, follow up Friday."
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={!note.trim()}
                >
                  <Send className="h-3.5 w-3.5" /> Add note
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
