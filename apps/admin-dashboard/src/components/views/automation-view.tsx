"use client";

import { useState, useMemo } from "react";
import {
  Pause, Play, Settings, Plus, Trash2, Edit2, RefreshCw, Clock,
  CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { CardHead, GlassCard } from "@/components/kit/glass-card";
import { Cell, DataTable, PageHeader, Pill, Row } from "@/components/kit/page-header";
import { KpiCard } from "@/components/kit/kpi-card";
import { StatusBadge } from "@/components/kit/status-badge";
import { FormDialog } from "@/components/kit/form-dialog";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Field } from "@/components/kit/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkflowStore, type Workflow, type WorkflowCategory, type TriggerType } from "@/store/workflow-store";
import { usePermissions } from "@/hooks/use-permissions";
import type { Kpi } from "@/data/mock";

const CATEGORY_TONES: Record<WorkflowCategory, "brand" | "info" | "success" | "violet" | "warning" | "muted" | "teal"> = {
  CRM: "brand",
  Email: "info",
  Orders: "success",
  Calendar: "violet",
  Support: "warning",
  AI: "teal",
  Notifications: "muted",
};

const ALL_CATEGORIES: WorkflowCategory[] = ["CRM", "Email", "Orders", "Calendar", "Support", "AI", "Notifications"];
const ALL_TRIGGERS: { value: TriggerType; label: string; desc: string }[] = [
  { value: "event", label: "Event", desc: "Fires when a system event occurs (e.g. lead.created)" },
  { value: "schedule", label: "Schedule (Cron)", desc: "Fires on a recurring schedule (e.g. daily at 2am)" },
  { value: "webhook", label: "Webhook", desc: "Fires when an external system calls a webhook URL" },
  { value: "manual", label: "Manual", desc: "Only runs when triggered by an admin" },
];

