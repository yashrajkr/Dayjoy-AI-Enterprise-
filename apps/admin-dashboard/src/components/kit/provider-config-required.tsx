"use client";

import { AlertTriangle, Settings, type LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/kit/glass-card";
import { PageHeader } from "@/components/kit/page-header";

interface ProviderConfigRequiredProps {
  title: string;
  subtitle?: string;
  providerName: string;
  icon?: LucideIcon;
  requiredFields: string[];
  onConfigure?: () => void;
}

export function ProviderConfigRequired({
  title,
  subtitle = "This channel requires an external provider configuration before it can be used.",
  providerName,
  icon: Icon = Settings,
  requiredFields,
  onConfigure,
}: ProviderConfigRequiredProps) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <GlassCard premium className="relative overflow-hidden p-10 text-center" tilt={false}>
        <div className="mx-auto max-w-lg">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-warning/30 bg-warning/10 text-warning shadow-[0_18px_50px_-20px_var(--warning)]">
            <AlertTriangle className="size-6" />
          </div>
          <p className="mt-5 text-lg font-semibold">
            {providerName} configuration required
          </p>
          <p className="mt-2 text-[13px] text-subtle">
            This capability is part of your Dayjoy AI Control Center. To activate it,
            an authorised admin must configure the {providerName} provider credentials.
            There is no subscription or upgrade required — only provider setup.
          </p>

          <div className="mt-6 rounded-xl border border-border bg-glass p-4 text-left">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Required configuration
            </p>
            <ul className="mt-2 space-y-1.5">
              {requiredFields.map((field) => (
                <li key={field} className="flex items-center gap-2 text-[13px]">
                  <span className="size-1.5 rounded-full bg-warning" />
                  <code className="rounded bg-glass-strong px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {field}
                  </code>
                </li>
              ))}
            </ul>
          </div>

          {onConfigure ? (
            <button
              onClick={onConfigure}
              className="bg-gradient-brand mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
            >
              <Icon className="size-4" />
              Configure {providerName}
            </button>
          ) : (
            <p className="mt-6 text-[12px] text-muted-foreground">
              Navigate to <strong>System Config → Provider Configuration</strong> to set up {providerName}.
            </p>
          )}
        </div>
      </GlassCard>
    </>
  );
}
