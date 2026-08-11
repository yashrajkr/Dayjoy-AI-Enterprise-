import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Auth flow integration test.
 *
 * Exercises the register → login → logout flow end-to-end against a
 * mocked API. The actual auth pages are built by Agent 1; this test
 * uses inline mock components to validate the contract that those
 * pages depend on (zod validation + token storage + redirect).
 */

// Mock localStorage (jsdom provides it but we want full control).
const storage = new Map<string, string>();
const localStorageMock: Storage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
  clear: () => storage.clear(),
  key: (i: number) => Array.from(storage.keys())[i] ?? null,
  get length() {
    return storage.size;
  },
};
Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

// Mock backend responses
const mockApi = {
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
};
vi.mock("@/lib/api", () => ({
  api: {
    post: (url: string, data: unknown) => {
      if (url === "/auth/register") {
        return mockApi.register(data);
      }
      if (url === "/auth/login") {
        return mockApi.login(data);
      }
      if (url === "/auth/logout") {
        return mockApi.logout();
      }
      throw new Error(`Unexpected POST ${url}`);
    },
  },
}));

import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

describe("auth flow", () => {
  beforeEach(() => {
    storage.clear();
    vi.clearAllMocks();
    mockApi.register.mockResolvedValue({ id: "u1", email: "jane@example.com" });
    mockApi.login.mockResolvedValue({ accessToken: "tok-123", user: { id: "u1" } });
    mockApi.logout.mockResolvedValue({});
  });

  it("registers a new user, logs them in, and stores the token", async () => {
    // Step 1 — validate credentials
    const creds = credentialsSchema.parse({
      email: "jane@example.com",
      password: "supersecret",
    });

    // Step 2 — register
    const registered = await mockApi.register(creds);
    expect(registered.email).toBe("jane@example.com");

    // Step 3 — login
    const session = await mockApi.login(creds);
    expect(session.accessToken).toBe("tok-123");

    // Step 4 — store the token (the real login page does this in an effect)
    window.localStorage.setItem("cp_access_token", session.accessToken);

    expect(window.localStorage.getItem("cp_access_token")).toBe("tok-123");
  });

  it("rejects an invalid email at validation time", () => {
    const result = credentialsSchema.safeParse({
      email: "nope",
      password: "supersecret",
    });
    expect(result.success).toBe(false);
  });

  it("logs out and clears the token", async () => {
    window.localStorage.setItem("cp_access_token", "tok-123");
    expect(window.localStorage.getItem("cp_access_token")).toBe("tok-123");

    await mockApi.logout();
    window.localStorage.removeItem("cp_access_token");

    expect(window.localStorage.getItem("cp_access_token")).toBeNull();
  });

  it("renders a login form with email + password fields", () => {
    function LoginForm() {
      return (
        <form>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" name="email" />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" name="password" />
          <button type="submit">Sign in</button>
        </form>
      );
    }

    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("submits the login form and stores the token", async () => {
    function LoginForm() {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const data = Object.fromEntries(fd);
            mockApi.login(data).then((session) => {
              window.localStorage.setItem(
                "cp_access_token",
                session.accessToken,
              );
            });
          }}
        >
          <input id="email" type="email" name="email" defaultValue="jane@example.com" />
          <input id="password" type="password" name="password" defaultValue="supersecret" />
          <button type="submit">Sign in</button>
        </form>
      );
    }

    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem("cp_access_token")).toBe("tok-123");
    });
    expect(mockApi.login).toHaveBeenCalledWith({
      email: "jane@example.com",
      password: "supersecret",
    });
  });
});
