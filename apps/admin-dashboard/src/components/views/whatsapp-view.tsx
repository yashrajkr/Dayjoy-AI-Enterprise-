"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Link2,
  MessageCircle,
  Save,
  ShieldCheck,
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
import { Cell, DataTable, PageHeader, Pill, Row } from "@/components/kit/page-header";
import { StatusBadge } from "@/components/kit/status-badge";
import { Field } from "@/components/kit/field";
import { ProviderConfigRequired } from "@/components/kit/provider-config-required";

import { Input } from "@/components/ui/input";
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

import type { WhatsAppChannelConfig } from "@/types/domain";

/** Default webhook URL the admin should configure in the Meta dashboard. */
const DEFAULT_WEBHOOK_URL = "https://api.dayjoy.ai/webhooks/whatsapp";

export function WhatsAppAIView({ onViewChange }: { onViewChange?: (v: string) => void }) {
  const waConfig = useProviderConfigStore((s) => s.getByProvider("whatsapp"));
  const whatsapp = useChannelConfigStore((s) => s.whatsapp);
  const updateWhatsapp = useChannelConfigStore((s) => s.updateWhatsapp);
  const assistants = useAssistantStore((s) => s.assistants);
  const prompts = usePromptStore((s) => s.prompts);
  const documents = useKnowledgeStore((s) => s.documents);
  const tools = useToolStore((s) => s.tools);
  const { can } = usePermissions();

  const canConfigure = can("whatsapp", "configure");

  // ===== Local form state =====
  const [enabled, setEnabled] = useState<boolean>(whatsapp.enabled);
  const [assistantId, setAssistantId] = useState<string | null>(
    whatsapp.assistantId,
  );
  const [promptId, setPromptId] = useState<string | null>(whatsapp.promptId);
  const [knowledgeSourceIds, setKnowledgeSourceIds] = useState<string[]>(
    whatsapp.knowledgeSourceIds,
  );
  const [toolIds, setToolIds] = useState<string[]>(whatsapp.toolIds);
  const [businessPhoneNumberId, setBusinessPhoneNumberId] = useState<string>(
    whatsapp.businessPhoneNumberId ?? "",
  );
  const [webhookUrl, setWebhookUrl] = useState<string>(
    whatsapp.webhookUrl ?? DEFAULT_WEBHOOK_URL,
  );
  const [webhookSecret, setWebhookSecret] = useState<string>(
    whatsapp.webhookSecret ?? "",
  );
  const [revealSecret, setRevealSecret] = useState<boolean>(false);

  // Re-sync when store changes (e.g. from another tab).
  useEffect(() => {
    setEnabled(whatsapp.enabled);
    setAssistantId(whatsapp.assistantId);
    setPromptId(whatsapp.promptId);
    setKnowledgeSourceIds(whatsapp.knowledgeSourceIds);
    setToolIds(whatsapp.toolIds);
    setBusinessPhoneNumberId(whatsapp.businessPhoneNumberId ?? "");
    setWebhookUrl(whatsapp.webhookUrl ?? DEFAULT_WEBHOOK_URL);
    setWebhookSecret(whatsapp.webhookSecret ?? "");
  }, [
    whatsapp.enabled,
    whatsapp.assistantId,
    whatsapp.promptId,
    whatsapp.knowledgeSourceIds,
    whatsapp.toolIds,
    whatsapp.businessPhoneNumberId,
    whatsapp.webhookUrl,
    whatsapp.webhookSecret,
    whatsapp.updatedAt,
  ]);

  // ===== Derived option lists =====
  const whatsappAssistants = useMemo(() => {
    return assistants.filter((a) => a.type === "WHATSAPP");
  }, [assistants]);

  const activeAssistant = useMemo(
    () => assistants.find((a) => a.id === assistantId) ?? null,
    [assistants, assistantId],
  );

  const activePrompt = useMemo(
    () => prompts.find((p) => p.id === promptId) ?? null,
    [prompts, promptId],
  );

  const webhookVerified = !!webhookSecret && webhookSecret.length >= 8;

  // ===== Provider-configured phone number (read-only if present) =====
  const providerPhoneIdLocked = !!businessPhoneNumberId;

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
        description:
          "You do not have configure permission for the WhatsApp channel.",
      });
      return;
    }
    const patch: Partial<WhatsAppChannelConfig> = {
      enabled,
      assistantId,
      promptId,
      knowledgeSourceIds,
      toolIds,
      businessPhoneNumberId: businessPhoneNumberId.trim() || null,
      webhookUrl: webhookUrl.trim() || null,
      webhookSecret: webhookSecret.trim() || null,
    };
    updateWhatsapp(patch);
    toast.success("WhatsApp AI configuration saved", {
      description: enabled
        ? "WhatsApp channel is live — inbound messages will be routed to the assistant."
        : "WhatsApp channel is currently disabled.",
    });
  };

  const handleCopyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Webhook URL copied", {
        description: "Paste it into the Meta WhatsApp Manager → Webhooks section.",
      });
    } catch {
      toast.error("Clipboard unavailable", {
        description: "Copy the webhook URL manually from the field above.",
      });
    }
  };

  // ===== Early return: provider not configured =====
  if (!waConfig?.configured) {
    return (
      <ProviderConfigRequired
        title="WhatsApp AI"
        subtitle="Manage WhatsApp Business API integration."
        providerName="WhatsApp"
        requiredFields={
          waConfig?.requiredFields ?? [
            "accessToken",
            "phoneNumberId",
            "businessAccountId",
            "webhookSecret",
          ]
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
        title="WhatsApp AI"
        subtitle="Manage WhatsApp Business API integration."
        actions={
          <Pill tone={enabled ? "success" : "muted"} dot pulse={enabled}>
            {enabled ? "Enabled" : "Disabled"}
          </Pill>
        }
      />

      <section className="grid gap-4 lg:grid-cols-3">
        {/* ===== Left: configuration form (2/3 width) ===== */}
        <GlassCard delay={0.1} className="p-5 lg:col-span-2" tilt={false}>
          <CardHead
            title="WhatsApp Configuration"
            subtitle="Assistant, knowledge, webhook and templates"
            icon={<MessageCircle className="size-4" />}
          />
          <div className="mt-5 space-y-5">
            {/* Enable / disable */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-glass px-4 py-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">Enable WhatsApp channel</p>
                <p className="mt-0.5 text-[12px] text-subtle">
                  When disabled, inbound messages are acknowledged but not answered.
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                disabled={!canConfigure}
                aria-label="Toggle WhatsApp channel"
              />
            </div>

            {/* Assistant + prompt assignment */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Assistant" required htmlFor="wa-assistant">
                <Select
                  value={assistantId ?? "_none"}
                  onValueChange={(v) => setAssistantId(v === "_none" ? null : v)}
                  disabled={!canConfigure}
                >
                  <SelectTrigger id="wa-assistant" className="h-10 border-border bg-glass">
                    <SelectValue placeholder="Select a WhatsApp assistant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— None —</SelectItem>
                    {whatsappAssistants.length === 0 ? (
                      <SelectItem value="_empty" disabled>
                        No WhatsApp assistants available
                      </SelectItem>
                    ) : (
                      whatsappAssistants.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="Prompt"
                htmlFor="wa-prompt"
                hint="Defaults to the assistant's master prompt"
              >
                <Select
                  value={promptId ?? "_none"}
                  onValueChange={(v) => setPromptId(v === "_none" ? null : v)}
                  disabled={!canConfigure}
                >
                  <SelectTrigger id="wa-prompt" className="h-10 border-border bg-glass">
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
              hint="Capabilities the assistant can invoke on the customer's behalf."
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

            {/* Business phone number ID + webhook URL */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Business phone number ID"
                htmlFor="wa-phone-id"
                hint={
                  providerPhoneIdLocked
                    ? "Inherited from WhatsApp provider configuration — read-only."
                    : "Set this in System Config → Provider Configuration."
                }
              >
                <Input
                  id="wa-phone-id"
                  value={businessPhoneNumberId}
                  onChange={(e) => setBusinessPhoneNumberId(e.target.value)}
                  disabled={!canConfigure || providerPhoneIdLocked}
                  placeholder="e.g. 1042XXXXXXX"
                  className="h-10 border-border bg-glass font-mono text-[12px]"
                />
              </Field>
              <Field
                label="Webhook URL"
                htmlFor="wa-webhook-url"
                hint="Configure this URL in the Meta WhatsApp Manager."
              >
                <div className="flex gap-2">
                  <Input
                    id="wa-webhook-url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    disabled={!canConfigure}
                    className="h-10 border-border bg-glass font-mono text-[12px]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-10 shrink-0 border-border bg-glass px-2.5"
                    onClick={handleCopyWebhookUrl}
                    aria-label="Copy webhook URL"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </Field>
            </div>

            {/* Webhook secret (masked) */}
            <Field
              label="Webhook secret"
              htmlFor="wa-webhook-secret"
              hint="Meta will send this in the X-Hub-Signature-256 header. Keep it secret."
            >
              <div className="flex gap-2">
                <Input
                  id="wa-webhook-secret"
                  type={revealSecret ? "text" : "password"}
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  disabled={!canConfigure}
                  placeholder="whsec_••••••••••••"
                  className="h-10 border-border bg-glass font-mono text-[12px]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-10 shrink-0 border-border bg-glass px-2.5"
                  onClick={() => setRevealSecret((v) => !v)}
                  aria-label={revealSecret ? "Hide webhook secret" : "Reveal webhook secret"}
                >
                  {revealSecret ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </Button>
              </div>
            </Field>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEnabled(whatsapp.enabled);
                  setAssistantId(whatsapp.assistantId);
                  setPromptId(whatsapp.promptId);
                  setKnowledgeSourceIds(whatsapp.knowledgeSourceIds);
                  setToolIds(whatsapp.toolIds);
                  setBusinessPhoneNumberId(whatsapp.businessPhoneNumberId ?? "");
                  setWebhookUrl(whatsapp.webhookUrl ?? DEFAULT_WEBHOOK_URL);
                  setWebhookSecret(whatsapp.webhookSecret ?? "");
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
                    You do not have configure permission for the WhatsApp channel.
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </GlassCard>

        {/* ===== Right: status panel + templates + webhook verification ===== */}
        <div className="space-y-4">
          <GlassCard delay={0.15} className="p-5" tilt={false}>
            <CardHead
              title="Status"
              subtitle={`Updated ${new Date(whatsapp.updatedAt).toLocaleString("en-IN", {
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
                      <Bot className="size-3.5 text-success" />
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
                <span className="text-subtle">Phone number ID</span>
                <span className="truncate font-mono text-[11px] font-medium">
                  {businessPhoneNumberId ? businessPhoneNumberId : "—"}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">Templates</span>
                <span className="num font-medium">{whatsapp.templates.length}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">Knowledge sources</span>
                <span className="num font-medium">{knowledgeSourceIds.length}</span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="text-subtle">Tools</span>
                <span className="num font-medium">{toolIds.length}</span>
              </li>
            </ul>
          </GlassCard>

          {/* Webhook verification status */}
          <GlassCard delay={0.2} className="p-5" tilt={false}>
            <CardHead
              title="Webhook Verification"
              subtitle="HMAC SHA-256 signature check"
              icon={<ShieldCheck className="size-4" />}
            />
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-glass p-3">
              {webhookVerified ? (
                <>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
                    <CheckCircle2 className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-success">
                      Webhook secured
                    </p>
                    <p className="mt-0.5 text-[12px] text-subtle">
                      The webhook secret is set. Meta callbacks will be verified.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
                    <KeyRound className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-warning">
                      Webhook secret missing
                    </p>
                    <p className="mt-0.5 text-[12px] text-subtle">
                      Set a secret (≥ 8 chars) to enable signature verification.
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-glass px-3 py-2 text-[12px] text-subtle">
              <Link2 className="mt-0.5 size-3.5 shrink-0 text-info" />
              <span className="truncate font-mono">
                {webhookUrl}
              </span>
            </div>
          </GlassCard>

          {/* Templates table */}
          <GlassCard delay={0.25} className="p-5" tilt={false}>
            <CardHead
              title="Message Templates"
              subtitle="Pre-approved WhatsApp templates"
              icon={<FileText className="size-4" />}
            />
            {whatsapp.templates.length === 0 ? (
              <p className="mt-4 px-1 py-4 text-center text-[12px] text-muted-foreground">
                No templates configured.
              </p>
            ) : (
              <DataTable head={["Name", "Language", "Status"]}>
                {whatsapp.templates.map((t) => (
                  <Row key={`${t.name}-${t.language}`}>
                    <Cell className="min-w-0">
                      <span className="block truncate font-mono text-[12px] font-medium">
                        {t.name}
                      </span>
                    </Cell>
                    <Cell>
                      <span className="num text-[12px] text-subtle">{t.language}</span>
                    </Cell>
                    <Cell>
                      <StatusBadge status={t.status} />
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </GlassCard>

          {/* Tools / knowledge quick summary */}
          <GlassCard delay={0.3} className="p-5" tilt={false}>
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
