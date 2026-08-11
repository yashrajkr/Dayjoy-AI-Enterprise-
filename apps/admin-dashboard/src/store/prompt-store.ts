"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Prompt, PromptVersion } from "@/types/domain";
import { logAudit } from "@/store/audit-store";

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Rough token estimate (~4 chars per token) — good enough for UI display. */
function estimateTokens(content: string): number {
  return Math.max(1, Math.round(content.length / 4));
}

const MASTER_PROMPT_CONTENT =
  "You are a Dayjoy AI assistant. Always be warm, concise and culturally appropriate for Indian customers. " +
  "Never invent prices, stock levels or medical claims. When unsure, use the search_knowledge tool. " +
  "Escalate to a human agent when the customer asks twice for the same outcome or expresses frustration.";

const KNOWLEDGE_PROMPT_CONTENT =
  "Use the following Dayjoy knowledge to answer the user. Cite the document title for any factual claim. " +
  "If the answer is not present, say you don't know and offer to connect the customer to a human agent. " +
  "Always quote prices in INR (₹) and confirm the customer's region before promising delivery dates.";

const RAG_PROMPT_CONTENT =
  "When retrieving documents, prefer those tagged 'Products' or 'Policy' for factual queries and " +
  "'Support' for SOP-related queries. Re-rank the top 4 chunks by cosine similarity and only cite chunks " +
  "above the 0.78 confidence threshold. Compose the final answer with inline [doc:title] citations.";

const ESCALATION_PROMPT_CONTENT =
  "Escalate to a human agent when: (1) the customer uses the words 'supervisor', 'manager' or 'cancel'; " +
  "(2) the same complaint is raised twice; (3) the order value exceeds ₹1,00,000 and the customer is uncertain; " +
  "(4) any medical advice is requested. Warm-transfer with a 2-line context summary.";

function makeSeed(
  id: string,
  name: string,
  description: string,
  category: Prompt["category"],
  content: string,
  assistantIds: string[],
  createdAt: string,
): Prompt {
  const initialVersion: PromptVersion = {
    version: 1,
    content,
    changedBy: "admin@dayjoy.ai",
    changedAt: createdAt,
    changeNote: "Initial version",
  };
  return {
    id,
    name,
    description,
    category,
    content,
    tokens: estimateTokens(content),
    versions: [initialVersion],
    activeVersion: 1,
    status: "active",
    assistantIds,
    createdBy: "admin@dayjoy.ai",
    createdAt,
    updatedAt: createdAt,
  };
}

const SEED_PROMPTS: Prompt[] = [
  makeSeed(
    "pr_master",
    "Master System Prompt",
    "Global persona, tone and safety rails",
    "system",
    MASTER_PROMPT_CONTENT,
    ["ast_sarah", "ast_priya", "ast_raj"],
    "2026-01-03T09:00:00.000Z",
  ),
  makeSeed(
    "pr_knowledge",
    "Dayjoy Knowledge Prompt",
    "Brand, catalog and policy grounding",
    "rag",
    KNOWLEDGE_PROMPT_CONTENT,
    ["ast_sarah", "ast_priya", "ast_raj"],
    "2026-01-04T10:00:00.000Z",
  ),
  makeSeed(
    "pr_rag",
    "RAG Integration Prompt",
    "Retrieval formatting and citation rules",
    "rag",
    RAG_PROMPT_CONTENT,
    ["ast_sarah", "ast_raj"],
    "2026-01-06T11:30:00.000Z",
  ),
  makeSeed(
    "pr_escalation",
    "Escalation Protocols",
    "When and how to transfer to a human",
    "escalation",
    ESCALATION_PROMPT_CONTENT,
    ["ast_sarah", "ast_priya"],
    "2026-01-08T14:00:00.000Z",
  ),
];

type PromptCreateInput = Omit<
  Prompt,
  "id" | "tokens" | "versions" | "activeVersion" | "createdBy" | "createdAt" | "updatedAt"
> & {
  tokens?: number;
};

