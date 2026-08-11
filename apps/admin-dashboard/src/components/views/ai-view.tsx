"use client";

import { useMemo, useState, type ComponentProps } from "react";
import {
  Bot, Plus, Play, Settings, Trash2, Wrench, MemoryStick,
  FileText, FlaskConical, GitBranch, Search, Loader2, Send,
  Sparkles, History, Eye,
} from "lucide-react";
import { toast } from "sonner";

import { useAssistantStore } from "@/store/assistant-store";
import { useToolStore } from "@/store/tool-store";
import { useMemoryStore } from "@/store/memory-store";
import { usePromptStore } from "@/store/prompt-store";
import { useKnowledgeStore } from "@/store/knowledge-store";
import { usePermissions } from "@/hooks/use-permissions";

import type {
  Assistant, Tool, MemoryRecord, Prompt,
  AgentType, ChannelType, ToolCategory, ToolExecutionType,
  MemoryType, MemoryScope,
} from "@/types/domain";
import type { Kpi } from "@/data/mock";

import { CardHead, GlassCard } from "@/components/kit/glass-card";
import { Cell, DataTable, Meter, PageHeader, Pill, Row } from "@/components/kit/page-header";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

import { toneGradient } from "@/lib/tone";
import type { Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";

// ===== Constants =====
const AGENT_TYPES: AgentType[] = [
  "SUPPORT", "SALES", "ONBOARDING", "TECHNICAL", "BILLING",
  "DISTRIBUTOR", "ADMIN", "VOICE", "WHATSAPP", "WEB",
];
const MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "claude-3.5-sonnet"];
const CHANNELS: ChannelType[] = ["voice", "whatsapp", "website"];
const TOOL_CATEGORIES: ToolCategory[] = [
  "knowledge", "crm", "catalog", "communication", "calendar", "utility", "custom",
];
const EXECUTION_TYPES: ToolExecutionType[] = ["function", "api", "workflow"];
const MEMORY_TYPES: MemoryType[] = ["FACT", "PREFERENCE", "HISTORY", "CONTEXT"];
const MEMORY_SCOPES: MemoryScope[] = ["customer", "session", "distributor", "tenant"];
const PROMPT_CATEGORIES: Prompt["category"][] = ["system", "rag", "channel", "escalation", "custom"];

const AGENT_TONE: Record<AgentType, Tone> = {
  SUPPORT: "brand", SALES: "success", ONBOARDING: "info", TECHNICAL: "violet",
  BILLING: "warning", DISTRIBUTOR: "gold", ADMIN: "danger",
  VOICE: "info", WHATSAPP: "success", WEB: "teal",
};
const TOOL_TONE: Record<ToolCategory, Tone> = {
  knowledge: "info", crm: "brand", catalog: "violet", communication: "success",
  calendar: "warning", utility: "teal", custom: "muted",
};
const MEMORY_TONE: Record<MemoryType, Tone> = {
  FACT: "info", PREFERENCE: "brand", HISTORY: "violet", CONTEXT: "teal",
};
const PROMPT_TONE: Record<Prompt["category"], Tone> = {
  system: "brand", rag: "info", channel: "success", escalation: "danger", custom: "muted",
};

// ===== Helpers =====
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function estimateTokens(s: string): number {
  return Math.max(1, Math.round(s.length / 4));
}

function spark(seed: number): number[] {
  const base = Math.max(1, seed);
  return [base, base + 2, base + 1, base + 3, base + 2, base + 4, base + 5];
}

function kpi(label: string, value: number, icon: Kpi["icon"], tone: Tone, change: string): Kpi {
  return { label, value, icon, tone, change, trend: "up", spark: spark(value) };
}

function toggleInArray<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

