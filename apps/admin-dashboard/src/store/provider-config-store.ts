"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProviderConfig } from "@/types/domain";
import { logAudit } from "@/store/audit-store";

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const SEED_PROVIDERS: ProviderConfig[] = [
  {
    id: "prov_vapi",
    provider: "vapi",
    displayName: "Vapi (Voice AI)",
    configured: false,
    requiredFields: ["apiKey", "assistantId", "phoneNumberId"],
    configuredFields: [],
    lastCheckedAt: null,
    notes: "Voice call orchestration. Required for the voice channel.",
  },
  {
    id: "prov_whatsapp",
    provider: "whatsapp",
    displayName: "WhatsApp Business Cloud",
    configured: false,
    requiredFields: [
      "accessToken",
      "phoneNumberId",
      "businessAccountId",
      "webhookSecret",
    ],
    configuredFields: [],
    lastCheckedAt: null,
    notes: "WhatsApp Business API via Meta Cloud.",
  },
  {
    id: "prov_openai",
    provider: "openai",
    displayName: "OpenAI Platform",
    configured: true,
    requiredFields: ["apiKey"],
    configuredFields: ["apiKey"],
    lastCheckedAt: "2026-03-12T10:00:00.000Z",
    notes: "Powers GPT-4o inference for all assistants.",
  },
  {
    id: "prov_twilio",
    provider: "twilio",
    displayName: "Twilio Programmable Voice",
    configured: false,
    requiredFields: ["accountSid", "authToken", "fromNumber"],
    configuredFields: [],
    lastCheckedAt: null,
    notes: "Optional fallback PSTN bridge.",
  },
  {
    id: "prov_sendgrid",
    provider: "sendgrid",
    displayName: "SendGrid Email",
    configured: false,
    requiredFields: ["apiKey", "fromEmail"],
    configuredFields: [],
    lastCheckedAt: null,
    notes: "Transactional email for automations.",
  },
];

interface ProviderState {
  providers: ProviderConfig[];
  configure: (
    provider: ProviderConfig["provider"],
    fields: Record<string, string>,
  ) => ProviderConfig | undefined;
  reset: (provider: ProviderConfig["provider"]) => void;
  getByProvider: (provider: ProviderConfig["provider"]) => ProviderConfig | undefined;
}

export const useProviderConfigStore = create<ProviderState>()(
  persist(
    (set, get) => ({
      providers: SEED_PROVIDERS,
      configure: (provider, fields) => {
        const old = get().providers.find((p) => p.provider === provider);
        if (!old) return undefined;
        // Merge any newly provided non-empty values into configuredFields.
        const providedKeys = Object.keys(fields).filter(
          (k) => fields[k] !== undefined && fields[k] !== null && fields[k] !== "",
        );
        const merged = Array.from(
          new Set([...old.configuredFields, ...providedKeys]),
        ).filter((k) => old.requiredFields.includes(k) || providedKeys.includes(k));
        // Restrict configuredFields to required fields (so we can compute `configured`).
        const configuredFields = merged.filter((k) => old.requiredFields.includes(k));
        const configured = old.requiredFields.every((k) =>
          configuredFields.includes(k),
        );
        const now = new Date().toISOString();
        const next: ProviderConfig = {
          ...old,
          configuredFields,
          configured,
          lastCheckedAt: now,
        };
        set((s) => ({
          providers: s.providers.map((p) => (p.id === old.id ? next : p)),
        }));
        logAudit({
          action: "CONFIGURE",
          resourceType: "config",
          resourceId: old.id,
          resourceName: old.displayName,
          oldValues: {
            configured: old.configured,
            configuredFields: old.configuredFields,
          },
          newValues: {
            configured,
            configuredFields,
            providedKeys,
          },
        });
        return next;
      },
      reset: (provider) => {
        const old = get().providers.find((p) => p.provider === provider);
        if (!old) return;
        const next: ProviderConfig = {
          ...old,
          configured: false,
          configuredFields: [],
          lastCheckedAt: new Date().toISOString(),
        };
        set((s) => ({
          providers: s.providers.map((p) => (p.id === old.id ? next : p)),
        }));
        logAudit({
          action: "CONFIGURE",
          resourceType: "config",
          resourceId: old.id,
          resourceName: old.displayName,
          oldValues: {
            configured: old.configured,
            configuredFields: old.configuredFields,
          },
          newValues: { configured: false, configuredFields: [] },
        });
      },
      getByProvider: (provider) =>
        get().providers.find((p) => p.provider === provider),
    }),
    { name: "dayjoy_provider_configs" },
  ),
);
