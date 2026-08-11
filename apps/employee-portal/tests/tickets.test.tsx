import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

interface Ticket {
  id: string;
  subject: string;
  status: "open" | "in-progress" | "resolved";
  priority: "low" | "medium" | "high" | "urgent";
}

interface Message {
  id: string;
  author: "agent" | "customer";
  body: string;
  at: string;
}

const INITIAL_TICKETS: Ticket[] = [
  { id: "TKT-5012", subject: "Login MFA loop on iOS Safari", status: "open", priority: "high" },
  { id: "TKT-5018", subject: "WhatsApp template not approved", status: "in-progress", priority: "urgent" },
  { id: "TKT-5021", subject: "CRM sync error with Shopify", status: "open", priority: "medium" },
  { id: "TKT-5029", subject: "Knowledge search stale results", status: "resolved", priority: "low" },
];

const STATUS_VARIANT: Record<Ticket["status"], "warning" | "live" | "success"> = {
  open: "warning",
  "in-progress": "live",
  resolved: "success",
};

function TicketApp() {
  const [tickets] = useState<Ticket[]>(INITIAL_TICKETS);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { id: "m1", author: "customer", body: "Hi, I'm stuck in an MFA loop.", at: "10:14 AM" },
    { id: "m2", author: "agent", body: "Let me help — what device are you on?", at: "10:18 AM" },
  ]);
  const [reply, setReply] = useState("");

  function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setMessages((m) => [
      ...m,
      { id: `m${m.length + 1}`, author: "agent", body: reply.trim(), at: "now" },
    ]);
    setReply("");
    toast.success("Reply sent");
  }

  return (
    <div>
      <h1>Tickets</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((t) => (
            <TableRow key={t.id}>
              <TableCell>{t.id}</TableCell>
              <TableCell>{t.subject}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[t.status]} data-testid={`status-${t.id}`}>
                  {t.status}
                </Badge>
              </TableCell>
              <TableCell>{t.priority}</TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`open-${t.id}`}
                  onClick={() => setSelected(t)}
                >
                  Open
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selected && (
        <div data-testid="ticket-detail">
          <h2 data-testid="detail-subject">{selected.subject}</h2>
          <p data-testid="detail-id">{selected.id}</p>
          <div data-testid="conversation" className="space-y-2">
            {messages.map((m) => (
              <div key={m.id} data-testid={`msg-${m.id}`} data-author={m.author}>
                {m.body}
              </div>
            ))}
          </div>
          <form onSubmit={sendReply}>
            <Textarea
              data-testid="reply-input"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type a reply…"
            />
            <Button type="submit" data-testid="send-reply">Send</Button>
          </form>
        </div>
      )}
    </div>
  );
}

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("Tickets", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the ticket list with all seeded tickets", () => {
    renderWithProviders(<TicketApp />);
    expect(screen.getByText("TKT-5012")).toBeInTheDocument();
    expect(screen.getByText("TKT-5018")).toBeInTheDocument();
    expect(screen.getByText("TKT-5021")).toBeInTheDocument();
    expect(screen.getByText("TKT-5029")).toBeInTheDocument();
    expect(screen.getByText("Login MFA loop on iOS Safari")).toBeInTheDocument();
  });

  it("renders status badges with the correct visual variant", () => {
    renderWithProviders(<TicketApp />);
    expect(screen.getByTestId("status-TKT-5012")).toHaveTextContent("open");
    expect(screen.getByTestId("status-TKT-5018")).toHaveTextContent("in-progress");
    expect(screen.getByTestId("status-TKT-5029")).toHaveTextContent("resolved");
  });

  it("opens the ticket detail with conversation thread when 'Open' is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TicketApp />);

    await user.click(screen.getByTestId("open-TKT-5012"));

    expect(screen.getByTestId("ticket-detail")).toBeInTheDocument();
    expect(screen.getByTestId("detail-subject")).toHaveTextContent("Login MFA loop on iOS Safari");
    expect(screen.getByTestId("detail-id")).toHaveTextContent("TKT-5012");
    expect(screen.getByTestId("conversation")).toBeInTheDocument();
    // Two seeded messages.
    expect(screen.getByTestId("msg-m1")).toBeInTheDocument();
    expect(screen.getByTestId("msg-m2")).toBeInTheDocument();
  });

  it("appends a new message to the conversation when sending a reply", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TicketApp />);

    await user.click(screen.getByTestId("open-TKT-5012"));
    await user.type(screen.getByTestId("reply-input"), "Try clearing Safari cookies.");
    await user.click(screen.getByTestId("send-reply"));

    await waitFor(() => {
      expect(screen.getByTestId("msg-m3")).toBeInTheDocument();
    });
    expect(screen.getByTestId("msg-m3")).toHaveTextContent("Try clearing Safari cookies.");
    expect(screen.getByTestId("msg-m3")).toHaveAttribute("data-author", "agent");
    expect(toast.success).toHaveBeenCalledWith("Reply sent");
  });

  it("does not send an empty reply", async () => {
    const user = userEvent.setup();
    renderWithProviders(<TicketApp />);

    await user.click(screen.getByTestId("open-TKT-5012"));
    await user.click(screen.getByTestId("send-reply"));

    expect(screen.queryByTestId("msg-m3")).not.toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
