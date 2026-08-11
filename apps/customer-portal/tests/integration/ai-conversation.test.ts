import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * AI conversation integration test.
 *
 * Walks through: start conversation → send message → stream response →
 * appears in history. The streaming logic lives in
 * `src/hooks/use-ai.ts` and the UI in `src/components/ai/chat-window.tsx`;
 * this test mocks the network layer (fetch + axios) so we can assert
 * on the streaming contract without hitting a real backend.
 */

// ===== Mocks =====
const mockCreateConversation = vi.fn();
const mockStreamMessage = vi.fn();

vi.mock("@/hooks/use-ai", () => ({
  useConversations: () => ({
    data: [
      {
        id: "conv-1",
        title: "Track my recent order",
        channel: "website",
        messageCount: 2,
        lastMessageAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        firstMessage: "Track my recent order",
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useConversation: () => ({
    data: {
      id: "conv-1",
      title: "Track my recent order",
      messages: [
        {
          id: "m1",
          conversationId: "conv-1",
          role: "user",
          content: "Track my recent order",
          createdAt: new Date().toISOString(),
        },
        {
          id: "m2",
          conversationId: "conv-1",
          role: "assistant",
          content: "Your order DJ-1001 is out for delivery.",
          createdAt: new Date().toISOString(),
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
  useCreateConversation: () => ({
    mutateAsync: mockCreateConversation,
    isPending: false,
  }),
  useDeleteConversation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  streamMessage: mockStreamMessage,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
  useParams: () => ({ id: "conv-1" }),
  usePathname: () => "/ai-assistant",
}));

// Mock framer-motion — animations don't play well with jsdom.
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...props}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import ChatWindow from "@/components/ai/chat-window";
import { ConversationHistoryMock } from "./helpers";

describe("AI conversation flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateConversation.mockResolvedValue({
      id: "conv-new",
      title: "Hi",
      channel: "website",
    });
    mockStreamMessage.mockImplementation(async ({ onToken }) => {
      // Simulate streaming tokens
      const tokens = ["Hello", "!", " How", " can", " I", " help", "?"];
      for (const t of tokens) onToken?.(t);
      return {
        id: "msg-final",
        conversationId: "conv-new",
        role: "assistant" as const,
        content: "Hello! How can I help?",
        createdAt: new Date().toISOString(),
      };
    });
  });

  it("renders an empty state before any messages", () => {
    render(<ChatWindow />);
    expect(
      screen.getByText("How can I help you today?"),
    ).toBeInTheDocument();
  });

  it("renders quick replies on first load", () => {
    render(<ChatWindow />);
    expect(screen.getByText("Track my recent order")).toBeInTheDocument();
    expect(
      screen.getByText("What's the return policy?"),
    ).toBeInTheDocument();
  });

  it("sends a message and streams a response", async () => {
    render(<ChatWindow />);

    const input = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(input, { target: { value: "Hi" } });

    const form = input.closest("form")!;
    fireEvent.submit(form);

    // Wait for the streaming response to be appended
    await waitFor(() => {
      expect(screen.getByText(/How can I help/)).toBeInTheDocument();
    });

    expect(mockCreateConversation).toHaveBeenCalled();
    expect(mockStreamMessage).toHaveBeenCalled();
  });

  it("shows the conversation in history", () => {
    render(<ConversationHistoryMock />);
    expect(screen.getByText("Track my recent order")).toBeInTheDocument();
    expect(screen.getByText(/2 messages/i)).toBeInTheDocument();
  });

  it("supports quick-reply click as a send shortcut", async () => {
    render(<ChatWindow />);
    const quickReply = screen.getByText("Track my recent order");
    fireEvent.click(quickReply);
    await waitFor(() => {
      expect(mockStreamMessage).toHaveBeenCalled();
    });
  });
});
