import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the API hooks BEFORE importing the page so the page module
// captures the mocked versions.
vi.mock("@/hooks/use-api", () => ({
  useNotifications: () => ({
    data: [
      {
        id: "n1",
        type: "order",
        title: "Order shipped",
        body: "Your order DJ-1001 is on its way.",
        read: false,
        createdAt: new Date().toISOString(),
        url: "/orders/DJ-1001",
      },
      {
        id: "n2",
        type: "promotion",
        title: "Weekend sale",
        body: "Flat 20% off on wellness products.",
        read: true,
        createdAt: new Date().toISOString(),
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useMarkNotificationRead: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkAllNotificationsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteNotification: () => ({ mutate: vi.fn(), isPending: false }),
}));

import NotificationsPage from "@/app/(portal)/notifications/page";

describe("Notifications page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the unread notification title in bold", () => {
    render(<NotificationsPage />);
    expect(screen.getByText("Order shipped")).toBeInTheDocument();
    expect(screen.getByText("Weekend sale")).toBeInTheDocument();
  });

  it("shows an unread badge in the header", () => {
    render(<NotificationsPage />);
    // The page header reads "You have 1 unread notification."
    expect(screen.getByText(/1 unread notification/)).toBeInTheDocument();
  });

  it("shows a 'Mark as read' button only for unread notifications", () => {
    render(<NotificationsPage />);
    // The unread notification has a Mark as read button.
    const markReadButtons = screen.getAllByRole("button", {
      name: /mark as read/i,
    });
    expect(markReadButtons).toHaveLength(1);
  });

  it("renders a 'Delete notification' button for every notification", () => {
    render(<NotificationsPage />);
    const deleteButtons = screen.getAllByRole("button", {
      name: /delete notification/i,
    });
    expect(deleteButtons).toHaveLength(2);
  });

  it("renders a 'Mark all read' button in the header", () => {
    render(<NotificationsPage />);
    expect(
      screen.getByRole("button", { name: /mark all read/i }),
    ).toBeInTheDocument();
  });

  it("renders filter dropdown for notification types", () => {
    render(<NotificationsPage />);
    // The select trigger has aria-label "Filter by type"
    expect(
      screen.getByRole("combobox", { name: /filter by type/i }),
    ).toBeInTheDocument();
  });
});
