"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  PhoneOff,
  Play,
  Plus,
  Phone,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { useVoiceSessionStore } from "@/store/voice-session-store";
import { useAssistantStore } from "@/store/assistant-store";
import { useProviderConfigStore } from "@/store/provider-config-store";
import { usePermissions } from "@/hooks/use-permissions";

import { CardHead, GlassCard } from "@/components/kit/glass-card";
import { Cell, DataTable, PageHeader, Pill, Row } from "@/components/kit/page-header";
import { KpiCard } from "@/components/kit/kpi-card";
import { StatusBadge } from "@/components/kit/status-badge";
import { FormDialog } from "@/components/kit/form-dialog";
import { Field } from "@/components/kit/field";
import { ProviderConfigRequired } from "@/components/kit/provider-config-required";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { VoiceCall } from "@/types/domain";
import type { Kpi } from "@/data/mock";

/** Format a number of seconds as mm:ss (or h:mm:ss for >1h). */
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Format an ISO timestamp into a short locale string. */
function formatStartedAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function VoiceView({ onViewChange }: { onViewChange?: (v: string) => void }) {
  const vapiConfig = useProviderConfigStore((s) => s.getByProvider("vapi"));
  const activeCall = useVoiceSessionStore((s) => s.activeCall);
  const callHistory = useVoiceSessionStore((s) => s.callHistory);
  const startCall = useVoiceSessionStore((s) => s.startCall);
  const tick = useVoiceSessionStore((s) => s.tick);
  const endCall = useVoiceSessionStore((s) => s.endCall);
  const assistants = useAssistantStore((s) => s.assistants);
  const { can } = usePermissions();

  const [newCallOpen, setNewCallOpen] = useState(false);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // ===== Assistant dropdown options: voice-capable assistants only =====
  const voiceAssistants = useMemo(() => {
    return assistants.filter(
      (a) =>
        a.type === "VOICE" ||
        (Array.isArray(a.allowedChannels) && a.allowedChannels.includes("voice")),
    );
  }, [assistants]);

  // ===== Derive KPI values from store state =====
  const kpis = useMemo<Kpi[]>(() => {
    const totalCalls = callHistory.length + (activeCall ? 1 : 0);
    const completedDurations = callHistory
      .filter((c) => typeof c.durationSeconds === "number")
      .map((c) => c.durationSeconds);
    const sumDuration = completedDurations.reduce((sum, d) => sum + d, 0);
    const avgSeconds =
      completedDurations.length > 0 ? sumDuration / completedDurations.length : 0;
    const avgMinutes = avgSeconds / 60;

    const transferredCount = callHistory.filter(
      (c) =>
        c.outcome &&
        /transfer/i.test(c.outcome),
    ).length;
    const transferRate = totalCalls > 0 ? Math.round((transferredCount / totalCalls) * 100) : 0;

    return [
      {
        label: "Active Calls",
        value: activeCall ? 1 : 0,
        change: activeCall ? "live" : "idle",
        trend: "up" as const,
        icon: "phone" as const,
        tone: "success" as const,
        live: !!activeCall,
        spark: [0, 1, 0, 2, 1, 1, activeCall ? 1 : 0],
      },
      {
        label: "Calls Today",
        value: totalCalls,
        change: `+${Math.min(totalCalls, 6)}`,
        trend: "up" as const,
        icon: "phone" as const,
        tone: "info" as const,
        spark: [12, 18, 22, 28, 31, 36, totalCalls],
      },
      {
        label: "Avg Duration",
        value: Number(avgMinutes.toFixed(1)),
        suffix: "m",
        decimals: 1,
        change: "+0.2m",
        trend: "up" as const,
        icon: "latency" as const,
        tone: "brand" as const,
        spark: [2.4, 2.6, 2.9, 3.0, 3.1, 3.2, Math.max(0, Number(avgMinutes.toFixed(1)))],
      },
      {
        label: "Transfer Rate",
        value: transferRate,
        suffix: "%",
        change: "-1.4%",
        trend: "down" as const,
        icon: "bot" as const,
        tone: "violet" as const,
        spark: [13, 12, 11, 10, 9.4, 8.6, transferRate],
      },
    ];
  }, [callHistory, activeCall]);

  // ===== Tick interval: advances call state connecting→connected→active =====
  // Started when a call exists in a non-terminal, non-active state. Cleared on
  // unmount or when the call reaches "active" (terminal-ish for our purposes).
  useEffect(() => {
    if (!activeCall) return;
    if (activeCall.state === "active" || activeCall.state === "ended" || activeCall.state === "failed") {
      return;
    }
    const interval = setInterval(() => {
      const current = useVoiceSessionStore.getState().activeCall;
      if (!current) return;
      if (current.state === "active") return;
      tick();
    }, 1500);
    return () => clearInterval(interval);
  }, [activeCall?.id, activeCall?.state, tick]);

  // ===== Elapsed-time counter: refresh once per second while a call is live =====
  useEffect(() => {
    if (!activeCall) {
      setNowTick(Date.now());
      return;
    }
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeCall?.id]);

  const elapsedSeconds = useMemo(() => {
    if (!activeCall || !activeCall.startedAt) return 0;
    const started = new Date(activeCall.startedAt).getTime();
    return Math.max(0, Math.round((nowTick - started) / 1000));
  }, [activeCall, nowTick]);

  // ===== Helpers =====
  const handleEndCall = () => {
    if (!can("voice", "execute")) {
      toast.error("Permission denied", {
        description: "You do not have execute permission for the voice channel.",
      });
      return;
    }
    if (!activeCall) return;
    const customerName = activeCall.customerName;
    endCall();
    toast.success("Call ended", {
      description: `Summary for ${customerName} saved to call log.`,
    });
  };

  const handlePlayRecording = (call: VoiceCall) => {
    toast.info(`Playing ${call.customerName}'s recording`, {
      description: "Streaming from secure cloud storage…",
    });
  };

  // ===== Early-return: provider not configured =====
  if (!vapiConfig?.configured) {
    return (
      <ProviderConfigRequired
        title="Voice AI"
        subtitle="Real-time telephony powered by the Sarah voice agent."
        providerName="Vapi"
        requiredFields={
          vapiConfig?.requiredFields ?? ["apiKey", "assistantId", "phoneNumberId"]
        }
        onConfigure={() => {
          if (onViewChange) {
            onViewChange("providers");
          }
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Voice AI"
        subtitle="Real-time telephony powered by the Sarah voice agent."
        actions={
          <Button
            size="sm"
            className="bg-gradient-brand"
            onClick={() => {
              if (!can("voice", "execute")) {
                toast.error("Permission denied", {
                  description: "You do not have execute permission for the voice channel.",
                });
                return;
              }
              if (activeCall) {
                toast.warning("A call is already active", {
                  description: "End the current call before starting a new one.",
                });
                return;
              }
              setNewCallOpen(true);
            }}
          >
            <Plus className="mr-1.5 size-4" />
            New Call
          </Button>
        }
      />

      {/* KPI row */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <KpiCard key={k.label} kpi={k} delay={i * 0.05} />
        ))}
      </section>

      {/* Active call banner OR empty state */}
      {activeCall ? (
        <GlassCard
          delay={0.15}
          className="border-success/30 bg-success/[0.07] p-5"
          tilt={false}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <span className="live-dot size-2.5 shrink-0 rounded-full bg-success text-success/40" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-semibold text-success">
                    Active Call
                  </p>
                  <StatusBadge status={activeCall.state} />
                </div>
                <p className="mt-0.5 truncate text-[15px] font-semibold">
                  {activeCall.customerName} ·{" "}
                  <span className="num text-subtle">{activeCall.customerPhone}</span>
                </p>
                <p className="num truncate text-xs text-subtle">
                  Assistant {activeCall.assistantId ?? "—"} ·{" "}
                  {formatDuration(elapsedSeconds)} elapsed
                </p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEndCall}
              disabled={!can("voice", "execute")}
              className="shrink-0"
            >
              <PhoneOff className="mr-1.5 size-4" />
              End Call
            </Button>
          </div>
        </GlassCard>
      ) : (
        <GlassCard delay={0.15} className="border-border bg-glass p-5" tilt={false}>
          <div className="flex items-center gap-3 text-[13px] text-subtle">
            <span className="size-2.5 rounded-full bg-muted-foreground/40" />
            No active calls. Click “New Call” to start an outbound dialer session.
          </div>
        </GlassCard>
      )}

      {/* Recent calls table */}
      <GlassCard delay={0.2} tilt={false} className="p-5">
        <CardHead
          title="Recent Calls"
          subtitle={`${callHistory.length} call${callHistory.length === 1 ? "" : "s"} on record`}
          action={
            <Pill tone="info" dot>
              Last 24h
            </Pill>
          }
        />
        {callHistory.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-10 text-center">
            <Phone className="size-6 text-muted-foreground" />
            <p className="text-[13px] font-medium">No calls yet</p>
            <p className="text-[12px] text-subtle">
              Outbound and inbound calls will appear here once you start them.
            </p>
          </div>
        ) : (
          <DataTable
            head={["Customer", "Direction", "Duration", "Outcome", "State", "Started", ""]}
          >
            {callHistory.map((c) => {
              const isInbound = c.direction === "inbound";
              return (
                <Row key={c.id}>
                  <Cell className="min-w-0">
                    <span className="block truncate font-medium">{c.customerName}</span>
                    <span className="num block text-xs text-subtle">
                      {c.customerPhone}
                    </span>
                  </Cell>
                  <Cell>
                    {isInbound ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-success">
                        <ArrowDownLeft className="size-3.5" /> Inbound
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-info">
                        <ArrowUpRight className="size-3.5" /> Outbound
                      </span>
                    )}
                  </Cell>
                  <Cell className="num font-mono text-[13px]">
                    {formatDuration(c.durationSeconds)}
                  </Cell>
                  <Cell className="text-subtle">{c.outcome ?? "—"}</Cell>
                  <Cell>
                    <StatusBadge status={c.state} />
                  </Cell>
                  <Cell className="num text-[11px] text-muted-foreground">
                    {formatStartedAt(c.startedAt)}
                  </Cell>
                  <Cell>
                    <button
                      aria-label={`Play recording for ${c.customerName}`}
                      onClick={() => handlePlayRecording(c)}
                      className="grid size-8 place-items-center rounded-lg border border-border bg-glass text-subtle transition-colors hover:text-brand"
                    >
                      <Play className="size-3.5" />
                    </button>
                  </Cell>
                </Row>
              );
            })}
          </DataTable>
        )}
      </GlassCard>

      {/* Quick stats footer */}
      <section className="grid gap-4 lg:grid-cols-3">
        <GlassCard delay={0.25} className="p-4" tilt={false}>
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-brand/12 text-brand">
              <Clock className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] text-muted-foreground">
                Total Talk Time
              </p>
              <p className="num text-[15px] font-semibold">
                {formatDuration(
                  callHistory.reduce((s, c) => s + (c.durationSeconds || 0), 0),
                )}
              </p>
            </div>
          </div>
        </GlassCard>
        <GlassCard delay={0.3} className="p-4" tilt={false}>
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-success/12 text-success">
              <TrendingUp className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] text-muted-foreground">
                Resolution Rate
              </p>
              <p className="num text-[15px] font-semibold">
                {callHistory.length > 0
                  ? `${Math.round(
                      (callHistory.filter((c) => c.outcome && !/transfer|fail|abandon|no response/i.test(c.outcome)).length /
                        callHistory.length) *
                        100,
                    )}%`
                  : "—"}
              </p>
            </div>
          </div>
        </GlassCard>
        <GlassCard delay={0.35} className="p-4" tilt={false}>
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-violet/12 text-violet">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12px] text-muted-foreground">
                Voice Assistants
              </p>
              <p className="num text-[15px] font-semibold">
                {voiceAssistants.length} available
              </p>
            </div>
          </div>
        </GlassCard>
      </section>

      <NewCallDialog
        open={newCallOpen}
        onOpenChange={setNewCallOpen}
        voiceAssistants={voiceAssistants}
        onSubmit={({ customerName, customerPhone, assistantId }) => {
          if (!can("voice", "execute")) {
            throw new Error(
              "You do not have execute permission for the voice channel.",
            );
          }
          startCall({ customerName, customerPhone, assistantId });
          toast.success("Call started", {
            description: `Connecting to ${customerName} (${customerPhone})…`,
          });
          // The tick interval above will pick up the new activeCall and advance
          // state: connecting → connected → active.
        }}
      />
    </>
  );
}

