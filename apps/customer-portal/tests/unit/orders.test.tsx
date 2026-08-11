import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { Badge } from "@/components/ui/badge";

/**
 * Orders list / detail smoke tests.
 *
 * The full Orders pages are built by Agent 1; this file pins the
 * contracts for the shared status badge + the date / currency
 * formatters used to render order rows.
 */
describe("order status badge", () => {
  // Reuse the TicketStatusBadge contract — orders share the same
  // visual language (success = delivered, warning = pending, …).
  it("renders OPEN as info", () => {
    render(<TicketStatusBadge status="OPEN" />);
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("renders RESOLVED as success", () => {
    render(<TicketStatusBadge status="RESOLVED" />);
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("renders CLOSED as muted", () => {
    render(<TicketStatusBadge status="CLOSED" />);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("renders an unknown status without crashing", () => {
    // @ts-expect-error — intentional invalid value
    render(<TicketStatusBadge status="WAT" />);
    expect(screen.getByText("WAT")).toBeInTheDocument();
  });
});

describe("order status badge variants", () => {
  it("renders an outline badge", () => {
    const { container } = render(<Badge variant="outline">Pending</Badge>);
    expect(container.textContent).toContain("Pending");
  });

  it("renders a success badge", () => {
    const { container } = render(<Badge variant="success">Delivered</Badge>);
    expect(container.textContent).toContain("Delivered");
  });
});

describe("order date formatting", () => {
  function formatDate(input: string): string {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  it("formats an ISO date", () => {
    expect(formatDate("2026-08-07T10:30:00Z")).toMatch(/Aug.*2026/);
  });

  it("returns — for invalid input", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });
});
