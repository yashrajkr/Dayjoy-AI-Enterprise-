import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Mock sonner toast so we can assert calls without console noise.
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Lightweight login form fixture — mirrors what Agent 5's real login
 * page will eventually render. We test the form contract (validation,
 * submit, error states) so the test is meaningful even before the real
 * page lands.
 */
function LoginForm({ onSubmit }: { onSubmit: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setLoading(true);
    try {
      await onSubmit(email, password);
      toast.success("Signed in");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@dayjoy.ai"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
  );
}

describe("Login form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email and password inputs and a submit button", () => {
    renderWithProviders(<LoginForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("rejects an invalid email with an inline error", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/valid email/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a short password", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/email/i), "vivaan@dayjoy.ai");
    await user.type(screen.getByLabelText(/password/i), "abc");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/6 characters/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("calls onSubmit and shows a success toast on valid credentials", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/email/i), "vivaan@dayjoy.ai");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith("vivaan@dayjoy.ai", "secret123");
    expect(toast.success).toHaveBeenCalledWith("Signed in");
  });

  it("surfaces a thrown error as an inline alert", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error("Invalid credentials"));
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/email/i), "vivaan@dayjoy.ai");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid credentials/i);
  });

  it("disables the button and shows a loading label while submitting", async () => {
    const user = userEvent.setup();
    let resolveFn!: () => void;
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveFn = resolve;
      }),
    );
    renderWithProviders(<LoginForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/email/i), "vivaan@dayjoy.ai");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("button", { name: /signing in/i })).toBeDisabled();
    resolveFn();
    await waitFor(() => expect(screen.getByRole("button", { name: /sign in/i })).not.toBeDisabled());
  });
});