// ===== New Call dialog =====
interface NewCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voiceAssistants: { id: string; name: string; description?: string }[];
  onSubmit: (params: {
    customerName: string;
    customerPhone: string;
    assistantId: string;
  }) => void;
}

function NewCallDialog({
  open,
  onOpenChange,
  voiceAssistants,
  onSubmit,
}: NewCallDialogProps) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [assistantId, setAssistantId] = useState<string>(
    voiceAssistants[0]?.id ?? "",
  );

  // Keep the default assistantId in sync when the list changes (e.g. on first open)
  const lastSeenCount = useRef<number>(voiceAssistants.length);
  useEffect(() => {
    if (
      voiceAssistants.length !== lastSeenCount.current ||
      (assistantId && !voiceAssistants.some((a) => a.id === assistantId))
    ) {
      lastSeenCount.current = voiceAssistants.length;
      setAssistantId(voiceAssistants[0]?.id ?? "");
    }
  }, [voiceAssistants, assistantId]);

  // Reset form whenever the dialog is closed
  useEffect(() => {
    if (!open) {
      setCustomerName("");
      setCustomerPhone("");
      setAssistantId(voiceAssistants[0]?.id ?? "");
    }
  }, [open, voiceAssistants]);

  const handleSubmit = () => {
    if (!customerName.trim()) throw new Error("Customer name is required");
    if (!customerPhone.trim()) throw new Error("Customer phone is required");
    if (!assistantId) throw new Error("Please select an assistant");
    onSubmit({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      assistantId,
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start New Call"
      description="Initiate an outbound voice call. The Sarah voice agent will greet the customer and route the conversation."
      onSubmit={handleSubmit}
      submitLabel="Start Call"
      size="md"
    >
      <Field label="Customer name" required htmlFor="vc-customer-name">
        <Input
          id="vc-customer-name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="e.g. Rahul Sharma"
          className="h-10 border-border bg-glass"
        />
      </Field>
      <Field
        label="Customer phone"
        required
        htmlFor="vc-customer-phone"
        hint="Include country code, e.g. +91 98200 41122"
      >
        <Input
          id="vc-customer-phone"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="+91 98200 41122"
          className="h-10 border-border bg-glass"
        />
      </Field>
      <Field label="Assistant" required htmlFor="vc-assistant">
        <Select value={assistantId} onValueChange={setAssistantId}>
          <SelectTrigger id="vc-assistant" className="h-10 border-border bg-glass">
            <SelectValue placeholder="Select a voice assistant" />
          </SelectTrigger>
          <SelectContent>
            {voiceAssistants.length === 0 ? (
              <SelectItem value="_none" disabled>
                No voice assistants available
              </SelectItem>
            ) : (
              voiceAssistants.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </Field>
      <div className="rounded-lg border border-border bg-glass px-3 py-2.5 text-[12px] text-subtle">
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Note
        </Label>
        <p className="mt-1">
          Once started, the call transitions through{" "}
          <code className="rounded bg-glass-strong px-1 py-0.5 font-mono text-[11px]">
            connecting
          </code>{" "}
          →{" "}
          <code className="rounded bg-glass-strong px-1 py-0.5 font-mono text-[11px]">
            connected
          </code>{" "}
          →{" "}
          <code className="rounded bg-glass-strong px-1 py-0.5 font-mono text-[11px]">
            active
          </code>{" "}
          automatically. End the call to finalise the summary.
        </p>
      </div>
    </FormDialog>
  );
}
