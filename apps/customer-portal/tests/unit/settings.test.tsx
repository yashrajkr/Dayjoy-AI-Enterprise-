import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the API hooks used by the Settings page.
const mockUpdatePrefs = vi.fn(() => Promise.resolve());
vi.mock("@/hooks/use-api", () => ({
  useNotificationPreferences: () => ({
    data: {
      channels: { email: true, sms: false, whatsapp: false, push: true },
      categories: {
        order: true,
        promotion: true,
        support: true,
        account: true,
      },
      quietHours: {
        enabled: false,
        startTime: "22:00",
        endTime: "07:00",
      },
    },
    isLoading: false,
  }),
  useUpdateNotificationPreferences: () => ({
    mutateAsync: mockUpdatePrefs,
    isPending: false,
  }),
}));

// Mock next-themes to avoid hydration warnings in jsdom.
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import SettingsPage from "@/app/(portal)/settings/page";

describe("Settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders all four tabs", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("tab", { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /language/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /privacy/i })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /notifications/i }),
    ).toBeInTheDocument();
  });

  it("defaults to the Theme tab", () => {
    render(<SettingsPage />);
    const themeTab = screen.getByRole("tab", { name: /theme/i });
    expect(themeTab).toHaveAttribute("data-state", "active");
  });

  it("shows three theme options on the Theme tab", () => {
    render(<SettingsPage />);
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();
  });

  it("switches to the Notifications tab on click", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: /notifications/i }));
    // The Notifications tab renders the "Channels" heading.
    expect(screen.getByText("Channels")).toBeInTheDocument();
    // And the channel labels.
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Push")).toBeInTheDocument();
  });

  it("renders the Privacy tab content on click", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: /privacy/i }));
    expect(screen.getByText("Cookie preferences")).toBeInTheDocument();
    expect(screen.getByText("Your data")).toBeInTheDocument();
    expect(screen.getByText("Delete account")).toBeInTheDocument();
  });

  it("renders the Language tab content on click", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: /language/i }));
    expect(screen.getByText("Language & Region")).toBeInTheDocument();
  });

  it("renders cookie preference rows on the Privacy tab", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: /privacy/i }));
    expect(screen.getByText("Essential")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Marketing")).toBeInTheDocument();
  });
});