// Permission-gated button: renders enabled Button when allowed, else a disabled
// Button wrapped in a "Permission denied" tooltip.
function GateButton({
  allowed,
  tooltipText = "Permission denied",
  children,
  ...rest
}: { allowed: boolean; tooltipText?: string } & ComponentProps<typeof Button>) {
  if (allowed) {
    return <Button {...rest}>{children}</Button>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button {...rest} disabled>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

// Multi-select list rendered as a scrollable column of checkboxes.
function CheckboxList<T extends string>({
  items,
  selected,
  onToggle,
  emptyLabel = "Nothing available yet",
  className,
}: {
  items: { value: T; label: string; hint?: string }[];
  selected: T[];
  onToggle: (v: T) => void;
  emptyLabel?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <p className={cn("rounded-lg border border-border bg-glass px-3 py-4 text-center text-[11px] text-muted-foreground", className)}>
        {emptyLabel}
      </p>
    );
  }
  return (
    <ScrollArea className={cn("h-32 rounded-lg border border-border bg-glass", className)}>
      <div className="space-y-0.5 px-1.5 py-1.5">
        {items.map((it) => {
          const checked = selected.includes(it.value);
          return (
            <label
              key={it.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-glass-strong"
            >
              <Checkbox checked={checked} onCheckedChange={() => onToggle(it.value)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]">{it.label}</span>
                {it.hint ? (
                  <span className="block truncate text-[10px] text-muted-foreground">{it.hint}</span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </ScrollArea>
  );
}

// ===== Main view =====
export function AIView() {
  return (
    <>
      <PageHeader
        title="AI Management"
        subtitle="Assistants, tools, memory and prompt orchestration."
      />
      <Tabs defaultValue="agents" className="w-full">
        <TabsList className="bg-glass-strong">
          <TabsTrigger value="agents" className="gap-1.5">
            <Bot className="size-3.5" /> Agents
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5">
            <Wrench className="size-3.5" /> Tools
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-1.5">
            <MemoryStick className="size-3.5" /> Memory
          </TabsTrigger>
          <TabsTrigger value="prompts" className="gap-1.5">
            <FileText className="size-3.5" /> Prompts
          </TabsTrigger>
        </TabsList>
        <TabsContent value="agents" className="mt-4 space-y-4">
          <AgentsTab />
        </TabsContent>
        <TabsContent value="tools" className="mt-4 space-y-4">
          <ToolsTab />
        </TabsContent>
        <TabsContent value="memory" className="mt-4 space-y-4">
          <MemoryTab />
        </TabsContent>
        <TabsContent value="prompts" className="mt-4 space-y-4">
          <PromptsTab />
        </TabsContent>
      </Tabs>
      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Play className="size-3" /> Changes deploy to all channels within 30 seconds.
      </p>
    </>
  );
}

// ===== Tab 1: Agents =====
function AgentsTab() {
  const assistants = useAssistantStore((s) => s.assistants);
  const create = useAssistantStore((s) => s.create);
  const update = useAssistantStore((s) => s.update);
  const remove = useAssistantStore((s) => s.remove);
  const tools = useToolStore((s) => s.tools);
  const docs = useKnowledgeStore((s) => s.documents);
  const { can } = usePermissions();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Assistant | null>(null);
  const [openTarget, setOpenTarget] = useState<Assistant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assistant | null>(null);

  const kpis = useMemo(() => {
    const total = assistants.length;
    const active = assistants.filter((a) => a.status === "active").length;
    const convos = assistants.reduce((s, a) => s + a.conversations, 0);
    const avgAcc = total > 0 ? Math.round(assistants.reduce((s, a) => s + a.accuracy, 0) / total) : 0;
    return [
      kpi("Total Assistants", total, "bot", "brand", `${active} active`),
      kpi("Active", active, "phone", "success", "live"),
      kpi("Conversations", convos, "chat", "info", "+12%"),
      kpi("Avg Accuracy", avgAcc, "query", "violet", "+1.4%"),
    ];
  }, [assistants]);

  const knowledgeItems = useMemo(
    () => docs.map((d) => ({ value: d.id, label: d.title, hint: d.category })),
    [docs],
  );
  const toolItems = useMemo(
    () => tools.map((t) => ({ value: t.id, label: t.name, hint: t.category })),
    [tools],
  );

  const canCreate = can("assistant", "create");
  const canView = can("assistant", "view");
  const canEdit = can("assistant", "edit");
  const canDelete = can("assistant", "delete");
  const canTest = can("assistant", "test");

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} kpi={k} delay={i * 0.05} />
        ))}
      </section>

      <div className="flex justify-end">
        <GateButton
          allowed={canCreate}
          onClick={() => setCreateOpen(true)}
          className="bg-gradient-brand"
          size="sm"
        >
          <Plus className="size-4" /> Create Assistant
        </GateButton>
      </div>

      {assistants.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No assistants yet"
          description="Create your first AI assistant to start automating conversations across channels."
          action={canCreate ? { label: "Create Assistant", onClick: () => setCreateOpen(true) } : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {assistants.map((a, i) => (
            <GlassCard key={a.id} delay={i * 0.04} className="p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-xl text-base font-bold text-primary-foreground",
                    toneGradient[AGENT_TONE[a.type]],
                  )}
                >
                  {a.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{a.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Pill tone={AGENT_TONE[a.type]}>{a.type}</Pill>
                    <StatusBadge status={a.status} />
                  </div>
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-[12px] text-subtle">{a.description}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-border bg-glass px-2 py-2">
                  <p className="num truncate text-[13px] font-semibold">{a.conversations.toLocaleString()}</p>
                  <p className="truncate text-[10px] text-subtle">Convos</p>
                </div>
                <div className="rounded-lg border border-border bg-glass px-2 py-2">
                  <p className="num truncate text-[13px] font-semibold">{a.accuracy}%</p>
                  <p className="truncate text-[10px] text-subtle">Accuracy</p>
                </div>
                <div className="rounded-lg border border-border bg-glass px-2 py-2">
                  <p className="num truncate text-[10px] font-semibold">{a.model}</p>
                  <p className="truncate text-[10px] text-subtle">Model</p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <GateButton
                  allowed={canView}
                  onClick={() => setOpenTarget(a)}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-border bg-glass"
                >
                  <Eye className="size-3.5" /> Open
                </GateButton>
                <GateButton
                  allowed={canEdit}
                  onClick={() => setEditTarget(a)}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-border bg-glass"
                >
                  <Settings className="size-3.5" /> Configure
                </GateButton>
                <GateButton
                  allowed={canDelete}
                  onClick={() => setDeleteTarget(a)}
                  variant="outline"
                  size="sm"
                  className="border-border bg-glass hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </GateButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {createOpen ? (
        <AssistantFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode="create"
          knowledgeItems={knowledgeItems}
          toolItems={toolItems}
          onSubmit={(data) => {
            const a = create(data);
            toast.success("Assistant created", { description: `${a.name} is now ${a.status}.` });
          }}
        />
      ) : null}

      {editTarget ? (
        <AssistantFormDialog
          key={editTarget.id}
          open
          onOpenChange={(o) => !o && setEditTarget(null)}
          mode="edit"
          initial={editTarget}
          knowledgeItems={knowledgeItems}
          toolItems={toolItems}
          onSubmit={(data) => {
            update(editTarget.id, data);
            toast.success("Assistant updated", { description: `${editTarget.name} configuration saved.` });
          }}
        />
      ) : null}

      {openTarget ? (
        <AssistantDetailDialog assistant={openTarget} onClose={() => setOpenTarget(null)} canTest={canTest} />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete assistant?"
        description={`This will permanently remove "${deleteTarget?.name}" and detach it from all channels. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          remove(deleteTarget.id);
          toast.success("Assistant deleted", { description: deleteTarget.name });
        }}
      />
    </>
  );
}

function AssistantFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  knowledgeItems,
  toolItems,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "create" | "edit";
  initial?: Assistant;
  knowledgeItems: { value: string; label: string; hint?: string }[];
  toolItems: { value: string; label: string; hint?: string }[];
  onSubmit: (data: Omit<Assistant, "id" | "conversations" | "accuracy" | "createdBy" | "createdAt" | "updatedAt">) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<AgentType>(initial?.type ?? "SUPPORT");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? "");
  const [model, setModel] = useState(initial?.model ?? "gpt-4o");
  const [temperature, setTemperature] = useState(initial?.temperature ?? 0.7);
  const [knowledgeSourceIds, setKnowledgeSourceIds] = useState<string[]>(initial?.knowledgeSourceIds ?? []);
  const [toolIds, setToolIds] = useState<string[]>(initial?.toolIds ?? []);
  const [memoryEnabled, setMemoryEnabled] = useState<boolean>(initial?.memoryEnabled ?? true);
  const [memoryRetentionDays, setMemoryRetentionDays] = useState<number>(initial?.memoryRetentionDays ?? 30);
  const [allowedChannels, setAllowedChannels] = useState<ChannelType[]>(initial?.allowedChannels ?? []);
  const [status, setStatus] = useState<Assistant["status"]>(initial?.status ?? "active");

  const handleSubmit = () => {
    if (!name.trim()) throw new Error("Name is required");
    if (!description.trim()) throw new Error("Description is required");
    if (!systemPrompt.trim()) throw new Error("System prompt is required");
    if (memoryEnabled && (memoryRetentionDays < 1 || memoryRetentionDays > 365)) {
      throw new Error("Retention must be between 1 and 365 days");
    }
    onSubmit({
      name: name.trim(),
      type,
      description: description.trim(),
      systemPrompt: systemPrompt.trim(),
      model,
      temperature,
      knowledgeSourceIds,
      toolIds,
      memoryEnabled,
      memoryRetentionDays,
      allowedChannels,
      status,
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Create Assistant" : `Configure ${initial?.name}`}
      description="Define the persona, model, knowledge base, tools, memory and channels for this assistant."
      onSubmit={handleSubmit}
      submitLabel={mode === "create" ? "Create" : "Save"}
      size="lg"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sarah"
            className="h-10 border-border bg-glass"
          />
        </Field>
        <Field label="Type" required>
          <Select value={type} onValueChange={(v) => setType(v as AgentType)}>
            <SelectTrigger className="h-10 w-full border-border bg-glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AGENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Description" required>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this assistant do?"
          className="min-h-[60px] border-border bg-glass"
        />
      </Field>
      <Field label="System Prompt" required hint="The guardrails and persona instructions for the assistant.">
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a Dayjoy AI assistant..."
          className="min-h-[100px] border-border bg-glass font-mono text-[12px]"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Model" required>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="h-10 w-full border-border bg-glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status" required>
          <Select value={status} onValueChange={(v) => setStatus(v as Assistant["status"])}>
            <SelectTrigger className="h-10 w-full border-border bg-glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label={`Temperature — ${temperature.toFixed(1)}`} hint="Lower = focused, higher = creative.">
        <Slider
          value={[temperature]}
          onValueChange={(v) => setTemperature(v[0])}
          min={0}
          max={2}
          step={0.1}
          className="mt-2"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Knowledge Sources" hint="Documents this assistant can retrieve from.">
          <CheckboxList
            items={knowledgeItems}
            selected={knowledgeSourceIds}
            onToggle={(v) => setKnowledgeSourceIds((prev) => toggleInArray(prev, v))}
            emptyLabel="No documents uploaded yet"
          />
        </Field>
        <Field label="Tools" hint="Functions this assistant can call.">
          <CheckboxList
            items={toolItems}
            selected={toolIds}
            onToggle={(v) => setToolIds((prev) => toggleInArray(prev, v))}
            emptyLabel="No tools configured yet"
          />
        </Field>
      </div>
      <Field label="Allowed Channels" hint="Where this assistant is allowed to operate.">
        <CheckboxList
          items={CHANNELS.map((c) => ({ value: c, label: c }))}
          selected={allowedChannels}
          onToggle={(v) => setAllowedChannels((prev) => toggleInArray(prev, v))}
        />
      </Field>
      <div className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border border-border bg-glass px-3 py-3">
        <div className="flex items-center gap-3">
          <Switch checked={memoryEnabled} onCheckedChange={setMemoryEnabled} />
          <span className="text-[13px] font-medium">Memory Enabled</span>
        </div>
        {memoryEnabled ? (
          <div className="flex items-center justify-end gap-2">
            <Label className="text-[11px] text-muted-foreground">Retention (days)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={memoryRetentionDays}
              onChange={(e) => setMemoryRetentionDays(Number(e.target.value))}
              className="h-8 w-24 border-border bg-glass"
            />
          </div>
        ) : null}
      </div>
    </FormDialog>
  );
}

function AssistantDetailDialog({
  assistant,
  onClose,
  canTest,
}: {
  assistant: Assistant;
  onClose: () => void;
  canTest: boolean;
}) {
  const docs = useKnowledgeStore((s) => s.documents);
  const tools = useToolStore((s) => s.tools);
  const attachedDocs = docs.filter((d) => assistant.knowledgeSourceIds.includes(d.id));
  const attachedTools = tools.filter((t) => assistant.toolIds.includes(t.id));

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={assistant.name}
      description={`${assistant.type} · ${assistant.model} · ${assistant.status}`}
      onSubmit={() => {}}
      submitLabel="Close"
      size="xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {([
            ["Conversations", assistant.conversations.toLocaleString()],
            ["Accuracy", `${assistant.accuracy}%`],
            ["Temperature", assistant.temperature.toFixed(1)],
            ["Memory", assistant.memoryEnabled ? `${assistant.memoryRetentionDays}d` : "Off"],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border bg-glass px-2 py-2">
              <p className="num text-[13px] font-semibold">{value}</p>
              <p className="truncate text-[10px] text-subtle">{label}</p>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-1 text-[12px] font-semibold text-muted-foreground">System Prompt</p>
          <div className="whitespace-pre-wrap rounded-lg border border-border bg-glass p-3 font-mono text-[12px]">
            {assistant.systemPrompt}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[12px] font-semibold text-muted-foreground">Description</p>
          <p className="text-[13px]">{assistant.description}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted-foreground">
              Knowledge Sources ({attachedDocs.length})
            </p>
            {attachedDocs.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">None attached</p>
            ) : (
              <ul className="space-y-1">
                {attachedDocs.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-glass px-2 py-1.5 text-[12px]"
                  >
                    <FileText className="size-3.5 shrink-0 text-brand" />
                    <span className="truncate">{d.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted-foreground">
              Tools ({attachedTools.length})
            </p>
            {attachedTools.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">None attached</p>
            ) : (
              <ul className="space-y-1">
                {attachedTools.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-glass px-2 py-1.5 text-[12px]"
                  >
                    <Wrench className="size-3.5 shrink-0 text-brand" />
                    <span className="truncate font-mono">{t.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[12px] font-semibold text-muted-foreground">Allowed Channels</p>
          <div className="flex flex-wrap gap-1.5">
            {assistant.allowedChannels.length === 0 ? (
              <span className="text-[12px] text-muted-foreground">None</span>
            ) : (
              assistant.allowedChannels.map((c) => (
                <Pill key={c} tone="brand">{c}</Pill>
              ))
            )}
          </div>
        </div>

        <Separator />

        <AssistantTestPanel assistant={assistant} canTest={canTest} />
      </div>
    </FormDialog>
  );
}

function AssistantTestPanel({ assistant, canTest }: { assistant: Assistant; canTest: boolean }) {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!input.trim()) {
      toast.error("Empty input", { description: "Type a message to test the assistant." });
      return;
    }
    if (!canTest) {
      toast.error("Permission denied", { description: "You cannot test assistants." });
      return;
    }
    setLoading(true);
    setResponse(null);
    await new Promise((r) => setTimeout(r, 800));
    const reply =
      `Based on the configured prompt and knowledge sources, here is a simulated response to: "${input.trim()}". ` +
      `Assistant ${assistant.name} (${assistant.type}, model ${assistant.model}, temp ${assistant.temperature.toFixed(1)}) ` +
      `would respond using ${assistant.knowledgeSourceIds.length} knowledge source(s) and ${assistant.toolIds.length} tool(s).`;
    setResponse(reply);
    setLoading(false);
    toast.success("Test complete", { description: "Simulated response generated." });
  };

  return (
    <div className="rounded-xl border border-border bg-glass p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-brand" />
        <p className="text-[13px] font-semibold">Test Assistant</p>
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !loading) run();
          }}
          placeholder="Type a test message..."
          disabled={loading}
          className="h-9 border-border bg-glass-strong"
        />
        <GateButton
          allowed={canTest}
          onClick={run}
          disabled={loading}
          size="sm"
          className="bg-gradient-brand"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Run
        </GateButton>
      </div>
      {response ? (
        <div className="mt-3 rounded-lg border border-brand/25 bg-brand/8 p-3 text-[13px]">{response}</div>
      ) : null}
    </div>
  );
}

// ===== Tab 2: Tools =====
function ToolsTab() {
  const tools = useToolStore((s) => s.tools);
  const create = useToolStore((s) => s.create);
  const update = useToolStore((s) => s.update);
  const remove = useToolStore((s) => s.remove);
  const toggleEnabled = useToolStore((s) => s.toggleEnabled);
  const { can } = usePermissions();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Tool | null>(null);
  const [testTarget, setTestTarget] = useState<Tool | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tool | null>(null);

  const kpis = useMemo(() => {
    const total = tools.length;
    const enabled = tools.filter((t) => t.enabled).length;
    const calls = tools.reduce((s, t) => s + t.calls, 0);
    const avgRate = total > 0 ? Math.round(tools.reduce((s, t) => s + t.successRate, 0) / total) : 0;
    return [
      kpi("Total Tools", total, "bot", "brand", `${enabled} on`),
      kpi("Enabled", enabled, "phone", "success", "live"),
      kpi("Total Calls", calls, "chat", "info", "+8%"),
      kpi("Avg Success Rate", avgRate, "query", "violet", "%"),
    ];
  }, [tools]);

  const canCreate = can("tool", "create");
  const canEdit = can("tool", "edit");
  const canDelete = can("tool", "delete");
  const canTest = can("tool", "test");

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} kpi={k} delay={i * 0.05} />
        ))}
      </section>

      <div className="flex justify-end">
        <GateButton
          allowed={canCreate}
          onClick={() => setCreateOpen(true)}
          className="bg-gradient-brand"
          size="sm"
        >
          <Plus className="size-4" /> Add Tool
        </GateButton>
      </div>

      {tools.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title="No tools configured"
          description="Add your first tool so assistants can call functions, APIs, or workflows."
          action={canCreate ? { label: "Add Tool", onClick: () => setCreateOpen(true) } : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tools.map((t, i) => (
            <GlassCard key={t.id} delay={i * 0.03} className="p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-glass-strong text-brand">
                  <Wrench className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-mono text-[13px] font-semibold">{t.name}</p>
                    <Pill tone={TOOL_TONE[t.category]}>{t.category}</Pill>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-subtle">{t.description}</p>
                </div>
                <Switch
                  checked={t.enabled}
                  onCheckedChange={() => {
                    if (!canEdit) {
                      toast.error("Permission denied", { description: "You cannot toggle tools." });
                      return;
                    }
                    toggleEnabled(t.id);
                    toast.success(t.enabled ? "Tool disabled" : "Tool enabled", { description: t.name });
                  }}
                />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-border bg-glass px-2 py-2">
                  <p className="num truncate text-[13px] font-semibold">{t.calls.toLocaleString()}</p>
                  <p className="truncate text-[10px] text-subtle">Calls</p>
                </div>
                <div className="rounded-lg border border-border bg-glass px-2 py-2">
                  <p className="num truncate text-[13px] font-semibold">{t.successRate}%</p>
                  <p className="truncate text-[10px] text-subtle">Success</p>
                </div>
                <div className="rounded-lg border border-border bg-glass px-2 py-2">
                  <p className="num truncate text-[13px] font-semibold">{t.avgLatencyMs}ms</p>
                  <p className="truncate text-[10px] text-subtle">Latency</p>
                </div>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Success rate</span>
                  <span className="num">{t.successRate}%</span>
                </div>
                <Meter
                  value={t.successRate}
                  tone={t.successRate >= 98 ? "success" : t.successRate >= 90 ? "brand" : "warning"}
                  className="mt-1"
                />
              </div>

              <div className="mt-4 flex gap-2">
                <GateButton
                  allowed={canEdit}
                  onClick={() => setEditTarget(t)}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-border bg-glass"
                >
                  <Settings className="size-3.5" /> Edit
                </GateButton>
                <GateButton
                  allowed={canTest}
                  onClick={() => setTestTarget(t)}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-border bg-glass"
                >
                  <FlaskConical className="size-3.5" /> Test
                </GateButton>
                <GateButton
                  allowed={canDelete}
                  onClick={() => setDeleteTarget(t)}
                  variant="outline"
                  size="sm"
                  className="border-border bg-glass hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </GateButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {createOpen ? (
        <ToolFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode="create"
          onSubmit={(data) => {
            const t = create(data);
            toast.success("Tool created", { description: `${t.name} added.` });
          }}
        />
      ) : null}

      {editTarget ? (
        <ToolFormDialog
          key={editTarget.id}
          open
          onOpenChange={(o) => !o && setEditTarget(null)}
          mode="edit"
          initial={editTarget}
          onSubmit={(data) => {
            update(editTarget.id, data);
            toast.success("Tool updated", { description: editTarget.name });
          }}
        />
      ) : null}

      {testTarget ? (
        <ToolTestDialog tool={testTarget} onClose={() => setTestTarget(null)} />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete tool?"
        description={`This will permanently remove "${deleteTarget?.name}" and detach it from all assistants.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          remove(deleteTarget.id);
          toast.success("Tool deleted", { description: deleteTarget.name });
        }}
      />
    </>
  );
}

function ToolFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "create" | "edit";
  initial?: Tool;
  onSubmit: (data: Omit<Tool, "id" | "calls" | "successRate" | "avgLatencyMs" | "createdBy" | "createdAt" | "updatedAt">) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<ToolCategory>(initial?.category ?? "knowledge");
  const [executionType, setExecutionType] = useState<ToolExecutionType>(initial?.executionType ?? "function");
  const [schema, setSchema] = useState(
    initial?.schema ?? JSON.stringify({ type: "object", properties: {}, required: [] }, null, 2),
  );
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? "");
  const [enabled, setEnabled] = useState<boolean>(initial?.enabled ?? true);

  const handleSubmit = () => {
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      throw new Error("Tool name must be snake_case (lowercase letters, digits, underscores, starting with a letter).");
    }
    if (!description.trim()) throw new Error("Description is required");
    try {
      JSON.parse(schema);
    } catch {
      throw new Error("Schema must be valid JSON.");
    }
    if (executionType === "api" && !endpoint.trim()) {
      throw new Error("Endpoint is required for API tools.");
    }
    onSubmit({
      name,
      description: description.trim(),
      category,
      executionType,
      schema,
      endpoint: executionType === "api" ? endpoint.trim() : undefined,
      enabled,
      assistantIds: initial?.assistantIds ?? [],
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Add Tool" : `Edit ${initial?.name}`}
      description="Tools are callable functions exposed to assistants. Use snake_case for the name."
      onSubmit={handleSubmit}
      submitLabel={mode === "create" ? "Create" : "Save"}
      size="lg"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" required hint="snake_case, e.g. search_products">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="search_products"
            className="h-10 border-border bg-glass font-mono text-[12px]"
          />
        </Field>
        <Field label="Category" required>
          <Select value={category} onValueChange={(v) => setCategory(v as ToolCategory)}>
            <SelectTrigger className="h-10 w-full border-border bg-glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOOL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Description" required>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this tool do?"
          className="min-h-[60px] border-border bg-glass"
        />
      </Field>
      <Field label="Execution Type" required>
        <Select value={executionType} onValueChange={(v) => setExecutionType(v as ToolExecutionType)}>
          <SelectTrigger className="h-10 w-full border-border bg-glass">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXECUTION_TYPES.map((e) => (
              <SelectItem key={e} value={e}>{e}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {executionType === "api" ? (
        <Field label="Endpoint" required hint="The HTTP endpoint to call.">
          <Input
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.example.com/v1/search"
            className="h-10 border-border bg-glass font-mono text-[12px]"
          />
        </Field>
      ) : null}
      <Field label="Schema" required hint="JSON schema for the tool parameters.">
        <Textarea
          value={schema}
          onChange={(e) => setSchema(e.target.value)}
          className="min-h-[120px] border-border bg-glass font-mono text-[12px]"
        />
      </Field>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-glass px-3 py-3">
        <Switch checked={enabled} onCheckedChange={setEnabled} />
        <span className="text-[13px] font-medium">Enabled</span>
      </div>
    </FormDialog>
  );
}

function ToolTestDialog({ tool, onClose }: { tool: Tool; onClose: () => void }) {
  const recordCall = useToolStore((s) => s.recordCall);
  const [params, setParams] = useState(() => {
    try {
      const parsed = JSON.parse(tool.schema);
      const sample: Record<string, unknown> = {};
      if (parsed?.properties) {
        for (const [k, v] of Object.entries(parsed.properties as Record<string, { type?: string; default?: unknown }>)) {
          if (v.default !== undefined) sample[k] = v.default;
          else if (v.type === "string") sample[k] = "test";
          else if (v.type === "integer") sample[k] = 1;
          else sample[k] = null;
        }
      }
      return JSON.stringify(sample, null, 2);
    } catch {
      return "{}";
    }
  });
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(params);
    } catch {
      toast.error("Invalid JSON", { description: "Fix the params and try again." });
      return;
    }
    setLoading(true);
    setOutput(null);
    await new Promise((r) => setTimeout(r, 800));
    const success = Math.random() > 0.05;
    recordCall(tool.id, success);
    const latencyMs = 180 + Math.floor(Math.random() * 400);
    const result = {
      tool: tool.name,
      params: parsed,
      success,
      latencyMs,
      result: success
        ? `Mock result: called ${tool.name} with the provided parameters. Returned ${Math.floor(Math.random() * 8) + 1} record(s).`
        : `Error: tool execution failed (simulated).`,
      timestamp: new Date().toISOString(),
    };
    setOutput(JSON.stringify(result, null, 2));
    setLoading(false);
    toast.success(success ? "Tool executed" : "Tool failed", {
      description: `${tool.name} · ${latencyMs}ms`,
    });
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Test: ${tool.name}`}
      description="Provide JSON parameters and run the tool in the sandbox."
      onSubmit={() => {}}
      submitLabel="Close"
      size="lg"
    >
      <div className="space-y-3">
        <Field label="Parameters (JSON)">
          <Textarea
            value={params}
            onChange={(e) => setParams(e.target.value)}
            className="min-h-[120px] border-border bg-glass font-mono text-[12px]"
          />
        </Field>
        <Button onClick={run} disabled={loading} className="w-full bg-gradient-brand">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
          {loading ? "Running…" : "Run Tool"}
        </Button>
        {output ? (
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted-foreground">Output</p>
            <pre className="max-h-60 overflow-auto rounded-lg border border-border bg-glass p-3 font-mono text-[11px]">
              {output}
            </pre>
          </div>
        ) : null}
      </div>
    </FormDialog>
  );
}

// ===== Tab 3: Memory =====
function MemoryTab() {
  const memories = useMemoryStore((s) => s.memories);
  const create = useMemoryStore((s) => s.create);
  const update = useMemoryStore((s) => s.update);
  const remove = useMemoryStore((s) => s.remove);
  const assistants = useAssistantStore((s) => s.assistants);
  const { can } = usePermissions();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MemoryRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MemoryRecord | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const kpis = useMemo(() => {
    const total = memories.length;
    const byType = (t: MemoryType) => memories.filter((m) => m.type === t).length;
    const avgImp =
      total > 0 ? Math.round((memories.reduce((s, m) => s + m.importance, 0) / total) * 10) / 10 : 0;
    return [
      kpi("Total Memories", total, "docs", "brand", "all scopes"),
      kpi("FACT", byType("FACT"), "chunks", "info", "facts"),
      kpi("PREFERENCE", byType("PREFERENCE"), "bot", "brand", "prefs"),
      kpi("HISTORY", byType("HISTORY"), "latency", "violet", "history"),
      kpi("CONTEXT", byType("CONTEXT"), "query", "teal", "context"),
      kpi("Avg Importance", avgImp, "query", "success", "/ 10"),
    ];
  }, [memories]);

  const canCreate = can("memory", "create");
  const canEdit = can("memory", "edit");
  const canDelete = can("memory", "delete");
  const canTest = can("memory", "test");

  const assistantItems = useMemo(
    () => assistants.map((a) => ({ value: a.id, label: a.name, hint: a.type })),
    [assistants],
  );

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} kpi={k} delay={i * 0.04} />
        ))}
      </section>

      <div className="flex justify-end gap-2">
        <GateButton
          allowed={canTest}
          onClick={() => setSearchOpen(true)}
          variant="outline"
          size="sm"
          className="border-border bg-glass"
        >
          <Search className="size-4" /> Test Retrieval
        </GateButton>
        <GateButton
          allowed={canCreate}
          onClick={() => setCreateOpen(true)}
          className="bg-gradient-brand"
          size="sm"
        >
          <Plus className="size-4" /> Add Memory
        </GateButton>
      </div>

      {memories.length === 0 ? (
        <EmptyState
          icon={MemoryStick}
          title="No memories stored"
          description="Add the first memory record — facts, preferences, history or context — to ground your assistants."
          action={canCreate ? { label: "Add Memory", onClick: () => setCreateOpen(true) } : undefined}
        />
      ) : (
        <GlassCard tilt={false} className="p-5">
          <CardHead
            title="Memory Records"
            subtitle={`${memories.length} entries across all scopes`}
            icon={<MemoryStick className="size-4" />}
          />
          <DataTable head={["Key", "Type", "Scope", "Value", "Importance", "Updated", ""]}>
            {memories.map((m) => (
              <Row key={m.id}>
                <Cell className="font-mono text-[12px]">{m.key}</Cell>
                <Cell>
                  <Pill tone={MEMORY_TONE[m.type]}>{m.type}</Pill>
                </Cell>
                <Cell className="text-subtle">{m.scope}</Cell>
                <Cell className="max-w-[280px] truncate text-[12px]">{m.value}</Cell>
                <Cell>
                  <div className="flex w-24 items-center gap-2">
                    <span className="num text-[12px] font-semibold">{m.importance}</span>
                    <Meter
                      value={m.importance * 10}
                      tone={m.importance >= 8 ? "success" : m.importance >= 5 ? "brand" : "muted"}
                      className="flex-1"
                    />
                  </div>
                </Cell>
                <Cell className="text-[11px] text-muted-foreground">{relativeTime(m.updatedAt)}</Cell>
                <Cell>
                  <div className="flex items-center gap-1">
                    {canEdit ? (
                      <button
                        onClick={() => setEditTarget(m)}
                        aria-label="Edit"
                        className="grid size-8 place-items-center rounded-lg border border-border bg-glass text-subtle transition-colors hover:text-brand"
                      >
                        <Settings className="size-3.5" />
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        onClick={() => setDeleteTarget(m)}
                        aria-label="Delete"
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

      {createOpen ? (
        <MemoryFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode="create"
          assistantItems={assistantItems}
          onSubmit={(data) => {
            const m = create(data);
            toast.success("Memory added", { description: `${m.key} stored.` });
          }}
        />
      ) : null}

      {editTarget ? (
        <MemoryFormDialog
          key={editTarget.id}
          open
          onOpenChange={(o) => !o && setEditTarget(null)}
          mode="edit"
          initial={editTarget}
          assistantItems={assistantItems}
          onSubmit={(data) => {
            update(editTarget.id, data);
            toast.success("Memory updated", { description: editTarget.key });
          }}
        />
      ) : null}

      {searchOpen ? <MemorySearchDialog onClose={() => setSearchOpen(false)} /> : null}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete memory?"
        description={`This will permanently remove "${deleteTarget?.key}".`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          remove(deleteTarget.id);
          toast.success("Memory deleted", { description: deleteTarget.key });
        }}
      />
    </>
  );
}

function MemoryFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  assistantItems,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "create" | "edit";
  initial?: MemoryRecord;
  assistantItems: { value: string; label: string; hint?: string }[];
  onSubmit: (data: Omit<MemoryRecord, "id" | "createdBy" | "createdAt" | "updatedAt">) => void;
}) {
  const [key, setKey] = useState(initial?.key ?? "");
  const [type, setType] = useState<MemoryType>(initial?.type ?? "FACT");
  const [scope, setScope] = useState<MemoryScope>(initial?.scope ?? "customer");
  const [value, setValue] = useState(initial?.value ?? "");
  const [importance, setImportance] = useState<number>(initial?.importance ?? 5);
  const [agentId, setAgentId] = useState<string>(initial?.agentId ?? "none");
  const [expiresAt, setExpiresAt] = useState(
    initial?.expiresAt ? initial.expiresAt.slice(0, 10) : "",
  );

  const handleSubmit = () => {
    if (!key.trim()) throw new Error("Key is required");
    if (!/^[a-z]+:[a-z0-9_]+$/.test(key)) {
      throw new Error("Key must be in the format namespace:name (e.g. pref:language)");
    }
    if (!value.trim()) throw new Error("Value is required");
    if (importance < 1 || importance > 10) throw new Error("Importance must be 1-10");
    onSubmit({
      key: key.trim(),
      type,
      scope,
      value: value.trim(),
      importance,
      agentId: agentId === "none" ? null : agentId,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Add Memory" : `Edit ${initial?.key}`}
      description="Store a fact, preference, conversation history or context for an assistant."
      onSubmit={handleSubmit}
      submitLabel={mode === "create" ? "Create" : "Save"}
      size="md"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Key" required hint="namespace:name, e.g. pref:language">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="pref:language"
            className="h-10 border-border bg-glass font-mono text-[12px]"
          />
        </Field>
        <Field label="Type" required>
          <Select value={type} onValueChange={(v) => setType(v as MemoryType)}>
            <SelectTrigger className="h-10 w-full border-border bg-glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMORY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Scope" required>
          <Select value={scope} onValueChange={(v) => setScope(v as MemoryScope)}>
            <SelectTrigger className="h-10 w-full border-border bg-glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMORY_SCOPES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Linked Assistant" hint="Optional">
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="h-10 w-full border-border bg-glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None (global)</SelectItem>
              {assistantItems.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Value" required>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="The memory content..."
          className="min-h-[80px] border-border bg-glass"
        />
      </Field>
      <Field label={`Importance — ${importance}/10`} hint="Higher importance = higher retrieval priority.">
        <Slider
          value={[importance]}
          onValueChange={(v) => setImportance(v[0])}
          min={1}
          max={10}
          step={1}
          className="mt-2"
        />
      </Field>
      <Field label="Expires At" hint="Optional. Leave blank for no expiry.">
        <Input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="h-10 border-border bg-glass"
        />
      </Field>
    </FormDialog>
  );
}

function MemorySearchDialog({ onClose }: { onClose: () => void }) {
  const search = useMemoryStore((s) => s.search);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemoryRecord[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setResults(null);
    await new Promise((r) => setTimeout(r, 400));
    const r = search(query);
    setResults(r);
    setLoading(false);
    toast.success("Search complete", { description: `${r.length} memory record(s) matched.` });
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Test Memory Retrieval"
      description="Search the memory store by key or value. Sorted by importance."
      onSubmit={() => {}}
      submitLabel="Close"
      size="lg"
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) run();
            }}
            placeholder="e.g. language, distributor, order..."
            disabled={loading}
            className="h-10 border-border bg-glass"
          />
          <Button onClick={run} disabled={loading} className="bg-gradient-brand" size="sm">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Search
          </Button>
        </div>
        {results ? (
          results.length === 0 ? (
            <p className="rounded-lg border border-border bg-glass px-3 py-6 text-center text-[13px] text-muted-foreground">
              No memories matched.
            </p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {results.map((m) => (
                <div key={m.id} className="rounded-lg border border-border bg-glass px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold">{m.key}</span>
                    <Pill tone={MEMORY_TONE[m.type]}>{m.type}</Pill>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      importance {m.importance}/10
                    </span>
                  </div>
                  <p className="mt-1 text-[12px]">{m.value}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    scope: {m.scope} · updated {relativeTime(m.updatedAt)}
                  </p>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>
    </FormDialog>
  );
}

// ===== Tab 4: Prompts =====
function PromptsTab() {
  const prompts = usePromptStore((s) => s.prompts);
  const create = usePromptStore((s) => s.create);
  const update = usePromptStore((s) => s.update);
  const remove = usePromptStore((s) => s.remove);
  const { can } = usePermissions();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Prompt | null>(null);
  const [testTarget, setTestTarget] = useState<Prompt | null>(null);
  const [versionsTarget, setVersionsTarget] = useState<Prompt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Prompt | null>(null);

  const kpis = useMemo(() => {
    const total = prompts.length;
    const active = prompts.filter((p) => p.status === "active").length;
    const drafts = prompts.filter((p) => p.status === "draft").length;
    const versions = prompts.reduce((s, p) => s + p.versions.length, 0);
    return [
      kpi("Total Prompts", total, "docs", "brand", "all"),
      kpi("Active", active, "phone", "success", "live"),
      kpi("Drafts", drafts, "latency", "warning", "WIP"),
      kpi("Total Versions", versions, "chunks", "violet", "+3"),
    ];
  }, [prompts]);

  const canCreate = can("prompt", "create");
  const canEdit = can("prompt", "edit");
  const canDelete = can("prompt", "delete");
  const canTest = can("prompt", "test");

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} kpi={k} delay={i * 0.05} />
        ))}
      </section>

      <div className="flex justify-end">
        <GateButton
          allowed={canCreate}
          onClick={() => setCreateOpen(true)}
          className="bg-gradient-brand"
          size="sm"
        >
          <Plus className="size-4" /> Add Prompt
        </GateButton>
      </div>

      {prompts.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No prompts yet"
          description="Create your first prompt to define assistant behavior, RAG rules, and escalation protocols."
          action={canCreate ? { label: "Add Prompt", onClick: () => setCreateOpen(true) } : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {prompts.map((p, i) => (
            <GlassCard key={p.id} delay={i * 0.03} className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">{p.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12px] text-subtle">{p.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Pill tone={PROMPT_TONE[p.category]}>{p.category}</Pill>
                  <StatusBadge status={p.status} />
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-border bg-glass p-3">
                <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Content preview</span>
                  <span>v{p.activeVersion} · {p.tokens} tokens</span>
                </div>
                <p className="line-clamp-3 font-mono text-[11px] text-subtle">{p.content}</p>
              </div>

              <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                <History className="size-3.5" />
                <span>{p.versions.length} version(s)</span>
                <span>·</span>
                <span>updated {relativeTime(p.updatedAt)}</span>
              </div>

              <div className="mt-4 flex gap-2">
                <GateButton
                  allowed={canEdit}
                  onClick={() => setEditTarget(p)}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-border bg-glass"
                >
                  <Settings className="size-3.5" /> Edit
                </GateButton>
                <GateButton
                  allowed={canTest}
                  onClick={() => setTestTarget(p)}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-border bg-glass"
                >
                  <FlaskConical className="size-3.5" /> Test
                </GateButton>
                <GateButton
                  allowed={canEdit}
                  onClick={() => setVersionsTarget(p)}
                  variant="outline"
                  size="sm"
                  className="flex-1 border-border bg-glass"
                >
                  <GitBranch className="size-3.5" /> Versions
                </GateButton>
                <GateButton
                  allowed={canDelete}
                  onClick={() => setDeleteTarget(p)}
                  variant="outline"
                  size="sm"
                  className="border-border bg-glass hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </GateButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {createOpen ? (
        <PromptFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode="create"
          onSubmit={(data) => {
            const p = create({
              name: data.name,
              description: data.description,
              category: data.category,
              content: data.content,
              status: data.status,
              assistantIds: data.assistantIds,
            });
            toast.success("Prompt created", { description: `${p.name} saved as v1.` });
          }}
        />
      ) : null}

      {editTarget ? (
        <PromptFormDialog
          key={editTarget.id}
          open
          onOpenChange={(o) => !o && setEditTarget(null)}
          mode="edit"
          initial={editTarget}
          onSubmit={(data) => {
            update(editTarget.id, data.content, data.changeNote);
            toast.success("New version saved", {
              description: `${editTarget.name} now has a new active version.`,
            });
          }}
        />
      ) : null}

      {testTarget ? (
        <PromptTestDialog prompt={testTarget} onClose={() => setTestTarget(null)} />
      ) : null}

      {versionsTarget ? (
        <PromptVersionsDialog prompt={versionsTarget} onClose={() => setVersionsTarget(null)} />
      ) : null}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete prompt?"
        description={`This will permanently remove "${deleteTarget?.name}" and all its ${deleteTarget?.versions.length ?? 0} version(s).`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          remove(deleteTarget.id);
          toast.success("Prompt deleted", { description: deleteTarget.name });
        }}
      />
    </>
  );
}

interface PromptFormData {
  name: string;
  description: string;
  category: Prompt["category"];
  content: string;
  status: Prompt["status"];
  assistantIds: string[];
  changeNote?: string;
}

function PromptFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode: "create" | "edit";
  initial?: Prompt;
  onSubmit: (data: PromptFormData) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState<Prompt["category"]>(initial?.category ?? "system");
  const [content, setContent] = useState(initial?.content ?? "");
  const [status, setStatus] = useState<Prompt["status"]>(initial?.status ?? "active");
  const [changeNote, setChangeNote] = useState("");

  const tokens = estimateTokens(content);

  const handleSubmit = () => {
    if (!name.trim()) throw new Error("Name is required");
    if (!content.trim()) throw new Error("Content is required");
    if (mode === "edit" && !changeNote.trim()) {
      throw new Error("Change note is required when editing a prompt");
    }
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      category,
      content: content.trim(),
      status,
      assistantIds: initial?.assistantIds ?? [],
      changeNote: mode === "edit" ? changeNote.trim() : undefined,
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Add Prompt" : `Edit ${initial?.name}`}
      description={
        mode === "edit"
          ? "Saving creates a new version. The previous version is preserved in history."
          : "Define a reusable prompt template."
      }
      onSubmit={handleSubmit}
      submitLabel={mode === "create" ? "Create" : "Save New Version"}
      size="lg"
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Master System Prompt"
            className="h-10 border-border bg-glass"
          />
        </Field>
        <Field label="Category" required>
          <Select value={category} onValueChange={(v) => setCategory(v as Prompt["category"])}>
            <SelectTrigger className="h-10 w-full border-border bg-glass">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROMPT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Description">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this prompt for?"
          className="h-10 border-border bg-glass"
        />
      </Field>
      <Field label="Content" required hint={`Auto-estimated token count: ${tokens}`}>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="You are a Dayjoy AI assistant..."
          className="min-h-[180px] border-border bg-glass font-mono text-[12px]"
        />
      </Field>
      <Field label="Status" required>
        <Select value={status} onValueChange={(v) => setStatus(v as Prompt["status"])}>
          <SelectTrigger className="h-10 w-full border-border bg-glass">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {mode === "edit" ? (
        <Field label="Change Note" required hint="Describe what changed in this version.">
          <Input
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder="e.g. Tightened escalation rules"
            className="h-10 border-border bg-glass"
          />
        </Field>
      ) : null}
    </FormDialog>
  );
}

function PromptTestDialog({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const test = usePromptStore((s) => s.test);
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!input.trim()) {
      toast.error("Empty input", { description: "Type a test message." });
      return;
    }
    setLoading(true);
    setOutput(null);
    await new Promise((r) => setTimeout(r, 800));
    const res = test(prompt.id, input);
    setOutput(res);
    setLoading(false);
    toast.success("Test complete", { description: `Response generated for ${prompt.name}.` });
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Test: ${prompt.name}`}
      description={`v${prompt.activeVersion} · ${prompt.tokens} tokens · ${prompt.category}`}
      onSubmit={() => {}}
      submitLabel="Close"
      size="lg"
    >
      <div className="space-y-3">
        <Field label="Test Input">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a sample user message..."
            className="min-h-[80px] border-border bg-glass"
          />
        </Field>
        <Button onClick={run} disabled={loading} className="w-full bg-gradient-brand">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <FlaskConical className="size-4" />}
          {loading ? "Running…" : "Run Test"}
        </Button>
        {output ? (
          <div>
            <p className="mb-1 text-[12px] font-semibold text-muted-foreground">Response</p>
            <div className="rounded-lg border border-brand/25 bg-brand/8 p-3 text-[13px]">{output}</div>
          </div>
        ) : null}
      </div>
    </FormDialog>
  );
}

function PromptVersionsDialog({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const activate = usePromptStore((s) => s.activate);
  const current = usePromptStore((s) => s.prompts.find((p) => p.id === prompt.id)) ?? prompt;
  const versions = [...current.versions].sort((a, b) => b.version - a.version);

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Versions: ${prompt.name}`}
      description={`${versions.length} version(s). Active: v${current.activeVersion}.`}
      onSubmit={() => {}}
      submitLabel="Close"
      size="lg"
    >
      <div className="space-y-2">
        {versions.map((v) => {
          const isActive = v.version === current.activeVersion;
          return (
            <div
              key={v.version}
              className={cn(
                "rounded-lg border px-3 py-2.5",
                isActive ? "border-brand/40 bg-brand/8" : "border-border bg-glass",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-semibold">v{v.version}</span>
                {isActive ? <Pill tone="success" dot>Active</Pill> : null}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {relativeTime(v.changedAt)}
                </span>
              </div>
              {v.changeNote ? <p className="mt-1 text-[12px] text-subtle">{v.changeNote}</p> : null}
              <p className="mt-1 line-clamp-2 font-mono text-[11px] text-muted-foreground">{v.content}</p>
              {!isActive ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 border-border bg-glass"
                  onClick={() => {
                    activate(prompt.id, v.version);
                    toast.success("Version activated", {
                      description: `${prompt.name} now uses v${v.version}.`,
                    });
                  }}
                >
                  Activate v{v.version}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </FormDialog>
  );
}
