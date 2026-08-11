"use client";

import { useState, useMemo } from "react";
import { Search, Download, Trash2, ScrollText, Filter, X } from "lucide-react";
import { toast } from "sonner";
import { CardHead, GlassCard } from "@/components/kit/glass-card";
import { Cell, DataTable, PageHeader, Pill, Row } from "@/components/kit/page-header";
import { StatusBadge } from "@/components/kit/status-badge";
import { EmptyState } from "@/components/kit/empty-state";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { Field } from "@/components/kit/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuditStore } from "@/store/audit-store";
import { usePermissions } from "@/hooks/use-permissions";
import type { AuditAction, ResourceType } from "@/types/domain";

const ACTION_TONES: Record<AuditAction, "success" | "info" | "danger" | "warning" | "brand" | "violet"> = {
  INSERT: "success",
  UPDATE: "info",
  DELETE: "danger",
  TEST: "violet",
  CONFIGURE: "warning",
  EXPORT: "brand",
};

const RESOURCE_LABELS: Record<ResourceType, string> = {
  assistant: "Assistant",
  knowledge: "Knowledge",
  tool: "Tool",
  memory: "Memory",
  prompt: "Prompt",
  voice: "Voice",
  whatsapp: "WhatsApp",
  website: "Website",
  automation: "Automation",
  admin: "Admin",
  audit: "Audit",
  config: "Config",
};

const ALL_RESOURCES: ResourceType[] = [
  "assistant", "knowledge", "tool", "memory", "prompt",
  "voice", "whatsapp", "website", "automation", "admin", "config",
];

const ALL_ACTIONS: AuditAction[] = ["INSERT", "UPDATE", "DELETE", "TEST", "CONFIGURE", "EXPORT"];

export function AuditView() {
  const entries = useAuditStore((s) => s.entries);
  const clear = useAuditStore((s) => s.clear);
  const { can } = usePermissions();

  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [clearOpen, setClearOpen] = useState(false);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (resourceFilter !== "all" && e.resourceType !== resourceFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        if (
          !e.resourceName?.toLowerCase().includes(q)
          && !e.userEmail.toLowerCase().includes(q)
          && !e.action.toLowerCase().includes(q)
          && !e.resourceType.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [entries, query, actionFilter, resourceFilter]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = entries.filter((e) => new Date(e.createdAt) >= today).length;
    const last24h = entries.filter((e) => Date.now() - new Date(e.createdAt).getTime() < 86400_000).length;
    const byAction: Record<string, number> = {};
    for (const e of entries) byAction[e.action] = (byAction[e.action] ?? 0) + 1;
    return { total: entries.length, today: todayCount, last24h, byAction };
  }, [entries]);

  const handleExport = () => {
    if (!can("audit", "export")) {
      toast.error("Permission denied", { description: "You cannot export audit logs." });
      return;
    }
    const headers = ["Timestamp", "Action", "Resource Type", "Resource Name", "User Email", "IP"];
    const rows = filtered.map((e) => [
      new Date(e.createdAt).toISOString(),
      e.action,
      e.resourceType,
      e.resourceName ?? "",
      e.userEmail,
      e.ipAddress,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dayjoy-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Audit log exported", { description: `${filtered.length} entries exported.` });
  };

  return (
    <>
      <PageHeader
        title="Audit Logs"
        subtitle="Immutable record of every administrative action across the Dayjoy AI Control Center."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!can("audit", "export")} className="border-border bg-glass">
              <Download className="mr-1.5 size-4" /> Export
            </Button>
            {can("audit", "export") ? (
              <Button variant="outline" size="sm" onClick={() => setClearOpen(true)} className="border-border bg-glass text-danger hover:text-danger">
                <Trash2 className="mr-1.5 size-4" /> Clear
              </Button>
            ) : null}
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassCard delay={0.05} className="p-5">
          <p className="text-3xl font-bold num">{stats.total}</p>
          <p className="mt-1 text-[13px] text-subtle">Total entries</p>
        </GlassCard>
        <GlassCard delay={0.1} className="p-5">
          <p className="text-3xl font-bold num">{stats.last24h}</p>
          <p className="mt-1 text-[13px] text-subtle">Last 24 hours</p>
        </GlassCard>
        <GlassCard delay={0.15} className="p-5">
          <p className="text-3xl font-bold num">{stats.byAction.DELETE ?? 0}</p>
          <p className="mt-1 text-[13px] text-subtle">Deletions</p>
        </GlassCard>
        <GlassCard delay={0.2} className="p-5">
          <p className="text-3xl font-bold num">{stats.byAction.CONFIGURE ?? 0}</p>
          <p className="mt-1 text-[13px] text-subtle">Configurations</p>
        </GlassCard>
      </section>

      <GlassCard delay={0.15} tilt={false} className="p-4">
        <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto]">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by resource, user, or action..."
              className="h-10 border-border bg-glass pl-9"
            />
          </label>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-10 w-[150px] border-border bg-glass">
              <Filter className="mr-1.5 size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ALL_ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={resourceFilter} onValueChange={setResourceFilter}>
            <SelectTrigger className="h-10 w-[170px] border-border bg-glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All resources</SelectItem>
              {ALL_RESOURCES.map((r) => <SelectItem key={r} value={r}>{RESOURCE_LABELS[r]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {(query || actionFilter !== "all" || resourceFilter !== "all") && (
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[12px] text-muted-foreground">
              Showing <strong className="text-foreground">{filtered.length}</strong> of {entries.length} entries
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setQuery(""); setActionFilter("all"); setResourceFilter("all"); }}
              className="h-7 text-[11px]"
            >
              <X className="mr-1 size-3" /> Clear
            </Button>
          </div>
        )}
      </GlassCard>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={entries.length === 0 ? "No audit entries yet" : "No matching entries"}
          description={entries.length === 0 ? "Audit entries will appear here as admins perform actions across the platform." : "Try adjusting your filters."}
        />
      ) : (
        <GlassCard delay={0.2} tilt={false} className="p-5">
          <CardHead title="Audit Trail" subtitle={`${filtered.length} entries`} />
          <DataTable head={["Timestamp", "Action", "Resource", "Name", "User", "IP"]}>
            {filtered.slice(0, 100).map((e) => (
              <Row key={e.id}>
                <Cell className="num text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </Cell>
                <Cell><Pill tone={ACTION_TONES[e.action]}>{e.action}</Pill></Cell>
                <Cell><Pill tone="info">{RESOURCE_LABELS[e.resourceType] ?? e.resourceType}</Pill></Cell>
                <Cell className="min-w-0 max-w-[200px] truncate text-[12px]">{e.resourceName ?? "—"}</Cell>
                <Cell className="text-[12px] text-subtle">{e.userEmail}</Cell>
                <Cell className="num text-[11px] text-muted-foreground font-mono">{e.ipAddress}</Cell>
              </Row>
            ))}
          </DataTable>
          {filtered.length > 100 ? (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Showing first 100 of {filtered.length} entries. Use filters to narrow down.
            </p>
          ) : null}
        </GlassCard>
      )}

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear all audit entries?"
        description={`This will permanently delete all ${entries.length} audit log entries. In production, audit logs are typically retained for 1-7 years for compliance. This action cannot be undone.`}
        confirmLabel="Clear All"
        onConfirm={() => {
          clear();
          toast.success("Audit log cleared", { description: "All entries have been removed." });
        }}
      />
    </>
  );
}
