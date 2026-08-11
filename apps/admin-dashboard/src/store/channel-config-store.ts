"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WebsiteChannelConfig, WhatsAppChannelConfig } from "@/types/domain";
import { logAudit } from "@/store/audit-store";

const SEED_WEBSITE: WebsiteChannelConfig = {
  enabled: false,
  assistantId: null,
  promptId: null,
  knowledgeSourceIds: [],
  toolIds: [],
  model: "gpt-4o-mini",
  rateLimitPerMinute: 30,
  requireAuth: false,
  allowedOrigins: ["https://dayjoy.ai"],
  updatedAt: "2026-03-01T00:00:00.000Z",
};

const SEED_WHATSAPP: WhatsAppChannelConfig = {
  enabled: false,
  assistantId: null,
  promptId: null,
  knowledgeSourceIds: [],
  toolIds: [],
  businessPhoneNumberId: null,
  webhookSecret: null,
  webhookUrl: null,
  templates: [
    { name: "welcome_message", language: "en_US", status: "approved" },
    { name: "order_confirmation", language: "en_US", status: "pending" },
  ],
  updatedAt: "2026-03-01T00:00:00.000Z",
};

interface ChannelState {
  website: WebsiteChannelConfig;
  whatsapp: WhatsAppChannelConfig;
  updateWebsite: (patch: Partial<WebsiteChannelConfig>) => void;
  updateWhatsapp: (patch: Partial<WhatsAppChannelConfig>) => void;
}

export const useChannelConfigStore = create<ChannelState>()(
  persist(
    (set, get) => ({
      website: SEED_WEBSITE,
      whatsapp: SEED_WHATSAPP,
      updateWebsite: (patch) => {
        const old = get().website;
        const next: WebsiteChannelConfig = {
          ...old,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        set({ website: next });
        logAudit({
          action: "CONFIGURE",
          resourceType: "website",
          resourceId: "website",
          resourceName: "Website Channel",
          oldValues: {
            enabled: old.enabled,
            assistantId: old.assistantId,
            model: old.model,
            requireAuth: old.requireAuth,
          },
          newValues: patch,
        });
      },
      updateWhatsapp: (patch) => {
        const old = get().whatsapp;
        const next: WhatsAppChannelConfig = {
          ...old,
          ...patch,
          updatedAt: new Date().toISOString(),
        };
        set({ whatsapp: next });
        logAudit({
          action: "CONFIGURE",
          resourceType: "whatsapp",
          resourceId: "whatsapp",
          resourceName: "WhatsApp Channel",
          oldValues: {
            enabled: old.enabled,
            assistantId: old.assistantId,
            businessPhoneNumberId: old.businessPhoneNumberId,
          },
          newValues: patch,
        });
      },
    }),
    { name: "dayjoy_channel_configs" },
  ),
);
