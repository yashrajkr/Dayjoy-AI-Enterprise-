"use client";

import { useState } from "react";
import { Settings, CheckCircle2, XCircle, KeyRound, RefreshCw, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { CardHead, GlassCard } from "@/components/kit/glass-card";
import { Cell, DataTable, PageHeader, Pill, Row } from "@/components/kit/page-header";
import { StatusBadge } from "@/components/kit/status-badge";
import { FormDialog } from "@/components/kit/form-dialog";
import { Field } from "@/components/kit/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useProviderConfigStore } from "@/store/provider-config-store";
import { usePermissions } from "@/hooks/use-permissions";
import type { ProviderConfig } from "@/types/domain";

export function ProviderConfigView() {
  const providers = useProviderConfigStore((s) => s.providers);
  const configure = useProviderConfigStore((s) => s.configure);
  const reset = useProviderConfigStore((s) => s.reset);
  const { can } = usePermissions();

  const [editTarget, setEditTarget] = useState<ProviderConfig | null>(null);

  return (
    <>
      <PageHeader
        title="Provider Configuration"
        subtitle="Manage credentials for external AI, voice, and messaging providers. These are required before channels can be activated."
      />

      <GlassCard delay={0.05} className="border-warning/30 bg-warning/[0.06] p-4">
        <div className="flex items-start gap-3">
          <Settings className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="text-[13px]">
            <p className="font-semibold text-foreground">Provider credentials are stored securely</p>
            <p className="mt-1 text-subtle">
              In production, these credentials are stored in AWS Secrets Manager and synced to Kubernetes via the External Secrets Operator.
              In this development build, they are persisted to your browser's localStorage under the <code className="rounded bg-glass-strong px-1 py-0.5 font-mono text-[11px]">dayjoy_provider_config</code> key.
            </p>
          </div>
        </div>
      </GlassCard>

      <GlassCard delay={0.1} tilt={false} className="p-5">
        <CardHead title="Providers" subtitle={`${providers.length} configured providers`} />
        <DataTable head={["Provider", "Status", "Required Fields", "Configured", "Last Checked", ""]}>
          {providers.map((p) => (
            <Row key={p.id}>
              <Cell className="font-medium">{p.displayName}</Cell>
              <Cell>
                {p.configured ? (
                  <StatusBadge status="configured" tone="success" />
                ) : (
                  <StatusBadge status="not configured" tone="warning" />
                )}
              </Cell>
              <Cell>
                <div className="flex flex-wrap gap-1">
                  {p.requiredFields.map((f) => (
                    <code key={f} className="rounded bg-glass-strong px-1.5 py-0.5 font-mono text-[10px]">
                      {f}
                    </code>
                  ))}
                </div>
              </Cell>
              <Cell className="num text-[11px] text-muted-foreground">
                {p.configuredFields.length}/{p.requiredFields.length} fields
              </Cell>
              <Cell className="num text-[11px] text-muted-foreground">
                {p.lastCheckedAt ? new Date(p.lastCheckedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never"}
              </Cell>
              <Cell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-border bg-glass"
                    onClick={() => {
                      if (!can("config", "configure")) {
                        toast.error("Permission denied", { description: "You cannot configure providers." });
                        return;
                      }
                      setEditTarget(p);
                    }}
                  >
                    <KeyRound className="mr-1 size-3" />
                    {p.configured ? "Edit" : "Configure"}
                  </Button>
                  {p.configured && can("config", "configure") ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-danger hover:text-danger"
                      onClick={() => {
                        reset(p.provider);
                        toast.success(`${p.displayName} reset`, { description: "Provider credentials cleared." });
                      }}
                    >
                      <RefreshCw className="size-3" />
                    </Button>
                  ) : null}
                </div>
              </Cell>
            </Row>
          ))}
        </DataTable>
      </GlassCard>

      {editTarget ? (
        <ProviderConfigDialog
          key={editTarget.id}
          provider={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSave={(fields) => {
            configure(editTarget.provider, fields);
            toast.success(`${editTarget.displayName} configured`, {
              description: `All ${editTarget.requiredFields.length} required fields saved.`,
            });
          }}
        />
      ) : null}
    </>
  );
}

function ProviderConfigDialog({
  provider,
  open,
  onOpenChange,
  onSave,
}: {
  provider: ProviderConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (fields: Record<string, string>) => void;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const handleSubmit = () => {
    const missing = provider.requiredFields.filter((f) => !fields[f]?.trim());
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(", ")}`);
    }
    onSave(fields);
    setFields({});
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Configure ${provider.displayName}`}
      description={`Provide the following ${provider.requiredFields.length} credential(s). They will be stored securely and used for all ${provider.displayName} operations.`}
      onSubmit={handleSubmit}
      submitLabel="Save Configuration"
      size="md"
    >
      {provider.requiredFields.map((field) => {
        const isSecret = field.toLowerCase().includes("secret") || field.toLowerCase().includes("token") || field.toLowerCase().includes("key") || field.toLowerCase().includes("password");
        const shown = showSecrets[field] ?? false;
        return (
          <Field key={field} label={field} required hint={isSecret ? "Sensitive credential — will be masked." : undefined}>
            <div className="relative">
              <Input
                type={isSecret && !shown ? "password" : "text"}
                value={fields[field] ?? ""}
                onChange={(e) => setFields((s) => ({ ...s, [field]: e.target.value }))}
                placeholder={`Enter ${field}...`}
                className="h-10 border-border bg-glass pr-10 font-mono text-[12px]"
              />
              {isSecret ? (
                <button
                  type="button"
                  onClick={() => setShowSecrets((s) => ({ ...s, [field]: !s[field] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={shown ? "Hide" : "Show"}
                >
                  {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              ) : null}
            </div>
          </Field>
        );
      })}
      {provider.notes ? (
        <div className="rounded-lg border border-border bg-glass p-3 text-[12px] text-subtle">
          {provider.notes}
        </div>
      ) : null}
    </FormDialog>
  );
}
