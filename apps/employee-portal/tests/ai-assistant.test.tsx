import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  pending?: boolean;
}

/**
 * AI Assistant chat fixture — exercises the contract that Agent 5's
 * real AI page will eventually implement:
 *   - empty state
 *   - user message echoed
 *   - assistant response (mocked streaming)
 *   - "Draft reply" action prefilled into the composer
 *   - "Summarise ticket" action returning a summary
 */
function AiAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  function push(msg: ChatMessage) {
    setMessages((m) => [...m, msg]);
  }
  function update(id: string, patch: Partial<ChatMessage>) {
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: "user", body: trimmed };
    push(userMsg);
    setInput("");
    setBusy(true);

    const assistantId = `a_${Date.now()}`;
    push({ id: assistantId, role: "assistant", body: "", pending: true });

    // Simulate a streamed response.
    await new Promise((r) => setTimeout(r, 50));
    const response = generateResponse(trimmed);
    update(assistantId, { body: response, pending: false });
    setBusy(false);
  }

  function generateResponse(prompt: string): string {
    const p = prompt.toLowerCase();
    if (p.includes("draft reply")) {
      return "Draft: Hi, thanks for reaching out! I've checked your account and your MFA settings look fine now. Could you try signing in again? Let me know if it persists.";
    }
    if (p.includes("summarise ticket")) {
      return "Summary: Customer reported an MFA loop on iOS Safari. We confirmed the issue is browser-cookie related. Suggested clearing cookies; awaiting customer confirmation.";
    }
    if (p.includes("find info") || p.includes("search kb")) {
      return "Found 3 KB articles matching your query. Top match: “Resetting MFA on mobile browsers” (KB-204).";
    }
    return `I'll help with that. Here's what I found for: "${prompt}".`;
  }

  function quickAction(action: "draft" | "summarise" | "search") {
    const map = {
      draft: "Draft reply for ticket TKT-5012",
      summarise: "Summarise ticket TKT-5012",
      search: "Find info: MFA reset on iOS",
    } as const;
    send(map[action]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Assistant</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" data-testid="qa-draft" onClick={() => quickAction("draft")}>
            Draft reply
          </Button>
          <Button size="sm" variant="outline" data-testid="qa-summarise" onClick={() => quickAction("summarise")}>
            Summarise ticket
          </Button>
          <Button size="sm" variant="outline" data-testid="qa-search" onClick={() => quickAction("search")}>
            Find info
          </Button>
        </div>

        <ScrollArea className="max-h-80" data-testid="conversation">
          {messages.length === 0 ? (
            <p data-testid="empty-state" className="py-8 text-center text-sm text-muted-foreground">
              No messages yet — ask me anything.
            </p>
          ) : (
            <ul>
              {messages.map((m) => (
                <li
                  key={m.id}
                  data-testid={`msg-${m.id}`}
                  data-role={m.role}
                  data-pending={m.pending ? "true" : undefined}
                >
                  <strong>{m.role}:</strong> {m.body || "…"}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mt-3 flex gap-2"
        >
          <Textarea
            data-testid="composer"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            rows={2}
          />
          <Button type="submit" data-testid="send" disabled={busy}>
            {busy ? "Thinking…" : "Send"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("AI Assistant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders an empty state before any message is sent", () => {
    renderWithProviders(<AiAssistant />);
    expect(screen.getByTestId("empty-state")).toHaveTextContent(/no messages yet/i);
  });

  it("echoes the user message into the conversation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiAssistant />);

    await user.type(screen.getByTestId("composer"), "What is my CSAT score?");
    await user.click(screen.getByTestId("send"));

    await waitFor(() => {
      const userMsg = document.querySelector('[data-role="user"]');
      expect(userMsg).toBeInTheDocument();
      expect(userMsg).toHaveTextContent(/what is my csat score/i);
    });
  });

  it("appends an assistant message after the user sends", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiAssistant />);

    await user.type(screen.getByTestId("composer"), "Find info: MFA reset");
    await user.click(screen.getByTestId("send"));

    await waitFor(() => {
      const assistantMsg = document.querySelector('[data-role="assistant"]');
      expect(assistantMsg).toBeInTheDocument();
      expect(assistantMsg).toHaveTextContent(/found \d+ kb articles/i);
    });
  });

  it("shows a pending placeholder while the assistant is 'thinking'", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiAssistant />);

    await user.type(screen.getByTestId("composer"), "Hello there");
    await user.click(screen.getByTestId("send"));

    // The composer is cleared immediately on send.
    expect(screen.getByTestId("composer")).toHaveValue("");
    // The send button shows the busy label briefly.
    expect(screen.getByTestId("send")).toHaveTextContent(/thinking/i);
    // Eventually the assistant message body is populated.
    await waitFor(() => {
      const assistantMsg = document.querySelector('[data-role="assistant"]');
      expect(assistantMsg).toHaveTextContent(/help with that/i);
    });
  });

  it("does not send an empty message", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiAssistant />);

    await user.click(screen.getByTestId("send"));
    // No user message should have been added.
    expect(document.querySelector('[data-role="user"]')).not.toBeInTheDocument();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("Draft reply quick action prefills a draft response", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiAssistant />);

    await user.click(screen.getByTestId("qa-draft"));

    await waitFor(() => {
      const assistantMsg = document.querySelector('[data-role="assistant"]');
      expect(assistantMsg).toBeInTheDocument();
      expect(assistantMsg).toHaveTextContent(/^draft:/i);
      expect(assistantMsg).toHaveTextContent(/mfa settings look fine now/i);
    });
  });

  it("Summarise ticket quick action returns a summary", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiAssistant />);

    await user.click(screen.getByTestId("qa-summarise"));

    await waitFor(() => {
      const assistantMsg = document.querySelector('[data-role="assistant"]');
      expect(assistantMsg).toHaveTextContent(/^summary:/i);
      expect(assistantMsg).toHaveTextContent(/mfa loop on ios safari/i);
    });
  });

  it("Find info quick action returns KB search results", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AiAssistant />);

    await user.click(screen.getByTestId("qa-search"));

    await waitFor(() => {
      const assistantMsg = document.querySelector('[data-role="assistant"]');
      expect(assistantMsg).toHaveTextContent(/found 3 kb articles/i);
    });
  });
});
