"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ResourceType } from "@/types/domain";
import { logAudit } from "./audit-store";

export type WorkflowCategory =
  | "CRM" | "Email" | "Orders" | "Calendar" | "Support" | "AI" | "Notifications";

export type TriggerType = "event" | "schedule" | "webhook" | "manual";

export interface Workflow {
  id: string;
  name: string;
  description: string;
  category: WorkflowCategory;
  triggerType: TriggerType;
  triggerEvent: string; // e.g. "lead.created", "order.paid", "cron.daily"
  triggerConfig: string; // JSON string for trigger config (cron expression, webhook URL, etc.)
  actions: string[]; // list of action descriptions
  enabled: boolean;
  runs: number;
  successRate: number;
  lastRunAt: string | null;
  lastRunStatus: "success" | "failed" | "running" | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const SEED_WORKFLOWS: Workflow[] = [
  {
    id: "wf_lead_capture",
    name: "Lead Capture & Assignment",
    description: "When a new lead is created, score it and assign to the right sales rep.",
    category: "CRM",
    triggerType: "event",
    triggerEvent: "lead.created",
    triggerConfig: '{"event":"lead.created","filter":{"source":["website","whatsapp","voice"]}}',
    actions: ["Score lead", "Assign to rep (round-robin)", "Send WhatsApp welcome", "Create follow-up task"],
    enabled: true,
    runs: 1240,
    successRate: 98,
    lastRunAt: new Date(Date.now() - 1800_000).toISOString(),
    lastRunStatus: "success",
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  },
  {
    id: "wf_welcome_email",
    name: "Welcome Email",
    description: "Send a welcome email when a new customer is created.",
    category: "Email",
    triggerType: "event",
    triggerEvent: "customer.created",
    triggerConfig: '{"event":"customer.created"}',
    actions: ["Send welcome email", "Add to newsletter"],
    enabled: true,
    runs: 980,
    successRate: 100,
    lastRunAt: new Date(Date.now() - 3600_000).toISOString(),
    lastRunStatus: "success",
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-02-05T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
  },
  {
    id: "wf_order_confirmation",
    name: "Order Confirmation",
    description: "Send order confirmation via WhatsApp + email when an order is paid.",
    category: "Orders",
    triggerType: "event",
    triggerEvent: "order.paid",
    triggerConfig: '{"event":"order.paid"}',
    actions: ["Send WhatsApp confirmation", "Send email receipt", "Update inventory"],
    enabled: true,
    runs: 860,
    successRate: 99,
    lastRunAt: new Date(Date.now() - 7200_000).toISOString(),
    lastRunStatus: "success",
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
  {
    id: "wf_shipping_notification",
    name: "Shipping Notification",
    description: "Notify customer when order is shipped.",
    category: "Orders",
    triggerType: "event",
    triggerEvent: "order.shipped",
    triggerConfig: '{"event":"order.shipped"}',
    actions: ["Send WhatsApp shipping update", "Send SMS", "Update tracking"],
    enabled: true,
    runs: 742,
    successRate: 99,
    lastRunAt: new Date(Date.now() - 14400_000).toISOString(),
    lastRunStatus: "success",
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-03-10T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  },
  {
    id: "wf_appointment_reminder",
    name: "Appointment Reminder",
    description: "Send reminders 1 hour before an appointment.",
    category: "Calendar",
    triggerType: "schedule",
    triggerEvent: "appointment.upcoming",
    triggerConfig: '{"schedule":"0 * * * *","lookahead":"1h"}',
    actions: ["Find upcoming appointments", "Send WhatsApp reminder", "Send email reminder"],
    enabled: true,
    runs: 410,
    successRate: 100,
    lastRunAt: new Date(Date.now() - 3600_000).toISOString(),
    lastRunStatus: "success",
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  },
  {
    id: "wf_ticket_auto_close",
    name: "Ticket Auto-Close",
    description: "Auto-close support tickets that have been idle for 72 hours.",
    category: "Support",
    triggerType: "schedule",
    triggerEvent: "ticket.idle",
    triggerConfig: '{"schedule":"0 9 * * *","idle_threshold":"72h"}',
    actions: ["Find idle tickets", "Send closure warning", "Auto-close after 24h"],
    enabled: false,
    runs: 268,
    successRate: 95,
    lastRunAt: new Date(Date.now() - 86400_000).toISOString(),
    lastRunStatus: "success",
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
  },
  {
    id: "wf_memory_cleanup",
    name: "Memory Cleanup",
    description: "Daily cleanup of expired AI memory entries.",
    category: "AI",
    triggerType: "schedule",
    triggerEvent: "cron.daily",
    triggerConfig: '{"schedule":"0 2 * * *"}',
    actions: ["Find expired memories", "Archive old memories", "Clear session memories"],
    enabled: true,
    runs: 305,
    successRate: 100,
    lastRunAt: new Date(Date.now() - 72000_000).toISOString(),
    lastRunStatus: "success",
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
  },
  {
    id: "wf_conversation_summary",
    name: "Conversation Summarization",
    description: "Summarize completed AI conversations and save to CRM.",
    category: "AI",
    triggerType: "event",
    triggerEvent: "conversation.ended",
    triggerConfig: '{"event":"conversation.ended"}',
    actions: ["Generate summary", "Save to CRM interaction", "Update customer profile"],
    enabled: true,
    runs: 206,
    successRate: 97,
    lastRunAt: new Date(Date.now() - 5400_000).toISOString(),
    lastRunStatus: "success",
    createdBy: "admin@dayjoy.ai",
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  },
];

interface WorkflowState {
  workflows: Workflow[];
  create: (data: Omit<Workflow, "id" | "runs" | "successRate" | "lastRunAt" | "lastRunStatus" | "createdBy" | "createdAt" | "updatedAt">) => Workflow;
  update: (id: string, patch: Partial<Omit<Workflow, "id" | "createdAt" | "createdBy">>) => void;
  remove: (id: string) => void;
  toggleEnabled: (id: string) => void;
  recordRun: (id: string, success: boolean) => void;
  getById: (id: string) => Workflow | undefined;
}

const resourceType: ResourceType = "automation";

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      workflows: SEED_WORKFLOWS,
      create: (data) => {
        const wf: Workflow = {
          ...data,
          id: `wf_${Date.now().toString(36)}`,
          runs: 0,
          successRate: 100,
          lastRunAt: null,
          lastRunStatus: null,
          createdBy: "admin@dayjoy.ai",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((s) => ({ workflows: [...s.workflows, wf] }));
        logAudit({
          action: "INSERT",
          resourceType,
          resourceId: wf.id,
          resourceName: wf.name,
          newValues: { name: wf.name, category: wf.category, trigger: wf.triggerEvent },
        });
        return wf;
      },
      update: (id, patch) => {
        const old = get().workflows.find((w) => w.id === id);
        if (!old) return;
        const next: Workflow = { ...old, ...patch, updatedAt: new Date().toISOString() };
        set((s) => ({ workflows: s.workflows.map((w) => (w.id === id ? next : w)) }));
        logAudit({
          action: "UPDATE",
          resourceType,
          resourceId: id,
          resourceName: old.name,
          oldValues: { name: old.name, trigger: old.triggerEvent, enabled: old.enabled },
          newValues: patch,
        });
      },
      remove: (id) => {
        const old = get().workflows.find((w) => w.id === id);
        if (!old) return;
        set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) }));
        logAudit({
          action: "DELETE",
          resourceType,
          resourceId: id,
          resourceName: old.name,
        });
      },
      toggleEnabled: (id) => {
        const old = get().workflows.find((w) => w.id === id);
        if (!old) return;
        const next = { ...old, enabled: !old.enabled, updatedAt: new Date().toISOString() };
        set((s) => ({ workflows: s.workflows.map((w) => (w.id === id ? next : w)) }));
        logAudit({
          action: "UPDATE",
          resourceType,
          resourceId: id,
          resourceName: old.name,
          oldValues: { enabled: old.enabled },
          newValues: { enabled: next.enabled },
        });
      },
      recordRun: (id, success) => {
        const old = get().workflows.find((w) => w.id === id);
        if (!old) return;
        const newRuns = old.runs + 1;
        const successCount = Math.round((old.runs * old.successRate) / 100) + (success ? 1 : 0);
        const next = {
          ...old,
          runs: newRuns,
          successRate: Math.round((successCount / newRuns) * 100),
          lastRunAt: new Date().toISOString(),
          lastRunStatus: success ? "success" as const : "failed" as const,
        };
        set((s) => ({ workflows: s.workflows.map((w) => (w.id === id ? next : w)) }));
      },
      getById: (id) => get().workflows.find((w) => w.id === id),
    }),
    { name: "dayjoy_workflows" },
  ),
);
