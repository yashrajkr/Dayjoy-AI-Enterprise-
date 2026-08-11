"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  KanbanSquare,
  ListFilter,
  Plus,
  Search,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLeads, useCreateLead } from "@/hooks/use-crm";
import { useDebounce } from "@/hooks/use-debounce";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
} from "@/lib/constants";
import type {
  LeadSource,
  LeadStatus,
  CreateLeadInput,
} from "@/types/crm.types";
import {
  cn,
  formatCurrency,
  formatRelativeTime,
  getStatusColor,
} from "@/lib/utils";

const SOURCES: (LeadSource | "ALL")[] = [
  "ALL",
  "WEBSITE",
  "WHATSAPP",
  "VOICE_CALL",
  "REFERRAL",
  "SOCIAL_MEDIA",
  "EMAIL_CAMPAIGN",
  "EVENT",
  "WALK_IN",
  "OTHER",
];

const STATUSES: (LeadStatus | "ALL")[] = [
  "ALL",
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
];

const PIPELINE_COLUMNS: { status: LeadStatus; label: string; accent: string }[] = [
  { status: "NEW", label: "New", accent: "border-t-slate-400" },
  { status: "CONTACTED", label: "Contacted", accent: "border-t-sky-500" },
  { status: "QUALIFIED", label: "Qualified", accent: "border-t-cyan-500" },
  { status: "PROPOSAL", label: "Proposal", accent: "border-t-violet-500" },
  { status: "NEGOTIATION", label: "Negotiation", accent: "border-t-amber-500" },
  { status: "WON", label: "Won", accent: "border-t-emerald-500" },
  { status: "LOST", label: "Lost", accent: "border-t-rose-500" },
];

export default function LeadsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<LeadSource | "ALL">("ALL");
  const [status, setStatus] = useState<LeadStatus | "ALL">("ALL");
  const [view, setView] = useState<"TABLE" | "PIPELINE">("TABLE");
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const filters = useMemo(
    () => ({
      search: debouncedSearch,
      source,
      status,
      assigneeId: "ME" as const,
    }),
    [debouncedSearch, source, status],
  );

  const { data, isLoading, isError } = useLeads(filters);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((l) => {
      if (source !== "ALL" && l.source !== source) return false;
      if (status !== "ALL" && l.status !== status) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        if (
          !l.name.toLowerCase().includes(q) &&
          !(l.email ?? "").toLowerCase().includes(q) &&
          !(l.phone ?? "").includes(q) &&
          !(l.company ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [data, source, status, debouncedSearch]);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Pipeline of prospects. Move them through stages, score, and convert."
        actions={
          <CreateLeadDialog open={createOpen} onOpenChange={setCreateOpen} />
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, phone, company…"
              className="pl-9"
              aria-label="Search leads"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={source} onValueChange={(v) => setSource(v as LeadSource | "ALL")}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_SOURCE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => setStatus(v as LeadStatus | "ALL")}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs value={view} onValueChange={(v) => setView(v as "TABLE" | "PIPELINE")}>
              <TabsList className="h-9">
                <TabsTrigger value="TABLE" className="gap-1">
                  <ListFilter className="h-3.5 w-3.5" /> Table
                </TabsTrigger>
                <TabsTrigger value="PIPELINE" className="gap-1">
                  <KanbanSquare className="h-3.5 w-3.5" /> Pipeline
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <EmptyState title="Couldn't load leads" description="Please try again in a moment." />
      ) : isLoading ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No leads found"
          description="Try adjusting your filters or create a new lead."
          action={
            <CreateLeadDialog
              open={createOpen}
              onOpenChange={setCreateOpen}
              asTrigger
            />
          }
        />
      ) : view === "PIPELINE" ? (
        <PipelineView leads={filtered} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-[130px]">Source</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead className="w-[100px]">Score</TableHead>
                <TableHead className="w-[110px] text-right">Budget</TableHead>
                <TableHead className="w-[130px]">Assigned to</TableHead>
                <TableHead className="w-[110px]">Last contact</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link
                      href={`/crm/leads/${l.id}`}
                      className="text-sm font-medium text-foreground hover:text-primary"
                    >
                      {l.name}
                    </Link>
                    {l.company && (
                      <p className="text-xs text-muted-foreground">{l.company}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {LEAD_SOURCE_LABELS[l.source]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(getStatusColor(l.status))}
                    >
                      {LEAD_STATUS_LABELS[l.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ScoreBadge score={l.score ?? 0} />
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {l.budget ? formatCurrency(l.budget, l.currency) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.assignedToName ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.lastContactedAt
                      ? formatRelativeTime(l.lastContactedAt)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/crm/leads/${l.id}`}>
                        Open <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 70
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : score >= 40
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-rose-500/15 text-rose-700 dark:text-rose-400";
  return (
    <Badge variant="outline" className={cn("text-xs tabular-nums", cls)}>
      {score}
    </Badge>
  );
}

function PipelineView({ leads }: { leads: import("@/types/crm.types").Lead[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {PIPELINE_COLUMNS.map((col) => {
        const columnLeads = leads.filter((l) => l.status === col.status);
        return (
          <Card key={col.status} className={cn("flex flex-col border-t-4", col.accent)}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium uppercase tracking-wide">
                  {col.label}
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {columnLeads.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-2 p-3 pt-0">
              {columnLeads.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                  No leads
                </p>
              ) : (
                columnLeads.map((l) => (
                  <Link
                    key={l.id}
                    href={`/crm/leads/${l.id}`}
                    className="block rounded-md border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <p className="text-sm font-medium leading-snug">{l.name}</p>
                    {l.company && (
                      <p className="text-[11px] text-muted-foreground">{l.company}</p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <ScoreBadge score={l.score ?? 0} />
                      {l.budget && (
                        <span className="text-[10px] text-muted-foreground">
                          {formatCurrency(l.budget, l.currency)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CreateLeadDialog({
  open,
  onOpenChange,
  asTrigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asTrigger?: boolean;
}) {
  const createLead = useCreateLead();
  const [form, setForm] = useState<CreateLeadInput>({
    name: "",
    email: "",
    phone: "",
    company: "",
    source: "WEBSITE",
    status: "NEW",
    budget: 0,
    interestedIn: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await createLead.mutateAsync(form);
      onOpenChange(false);
      setForm({
        name: "",
        email: "",
        phone: "",
        company: "",
        source: "WEBSITE",
        status: "NEW",
        budget: 0,
        interestedIn: "",
        notes: "",
      });
    } catch {
      toast.error("Could not create lead");
    }
  };

  const trigger = asTrigger ? (
    <Button size="sm">
      <Plus className="h-4 w-4" /> New lead
    </Button>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {asTrigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>
            Capture a new prospect. You can edit details later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Source</Label>
              <Select
                value={form.source}
                onValueChange={(v) => setForm({ ...form, source: v as LeadSource })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.filter((s) => s !== "ALL").map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Initial status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as LeadStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.filter((s) => s !== "ALL").map((s) => (
                    <SelectItem key={s} value={s}>
                      {LEAD_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="interestedIn">Interested in</Label>
            <Input
              id="interestedIn"
              value={form.interestedIn}
              onChange={(e) => setForm({ ...form, interestedIn: e.target.value })}
              placeholder="e.g. Wellness Bundle"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createLead.isPending}>
              {createLead.isPending ? "Creating…" : "Create lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