export function AutomationView() {
  const workflows = useWorkflowStore((s) => s.workflows);
  const create = useWorkflowStore((s) => s.create);
  const update = useWorkflowStore((s) => s.update);
  const remove = useWorkflowStore((s) => s.remove);
  const toggleEnabled = useWorkflowStore((s) => s.toggleEnabled);
  const recordRun = useWorkflowStore((s) => s.recordRun);
  const { can } = usePermissions();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Workflow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);

  const kpis: Kpi[] = useMemo(() => {
    const active = workflows.filter((w) => w.enabled).length;
    const totalRuns = workflows.reduce((s, w) => s + w.runs, 0);
    const totalSuccess = workflows.reduce((s, w) => s + Math.round((w.runs * w.successRate) / 100), 0);
    const avgRate = totalRuns > 0 ? Math.round((totalSuccess / totalRuns) * 1000) / 10 : 100;
    const failed = totalRuns - totalSuccess;
    return [
      { label: "Active Workflows", value: active, trend: "up" as const, change: `${workflows.length - active} paused`, icon: "bot" as const, tone: "brand" as const, spark: [26, 28, 30, 33, 35, 37, active] },
      { label: "Total Runs", value: totalRuns, trend: "up" as const, change: "+9.4%", icon: "chunks" as const, tone: "info" as const, spark: [3400, 3800, 4100, 4400, 4650, 4850, totalRuns] },
      { label: "Success Rate", value: avgRate, suffix: "%", decimals: 1, trend: "up" as const, change: "+0.6%", icon: "revenue" as const, tone: "success" as const, spark: [96.4, 96.9, 97.2, 97.6, 98, 98.3, avgRate] },
      { label: "Failed Runs", value: failed, trend: "down" as const, change: "-5", icon: "latency" as const, tone: "violet" as const, spark: [26, 24, 21, 18, 16, 14, failed] },
    ];
  }, [workflows]);

  const handleToggle = (wf: Workflow) => {
    if (!can("automation", "execute")) {
      toast.error("Permission denied", { description: "You cannot toggle workflows." });
      return;
    }
    toggleEnabled(wf.id);
    if (wf.enabled) {
      toast.warning(`Paused: ${wf.name}`, { description: "Workflow will not fire on new triggers." });
    } else {
      toast.success(`Resumed: ${wf.name}`, { description: "Listening for triggers again." });
    }
  };

  const handleTestRun = (wf: Workflow) => {
    if (!can("automation", "execute")) {
      toast.error("Permission denied");
      return;
    }
    toast.info(`Test running: ${wf.name}`, { description: "Executing workflow manually…" });
    setTimeout(() => {
      recordRun(wf.id, true);
      toast.success(`Test completed: ${wf.name}`, { description: "All actions executed successfully." });
    }, 1200);
  };

  return (
    <>
      <PageHeader
        title="Automation"
        subtitle="Event-driven workflows keeping operations hands-free. Create, configure, and monitor business automations."
        actions={
          <Button
            onClick={() => {
              if (!can("automation", "create")) {
                toast.error("Permission denied", { description: "You cannot create workflows." });
                return;
              }
              setCreateOpen(true);
            }}
            className="bg-gradient-brand"
            size="sm"
          >
            <Plus className="mr-1.5 size-4" /> New Workflow
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} kpi={k} delay={i * 0.05} />
        ))}
      </section>

      {workflows.length === 0 ? (
        <EmptyState
          icon={Settings}
          title="No workflows yet"
          description="Create your first automation to handle leads, orders, reminders, and more."
          action={can("automation", "create") ? { label: "New Workflow", onClick: () => setCreateOpen(true) } : undefined}
        />
      ) : (
        <GlassCard delay={0.15} tilt={false} className="p-5">
          <CardHead title="Workflows" subtitle={`${workflows.length} configured automations`} />
          <DataTable head={["Name", "Category", "Trigger", "Runs", "Success", "Last Run", "Status", ""]}>
            {workflows.map((w) => (
              <Row key={w.id}>
                <Cell className="min-w-0">
                  <p className="truncate font-medium">{w.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{w.description}</p>
                </Cell>
                <Cell><Pill tone={CATEGORY_TONES[w.category]}>{w.category}</Pill></Cell>
                <Cell className="font-mono text-xs text-subtle">{w.triggerEvent}</Cell>
                <Cell className="num">{w.runs.toLocaleString("en-IN")}</Cell>
                <Cell className={w.successRate >= 98 ? "num text-success" : "num text-brand"}>{w.successRate}%</Cell>
                <Cell className="num text-[11px] text-muted-foreground">
                  {w.lastRunAt ? new Date(w.lastRunAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never"}
                </Cell>
                <Cell>
                  <button
                    onClick={() => handleToggle(w)}
                    disabled={!can("automation", "execute")}
                    aria-label={w.enabled ? "Pause workflow" : "Resume workflow"}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Pill tone={w.enabled ? "success" : "muted"}>
                      {w.enabled ? <Play className="size-3" /> : <Pause className="size-3" />}
                      {w.enabled ? "Active" : "Paused"}
                    </Pill>
                  </button>
                </Cell>
                <Cell>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleTestRun(w)}
                      disabled={!can("automation", "execute")}
                      aria-label="Test run"
                      className="grid size-8 place-items-center rounded-lg border border-border bg-glass text-subtle transition-colors hover:text-success"
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (!can("automation", "edit")) { toast.error("Permission denied"); return; }
                        setEditTarget(w);
                      }}
                      aria-label="Edit workflow"
                      className="grid size-8 place-items-center rounded-lg border border-border bg-glass text-subtle transition-colors hover:text-brand"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    {can("automation", "delete") ? (
                      <button
                        onClick={() => setDeleteTarget(w)}
                        aria-label="Delete workflow"
                        className="grid size-8 place-items-center rounded-lg border border-border bg-glass text-subtle transition-colors hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </Cell>
              </Row>
            ))}
          </DataTable>
        </GlassCard>
      )}

      <WorkflowFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(data) => {
          create(data);
          toast.success("Workflow created", { description: `${data.name} is now ${data.enabled ? "active" : "paused"}.` });
        }}
      />

      {editTarget ? (
        <WorkflowFormDialog
          key={editTarget.id}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          initial={editTarget}
          onSubmit={(data) => {
            update(editTarget.id, data);
            toast.success("Workflow updated", { description: `${data.name} configuration saved.` });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete workflow?"
        description={`"${deleteTarget?.name}" will be permanently removed. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          remove(deleteTarget.id);
          toast.success("Workflow deleted", { description: deleteTarget.name });
        }}
      />
    </>
  );
}

function WorkflowFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    name: string;
    description: string;
    category: WorkflowCategory;
    triggerType: TriggerType;
    triggerEvent: string;
    triggerConfig: string;
    actions: string[];
    enabled: boolean;
  }) => void;
  initial?: Workflow;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<WorkflowCategory>(initial?.category ?? "CRM");
  const [triggerType, setTriggerType] = useState<TriggerType>(initial?.triggerType ?? "event");
  const [triggerEvent, setTriggerEvent] = useState(initial?.triggerEvent ?? "");
  const [triggerConfig, setTriggerConfig] = useState(initial?.triggerConfig ?? "{}");
  const [actionsText, setActionsText] = useState(initial?.actions.join("\n") ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const handleSubmit = () => {
    if (!name.trim()) throw new Error("Workflow name is required");
    if (!triggerEvent.trim()) throw new Error("Trigger event is required");
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(triggerConfig);
    } catch {
      throw new Error("Trigger config must be valid JSON");
    }
    if (typeof parsedConfig !== "object" || parsedConfig === null) {
      throw new Error("Trigger config must be a JSON object");
    }
    const actions = actionsText.split("\n").map((a) => a.trim()).filter(Boolean);
    if (actions.length === 0) throw new Error("At least one action is required");
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      category,
      triggerType,
      triggerEvent: triggerEvent.trim(),
      triggerConfig,
      actions,
      enabled,
    });
    // Reset on success
    if (!initial) {
      setName(""); setDescription(""); setCategory("CRM"); setTriggerType("event");
      setTriggerEvent(""); setTriggerConfig("{}"); setActionsText(""); setEnabled(true);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit Workflow" : "New Workflow"}
      description={initial ? "Update the workflow configuration." : "Create a new automation workflow. Define the trigger, actions, and category."}
      onSubmit={handleSubmit}
      submitLabel={initial ? "Save Changes" : "Create Workflow"}
      size="lg"
    >
      <Field label="Workflow name" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lead Capture & Assignment"
          className="h-10 border-border bg-glass"
        />
      </Field>
      <Field label="Description" hint="What does this workflow do?">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="When a new lead is created, score it and assign to a sales rep."
          className="min-h-[60px] border-border bg-glass text-[13px]"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" required>
          <Select value={category} onValueChange={(v) => setCategory(v as WorkflowCategory)}>
            <SelectTrigger className="h-10 border-border bg-glass"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Trigger type" required>
          <Select value={triggerType} onValueChange={(v) => setTriggerType(v as TriggerType)}>
            <SelectTrigger className="h-10 border-border bg-glass"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_TRIGGERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field
        label="Trigger event"
        required
        hint="The event name or schedule identifier. Examples: lead.created, order.paid, cron.daily"
      >
        <Input
          value={triggerEvent}
          onChange={(e) => setTriggerEvent(e.target.value)}
          placeholder="lead.created"
          className="h-10 border-border bg-glass font-mono text-[12px]"
        />
      </Field>
      <Field
        label="Trigger configuration (JSON)"
        required
        hint="JSON object with trigger-specific config (cron expression, webhook filter, etc.)"
      >
        <Textarea
          value={triggerConfig}
          onChange={(e) => setTriggerConfig(e.target.value)}
          placeholder='{"event":"lead.created","filter":{"source":["website","whatsapp"]}}'
          className="min-h-[80px] border-border bg-glass font-mono text-[12px]"
        />
      </Field>
      <Field
        label="Actions"
        required
        hint="One action per line. These are the steps the workflow executes."
      >
        <Textarea
          value={actionsText}
          onChange={(e) => setActionsText(e.target.value)}
          placeholder={"Score lead\nAssign to rep (round-robin)\nSend WhatsApp welcome\nCreate follow-up task"}
          className="min-h-[100px] border-border bg-glass text-[13px]"
        />
      </Field>
      <div className="flex items-center justify-between rounded-xl border border-border bg-glass px-4 py-3">
        <div>
          <Label className="text-[13px] font-semibold">Enabled</Label>
          <p className="text-[11px] text-muted-foreground">If enabled, the workflow will fire on triggers.</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
    </FormDialog>
  );
}
