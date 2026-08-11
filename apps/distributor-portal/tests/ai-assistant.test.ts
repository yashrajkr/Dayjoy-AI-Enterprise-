/**
 * AI Assistant tests — verify quick actions + service shape + message contracts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AI_QUICK_ACTIONS } from "@/lib/constants";
import { aiService } from "@/lib/services";
import { MOCK_AI_CONVERSATIONS, MOCK_AI_MESSAGES } from "@/lib/mock-data";

describe("AI Assistant — quick actions", () => {
  it("AI_QUICK_ACTIONS has at least 4 actions", () => {
    expect(AI_QUICK_ACTIONS.length).toBeGreaterThanOrEqual(4);
  });

  it("every quick action has label, prompt, and icon", () => {
    for (const qa of AI_QUICK_ACTIONS) {
      expect(qa.label).toBeTruthy();
      expect(qa.prompt).toBeTruthy();
      expect(qa.prompt.length).toBeGreaterThan(10);
      expect(qa.icon).toBeTruthy();
    }
  });

  it("includes the canonical 'generate pitch' and 'follow-up' actions", () => {
    const labels = AI_QUICK_ACTIONS.map((qa) => qa.label.toLowerCase());
    expect(labels.some((l) => l.includes("pitch"))).toBe(true);
    expect(labels.some((l) => l.includes("follow-up"))).toBe(true);
  });

  it("includes the 'next tier' action", () => {
    const labels = AI_QUICK_ACTIONS.map((qa) => qa.label.toLowerCase());
    expect(labels.some((l) => l.includes("tier"))).toBe(true);
  });
});

describe("AI Assistant — service (mock fallback)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getConversations returns the mock list", async () => {
    const result = await aiService.getConversations();
    expect(result).toHaveLength(MOCK_AI_CONVERSATIONS.length);
  });

  it("every conversation has id, title, preview, channel", () => {
    for (const conv of MOCK_AI_CONVERSATIONS) {
      expect(conv.id).toBeTruthy();
      expect(conv.title).toBeTruthy();
      expect(conv.preview).toBeTruthy();
      expect(["WEB", "VOICE", "WHATSAPP"]).toContain(conv.channel);
    }
  });

  it("getMessages returns messages for an existing conversation", async () => {
    const messages = await aiService.getMessages("ai_001");
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]!.role).toBe("user");
  });

  it("getMessages returns empty array for unknown conversation", async () => {
    const messages = await aiService.getMessages("nonexistent");
    expect(messages).toEqual([]);
  });

  it("send returns an assistant message", async () => {
    const msg = await aiService.send("ai_001", "Hello!");
    expect(msg.role).toBe("assistant");
    expect(msg.content).toBeTruthy();
    expect(msg.content.length).toBeGreaterThan(0);
    expect(msg.createdAt).toBeTruthy();
  });

  it("assistant messages can include citations", () => {
    const messagesWithCitations = Object.values(MOCK_AI_MESSAGES)
      .flat()
      .filter((m) => m.citations && m.citations.length > 0);
    expect(messagesWithCitations.length).toBeGreaterThan(0);
    for (const msg of messagesWithCitations) {
      expect(msg.citations![0]!.source).toBeTruthy();
      expect(msg.citations![0]!.title).toBeTruthy();
    }
  });
});

describe("AI Assistant — message contract", () => {
  it("every message has id, role, content, and createdAt", () => {
    const allMessages = Object.values(MOCK_AI_MESSAGES).flat();
    for (const msg of allMessages) {
      expect(msg.id).toBeTruthy();
      expect(["user", "assistant", "system"]).toContain(msg.role);
      expect(msg.content).toBeTruthy();
      expect(msg.createdAt).toBeTruthy();
    }
  });

  it("conversations alternate user/assistant", () => {
    const messages = MOCK_AI_MESSAGES["ai_001"] ?? [];
    for (let i = 0; i < messages.length; i++) {
      const expected = i % 2 === 0 ? "user" : "assistant";
      expect(messages[i]!.role).toBe(expected);
    }
  });
});
