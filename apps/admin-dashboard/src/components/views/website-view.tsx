"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Code2,
  Copy,
  FileText,
  Globe,
  Save,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { useChannelConfigStore } from "@/store/channel-config-store";
import { useAssistantStore } from "@/store/assistant-store";
import { usePromptStore } from "@/store/prompt-store";
import { useKnowledgeStore } from "@/store/knowledge-store";
import { useToolStore } from "@/store/tool-store";
import { useProviderConfigStore } from "@/store/provider-config-store";
import { usePermissions } from "@/hooks/use-permissions";

import { CardHead, GlassCard } from "@/components/kit/glass-card";
import { PageHeader, Pill } from "@/components/kit/page-header";
import { StatusBadge } from "@/components/kit/status-badge";
import { Field } from "@/components/kit/field";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type {
  ChannelType,
  WebsiteChannelConfig,
} from "@/types/domain";

const MODEL_OPTIONS = [
  { value: "gpt-4o", label: "GPT-4o", hint: "Most capable — best for complex queries" },
  { value: "gpt-4o-mini", label: "GPT-4o mini", hint: "Balanced cost & latency" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo", hint: "Legacy — long context window" },
] as const;

/** Build the embed snippet shown to admins for copy/paste into their website. */
function buildEmbedSnippet(assistantId: string | null): string {
  const id = assistantId ?? "YOUR_ASSISTANT_ID";
  return `<script
  src="https://cdn.dayjoy.ai/chat.js"
  data-assistant-id="${id}"
  data-widget="true"
  async
></script>`;
}

export function WebsiteAIView({ onViewChange }: { onViewChange?: (v: string) => void }) {
  const website = useChannelConfigStore((s) => s.website);
  const updateWebsite = useChannelConfigStore((s) => s.updateWebsite);
  const assistants = useAssistantStore((s) => s.assistants);
  const prompts = usePromptStore((s) => s.prompts);
  const documents = useKnowledgeStore((s) => s.documents);
  const tools = useToolStore((s) => s.tools);
  const openaiConfig = useProviderConfigStore((s) => s.getByProvider("openai"));
  const { can } = usePermissions();

  const canConfigure = can("website", "configure");

  // ===== Local form state, initialised from the store. Saved as a single patch =====
  const [enabled, setEnabled] = useState<boolean>(website.enabled);
  const [assistantId, setAssistantId] = useState<string | null>(website.assistantId);
  const [promptId, setPromptId] = useState<string | null>(website.promptId);
  const [knowledgeSourceIds, setKnowledgeSourceIds] = useState<string[]>(
    website.knowledgeSourceIds,
  );
  const [toolIds, setToolIds] = useState<string[]>(website.toolIds);
  const [model, setModel] = useState<WebsiteChannelConfig["model"]>(website.model);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState<number>(
    website.rateLimitPerMinute,
  );
  const [requireAuth, setRequireAuth] = useState<boolean>(website.requireAuth);
  const [allowedOrigins, setAllowedOrigins] = useState<string>(
    website.allowedOrigins.join("\n"),
  );

  // Re-sync local state when the store version changes (e.g. another tab edits)
  useEffect(() => {
    setEnabled(website.enabled);
    setAssistantId(website.assistantId);
    setPromptId(website.promptId);
    setKnowledgeSourceIds(website.knowledgeSourceIds);
    setToolIds(website.toolIds);
    setModel(website.model);
    setRateLimitPerMinute(website.rateLimitPerMinute);
    setRequireAuth(website.requireAuth);
    setAllowedOrigins(website.allowedOrigins.join("\n"));
  }, [
    website.enabled,
    website.assistantId,
    website.promptId,
    website.knowledgeSourceIds,
    website.toolIds,
    website.model,
    website.rateLimitPerMinute,
    website.requireAuth,
    website.allowedOrigins,
    website.updatedAt,
  ]);

  // ===== Derived option lists =====
  const webAssistants = useMemo(() => {
    return assistants.filter(
      (a) =>
        a.type === "WEB" ||
        (Array.isArray(a.allowedChannels) &&
          a.allowedChannels.includes("website" as ChannelType)),
    );
  }, [assistants]);

  const activeAssistant = useMemo(
    () => assistants.find((a) => a.id === assistantId) ?? null,
    [assistants, assistantId],
  );

  const activePrompt = useMemo(
    () => prompts.find((p) => p.id === promptId) ?? null,
    [prompts, promptId],
  );

  const embedSnippet = useMemo(
    () => buildEmbedSnippet(assistantId),
    [assistantId],
  );

  // ===== Checkbox list helpers =====
  const toggleId = (
    list: string[],
    id: string,
    setter: (next: string[]) => void,
  ) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const handleSave = () => {
    if (!canConfigure) {
      toast.error("Permission denied", {
        description: "You do not have configure permission for the website channel.",
      });
      return;
    }
    const origins = allowedOrigins
      .split("\n")
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    const patch: Partial<WebsiteChannelConfig> = {
      enabled,
      assistantId,
      promptId,
      knowledgeSourceIds,
      toolIds,
      model,
      rateLimitPerMinute: Math.max(1, Math.min(600, rateLimitPerMinute)),
      requireAuth,
      allowedOrigins: origins,
    };
    updateWebsite(patch);
    toast.success("Website AI configuration saved", {
      description: enabled
        ? "Chat widget is live for the configured origins."
        : "Chat widget is currently disabled.",
    });
  };

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      toast.success("Embed snippet copied", {
        description: "Paste it before the closing </body> tag.",
      });
    } catch {
      toast.error("Clipboard unavailable", {
        description: "Copy the snippet manually from the code block below.",
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Website AI"
        subtitle="Configure the AI chat widget for your website."
        actions={
          <Pill tone={enabled ? "success" : "muted"} dot pulse={enabled}>
            {enabled ? "Enabled" : "Disabled"}
          </Pill>
        }
      />

      {/* OpenAI not configured warning (still allowed to configure the channel) */}
      {!openaiConfig?.configured ? (
        <GlassCard
          delay={0.05}
          className="border-warning/30 bg-warning/[0.06] p-4"
          tilt={false}
        >
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
              <AlertTriangle className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-warning">
                OpenAI provider is not configured
              </p>
              <p className="mt-0.5 text-[12px] text-subtle">
                The chat widget uses OpenAI for inference. You can still save this
                configuration, but the widget will not serve answers until an admin
                configures the OpenAI API key under{" "}
                <strong>System Config → Provider Configuration</strong>.
              </p>
              <button
                onClick={() => {
                  if (onViewChange) {
                    onViewChange("providers");
                  }
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 text-[12px] font-semibold text-warning transition-colors hover:bg-warning/20"
              >
                Configure OpenAI
              </button>
            </div>
          </div>
        </GlassCard>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        {/* ===== Left: configuration form (2/3 width) ===== */}
        <GlassCard delay={0.1} className="p-5 lg:col-span-2" tilt={false}>
          <CardHead
            title="Widget Configuration"
            subtitle="Assistant, prompts, knowledge and widget behaviour"
            icon={<Globe className="size-4" />}
          />
          <div className="mt-5 space-y-5">
            {/* Enable / disable */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-glass px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">Enable chat widget</p>
                <p className="mt-0.5 text-[12px] text-subtle">
                  When disabled, the embed snippet loads but renders nothing.
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={!canConfigure}
                aria-label="Toggle website chat widget"
              />
            </div>

            {/* Assistant + prompt assignment */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assistant" required htmlFor="web-assistant">
                <Select
                  value={assistantId ?? "_none"}
                  onValueChange={(v) => setAssistantId(v === "_none" ? null : v)}
                  disabled={!canConfigure}
                >
                  <SelectTrigger id="web-assistant" className="h-10 border-border bg-glass">
                    <SelectValue placeholder="Select a website assistant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {webAssistants.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Prompt" htmlFor="web-prompt" hint="Defaults to the assistant's master prompt">
                <Select
                  value={promptId ?? "_none"}
                  onValueChange={(v) => setPromptId(v === "_none" ? null : v)}
                  disabled={!canConfigure}
                >
                  <SelectTrigger id="web-prompt" className="h-10 border-border bg-glass">
                    <SelectValue placeholder="Select a prompt" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Default —</SelectItem>
                    {prompts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Knowledge sources checklist */}
            <Field
              label="Knowledge sources"
              hint="Documents the assistant can retrieve from during a chat."
            >
              <div className="rounded-xl border border-border bg-glass p-3">
                {documents.length === 0 ? (
                  <p className="px-1 py-2 text-[12px] text-muted-foreground">
                    No knowledge documents uploaded yet.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {documents.map((d) => {
                      const checked = knowledgeSourceIds.includes(d.id);
                      return (
                        <label
                          key={d.id}
                          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-transparent bg-glass px-2.5 py-2 transition-colors hover:border-border"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              toggleId(knowledgeSourceIds, d.id, setKnowledgeSourceIds)
                            }
                            disabled={!canConfigure}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-medium">
                              {d.title}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {d.category} · {d.chunks} chunks
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </Field>

            {/* Tools checklist */}
            <Field
              label="Tools"
              hint="Capabilities the assistant can invoke on the visitor's behalf."
            >
              <div className="rounded-xl border border-border bg-glass p-3">
                {tools.length === 0 ? (
                  <p className="px-1 py-2 text-[12px] text-muted-foreground">
                    No tools configured.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {tools.map((t) => {
                      const checked = toolIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-transparent bg-glass px-2.5 py-2 transition-colors hover:border-border"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleId(toolIds, t.id, setToolIds)}
                            disabled={!canConfigure}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-[12px] font-medium">
                              {t.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {t.description}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </Field>

            {/* Model + rate limit */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Model" htmlFor="web-model">
                <Select
                  value={model}
                  onValueChange={(v) =>
                    setModel(v as WebsiteChannelConfig["model"])
                  }
                  disabled={!canConfigure}
                >
                  <SelectTrigger id="web-model" className="h-10 border-border bg-glass">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Rate limit (per minute)"
                htmlFor="web-rate-limit"
                hint="Per-visitor request cap. 1–600."
              >
                <Input
                  id="web-rate-limit"
                  type="number"
                  min={1}
                  max={600}
                  value={rateLimitPerMinute}
                  onChange={(e) =>
                    setRateLimitPerMinute(Number(e.target.value) || 0)
                  }
                  disabled={!canConfigure}
                  className="h-10 border-border bg-glass"
                />
              </Field>
            </div>

            {/* Require auth + allowed origins */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-glass px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">Require authentication</p>
                <p className="mt-0.5 text-[12px] text-subtle">
                  When enabled, the widget only renders for logged-in users.
                </p>
              </div>
              <Switch
                checked={requireAuth}
                onCheckedChange={setRequireAuth}
                disabled={!canConfigure}
                aria-label="Require authentication for chat widget"
              />
            </div>

            <Field
              label="Allowed origins"
              htmlFor="web-origins"
              hint="One origin per line. The widget will only load from these URLs."
            >
              <Textarea
                id="web-origins"
                value={allowedOrigins}
                onChange={(e) => setAllowedOrigins(e.target.value)}
                disabled={!canConfigure}
                rows={4}
                placeholder={"https://dayjoy.ai\nhttps://shop.dayjoy.ai"}
                className="border-border bg-glass font-mono text-[12px]"
              />
            </Field>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEnabled(website.enabled);
                  setAssistantId(website.assistantId);
                  setPromptId(website.promptId);
                  setKnowledgeSourceIds(website.knowledgeSourceIds);
                  setToolIds(website.toolIds);
                  setModel(website.model);
                  setRateLimitPerMinute(website.rateLimitPerMinute);
                  setRequireAuth(website.requireAuth);
                  setAllowedOrigins(website.allowedOrigins.join("\n"));
                  toast.info("Changes reverted", {
                    description: "Form reset to the last saved configuration.",
                  });
                }}
                disabled={!canConfigure}
              >
                Reset
              </Button>
              {canConfigure ? (
                <Button
                  size="sm"
                  className="bg-gradient-brand"
                  onClick={handleSave}
                >
                  <Save className="mr-1.5 size-4" />
                  Save Configuration
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex">
                      <Button size="sm" className="bg-gradient-brand" disabled>
                        <Save className="mr-1.5 size-4" />
                        Save Configuration
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    You do not have configure permission for the website channel.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </GlassCard>

        {/* ===== Right: status panel (1/3 width) ===== */}
        <div className="space-y-4">
          <GlassCard delay={0.15} className="p-5" tilt={false}>
            <CardHead
              title="Status"
              subtitle={`Updated ${new Date(website.updatedAt).toLocaleString("en-IN", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}`}
            />
            <ul className="mt-4 space-y-2.5 text-[13px]">
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">State</span>
                <StatusBadge status={enabled ? "enabled" : "disabled"} />
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">Assistant</span>
                <span className="truncate font-medium">
                  {activeAssistant ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Bot className="size-3.5 text-info" />
                      {activeAssistant.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not assigned</span>
                  )}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">Prompt</span>
                <span className="truncate font-medium">
                  {activePrompt ? (
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="size-3.5 text-violet" />
                      {activePrompt.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Default</span>
                  )}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">Knowledge sources</span>
                <span className="num font-medium">{knowledgeSourceIds.length}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">Tools</span>
                <span className="num font-medium">{toolIds.length}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">Model</span>
                <span className="font-mono text-[12px] font-medium">{model}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">Rate limit</span>
                <span className="num font-medium">{rateLimitPerMinute}/min</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">Auth required</span>
                <span className="font-medium">
                  {requireAuth ? "Yes" : "No"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">Allowed origins</span>
                <span className="num font-medium">
                  {allowedOrigins.split("\n").filter((o) => o.trim()).length}
                </span>
              </li>
            </ul>
          </GlassCard>

          {/* Embed snippet */}
          <GlassCard delay={0.2} className="p-5" tilt={false}>
            <CardHead
              title="Embed Snippet"
              subtitle="Drop-in script for your website"
              icon={<Code2 className="size-4" />}
              action={
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border bg-glass"
                  onClick={handleCopySnippet}
                >
                  <Copy className="mr-1.5 size-3.5" />
                  Copy
                </Button>
              }
            />
            <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-glass-strong p-3 text-[11px] leading-relaxed text-foreground">
              <code className="font-mono whitespace-pre">{embedSnippet}</code>
            </pre>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-glass px-3 py-2 text-[12px] text-subtle">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
              <span>
                Place this snippet before the closing{" "}
                <code className="rounded bg-glass-strong px-1 py-0.5 font-mono text-[11px]">
                  &lt;/body&gt;
                </code>{" "}
                tag on every page where the widget should appear.
              </span>
            </div>
          </GlassCard>

          {/* Tools / knowledge quick summary */}
          <GlassCard delay={0.25} className="p-5" tilt={false}>
            <CardHead
              title="Resources"
              subtitle="What the assistant can reach"
              icon={<Wrench className="size-4" />}
            />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-glass p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Knowledge
                </p>
                <p className="num mt-1 text-2xl font-bold">
                  {knowledgeSourceIds.length}
                </p>
                <p className="text-[11px] text-subtle">docs attached</p>
              </div>
              <div className="rounded-xl border border-border bg-glass p-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Tools
                </p>
                <p className="num mt-1 text-2xl font-bold">{toolIds.length}</p>
                <p className="text-[11px] text-subtle">enabled</p>
              </div>
            </div>
          </GlassCard>
        </div>
      </section>
    </>
  );
}
