import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatMessageBubble } from "@/components/ai/chat-message";
import { ChatTyping } from "@/components/ai/chat-typing";
import { CitationCard } from "@/components/ai/citation-card";
import type { ChatMessage, Citation } from "@/types";

/**
 * AI chat component tests — exercise the bubble, typing indicator,
 * and citation card. The streaming ChatWindow is covered by the
 * integration test.
 */

const userMessage: ChatMessage = {
  id: "u1",
  conversationId: "c1",
  role: "user",
  content: "Track my recent order",
  createdAt: new Date().toISOString(),
};

const assistantMessage: ChatMessage = {
  id: "a1",
  conversationId: "c1",
  role: "assistant",
  content:
    "Your order **DJ-1001** is **out for delivery**.\n\nIt should arrive by 6 PM today.",
  createdAt: new Date().toISOString(),
  citations: [
    {
      id: "cit1",
      documentTitle: "Shipping Policy",
      snippet: "Orders are delivered within 3–5 business days.",
      source: "knowledge-base",
      score: 0.92,
      url: "https://dayjoy.ai/legal/shipping",
    },
  ],
};

describe("ChatMessageBubble — user", () => {
  it("renders the user's content right-aligned", () => {
    render(<ChatMessageBubble message={userMessage} userName="Jane" />);
    expect(screen.getByText("Track my recent order")).toBeInTheDocument();
    expect(screen.getByText("Jane")).toBeInTheDocument();
  });
});

describe("ChatMessageBubble — assistant", () => {
  it("renders markdown content (bold, paragraphs)", () => {
    render(<ChatMessageBubble message={assistantMessage} />);
    expect(screen.getByText("DJ-1001")).toBeInTheDocument();
    expect(screen.getByText("out for delivery")).toBeInTheDocument();
    expect(screen.getByText("Dayjoy AI Assistant")).toBeInTheDocument();
  });

  it("renders citation cards when present", () => {
    render(<ChatMessageBubble message={assistantMessage} />);
    expect(screen.getByText("Shipping Policy")).toBeInTheDocument();
    expect(screen.getByText(/delivered within 3/)).toBeInTheDocument();
    expect(screen.getByText("Match: 92%")).toBeInTheDocument();
  });

  it("shows Copy + Listen actions", () => {
    render(<ChatMessageBubble message={assistantMessage} speakEnabled />);
    expect(screen.getByRole("button", { name: /copy response/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /read response aloud/i }),
    ).toBeInTheDocument();
  });

  it("hides Listen when speakEnabled is false", () => {
    render(<ChatMessageBubble message={assistantMessage} speakEnabled={false} />);
    expect(
      screen.queryByRole("button", { name: /read response aloud/i }),
    ).not.toBeInTheDocument();
  });
});

describe("ChatTyping", () => {
  it("renders an accessible status", () => {
    render(<ChatTyping />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/Assistant is typing/i)).toBeInTheDocument();
  });

  it("renders three bouncing dots", () => {
    const { container } = render(<ChatTyping />);
    const dots = container.querySelectorAll(".bg-primary");
    expect(dots.length).toBeGreaterThanOrEqual(3);
  });
});

describe("CitationCard", () => {
  const citation: Citation = {
    id: "c1",
    documentTitle: "Return Policy",
    snippet: "Returns are accepted within 15 days of delivery.",
    source: "support",
    score: 0.88,
    url: "https://dayjoy.ai/legal/returns",
  };

  it("renders the document title and snippet", () => {
    render(<CitationCard citation={citation} index={0} />);
    expect(screen.getByText("Return Policy")).toBeInTheDocument();
    expect(
      screen.getByText(/Returns are accepted within 15 days/),
    ).toBeInTheDocument();
  });

  it("renders a 'Read more' link when url is present", () => {
    render(<CitationCard citation={citation} />);
    const link = screen.getByRole("link", { name: /read more/i });
    expect(link).toHaveAttribute("href", "https://dayjoy.ai/legal/returns");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("hides 'Read more' when url is absent", () => {
    const noUrl = { ...citation, url: undefined };
    render(<CitationCard citation={noUrl} />);
    expect(
      screen.queryByRole("link", { name: /read more/i }),
    ).not.toBeInTheDocument();
  });
});

// Avoid unused import warning
void vi;