interface PromptState {
  prompts: Prompt[];
  create: (data: PromptCreateInput) => Prompt;
  update: (id: string, content: string, changeNote?: string) => void;
  remove: (id: string) => void;
  activate: (id: string, version: number) => void;
  test: (id: string, input: string) => string;
}

export const usePromptStore = create<PromptState>()(
  persist(
    (set, get) => ({
      prompts: SEED_PROMPTS,
      create: (data) => {
        const now = new Date().toISOString();
        const initialVersion: PromptVersion = {
          version: 1,
          content: data.content,
          changedBy: "admin@dayjoy.ai",
          changedAt: now,
          changeNote: "Initial version",
        };
        const prompt: Prompt = {
          tokens: estimateTokens(data.content),
          ...data,
          id: genId("pr"),
          versions: [initialVersion],
          activeVersion: 1,
          status: data.status ?? "active",
          createdBy: "admin@dayjoy.ai",
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({ prompts: [...s.prompts, prompt] }));
        logAudit({
          action: "INSERT",
          resourceType: "prompt",
          resourceId: prompt.id,
          resourceName: prompt.name,
          newValues: {
            name: prompt.name,
            category: prompt.category,
            tokens: prompt.tokens,
          },
        });
        return prompt;
      },
      update: (id, content, changeNote) => {
        const old = get().prompts.find((p) => p.id === id);
        if (!old) return;
        const newVersionNum = old.activeVersion + 1;
        const now = new Date().toISOString();
        const newVersion: PromptVersion = {
          version: newVersionNum,
          content,
          changedBy: "admin@dayjoy.ai",
          changedAt: now,
          changeNote: changeNote ?? "Updated via admin dashboard",
        };
        const next: Prompt = {
          ...old,
          content,
          tokens: estimateTokens(content),
          versions: [...old.versions, newVersion],
          activeVersion: newVersionNum,
          updatedAt: now,
        };
        set((s) => ({ prompts: s.prompts.map((p) => (p.id === id ? next : p)) }));
        logAudit({
          action: "UPDATE",
          resourceType: "prompt",
          resourceId: id,
          resourceName: old.name,
          oldValues: {
            activeVersion: old.activeVersion,
            tokens: old.tokens,
          },
          newValues: {
            activeVersion: newVersionNum,
            tokens: next.tokens,
            changeNote: newVersion.changeNote,
          },
        });
      },
      remove: (id) => {
        const old = get().prompts.find((p) => p.id === id);
        if (!old) return;
        set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) }));
        logAudit({
          action: "DELETE",
          resourceType: "prompt",
          resourceId: id,
          resourceName: old.name,
        });
      },
      activate: (id, version) => {
        const old = get().prompts.find((p) => p.id === id);
        if (!old) return;
        const target = old.versions.find((v) => v.version === version);
        if (!target) return;
        const next: Prompt = {
          ...old,
          activeVersion: version,
          content: target.content,
          tokens: estimateTokens(target.content),
          updatedAt: new Date().toISOString(),
        };
        set((s) => ({ prompts: s.prompts.map((p) => (p.id === id ? next : p)) }));
        logAudit({
          action: "UPDATE",
          resourceType: "prompt",
          resourceId: id,
          resourceName: old.name,
          oldValues: { activeVersion: old.activeVersion },
          newValues: { activeVersion: version },
        });
      },
      test: (id, input) => {
        const p = get().prompts.find((p) => p.id === id);
        if (!p) return "[prompt not found]";
        const preview = input.length > 80 ? input.slice(0, 80) + "…" : input;
        const response =
          `[${p.name} · v${p.activeVersion}] Simulated response for input "${preview}". ` +
          `The prompt is currently ${p.status} with ${p.tokens} tokens. ` +
          `Sample grounded reply: "Based on the Dayjoy knowledge base, here's a draft answer using the ${p.name} guardrails."`;
        logAudit({
          action: "TEST",
          resourceType: "prompt",
          resourceId: id,
          resourceName: p.name,
          metadata: {
            inputPreview: input.slice(0, 200),
            activeVersion: p.activeVersion,
          },
        });
        return response;
      },
    }),
    { name: "dayjoy_prompts" },
  ),
);
