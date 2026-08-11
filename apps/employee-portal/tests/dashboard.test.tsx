import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardPage from "@/app/(portal)/page";

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
  );
}

describe("Dashboard", () => {
  it("renders the welcome header", () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });

  it("renders the four KPI cards with values", () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText("Tasks Completed (Today)")).toBeInTheDocument();
    expect(screen.getByText("Open Tickets")).toBeInTheDocument();
    expect(screen.getByText("Leads in Pipeline")).toBeInTheDocument();
    expect(screen.getByText(/Avg CSAT/i)).toBeInTheDocument();
    // The mock KPIs include a "6" for tasks completed today.
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("4.6")).toBeInTheDocument();
  });

  it("renders the Quick links section with all expected navigation cards", () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText("Quick links")).toBeInTheDocument();
    const expected = [
      "Tasks",
      "Tickets",
      "AI Assistant",
      "Attendance",
      "Reports",
      "Analytics",
      "Team",
      "Profile",
      "Settings",
    ];
    for (const label of expected) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders the AI Assistant promo card with a link to /ai", () => {
    renderWithProviders(<DashboardPage />);
    expect(screen.getByText(/try the ai assistant/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open ai assistant/i })).toHaveAttribute("href", "/ai");
  });

  it("renders a live badge with the current weekday", () => {
    renderWithProviders(<DashboardPage />);
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    expect(screen.getByText(new RegExp(today))).toBeInTheDocument();
  });
});
